//! Identity (ADR-002): Entra ID authorization code + PKCE in Rust, system
//! browser, `loop://auth/callback` deep link, refresh token in the OS
//! credential store. Tokens never reach the webview; the UI sees `Session`.
//!
//! In `AuthMode::Mock` (development against the mock orchestrator) the
//! session comes from `GET /session` and there are no tokens at all.

mod keychain;

use std::time::Duration;

use oauth2::{
    basic::{BasicErrorResponse, BasicRevocationErrorResponse, BasicTokenIntrospectionResponse, BasicTokenType},
    AuthUrl, AuthorizationCode, ClientId, CsrfToken, EndpointNotSet, EndpointSet, ExtraTokenFields, PkceCodeChallenge,
    RedirectUrl, RefreshToken, Scope, StandardRevocableToken, StandardTokenResponse, TokenResponse, TokenUrl,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::sync::oneshot;
use url::Url;

use crate::{
    api,
    config::{AuthMode, EntraConfig},
    error::{IpcError, IpcResult},
    ipc::types::{Session, SessionState, SignOutReason},
};
use keychain::{Keychain, StoredCredential};

const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
/// Refresh this long before the access token expires (shell-architecture §6.3).
pub const REFRESH_LEAD: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IdTokenFields {
    #[serde(default)]
    id_token: Option<String>,
}
impl ExtraTokenFields for IdTokenFields {}

type LoopTokenResponse = StandardTokenResponse<IdTokenFields, BasicTokenType>;
type LoopClient = oauth2::Client<
    BasicErrorResponse,
    LoopTokenResponse,
    BasicTokenIntrospectionResponse,
    StandardRevocableToken,
    BasicRevocationErrorResponse,
    EndpointSet,    // auth url
    EndpointNotSet, // device auth url
    EndpointNotSet, // introspection url
    EndpointNotSet, // revocation url
    EndpointSet,    // token url
>;

/// Claims we read from the id_token for display only. Authorisation happens
/// server-side against the access token; nothing here is trusted for access.
#[derive(Debug, Default, Deserialize)]
struct IdClaims {
    #[serde(default)]
    oid: Option<String>,
    #[serde(default)]
    sub: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    preferred_username: Option<String>,
    #[serde(default)]
    tid: Option<String>,
}

pub struct Auth {
    mode: AuthMode,
    api: api::Client,
    session: Mutex<Session>,
    /// Waiter for the browser callback during an interactive sign-in.
    pending: Mutex<Option<oneshot::Sender<Url>>>,
    keychain: Option<Keychain>,
    /// Epoch ms when the current access token expires (Entra mode).
    expires_at_ms: Mutex<Option<f64>>,
}

impl Auth {
    pub fn new(mode: AuthMode, api: api::Client) -> Self {
        let keychain = match &mode {
            AuthMode::Entra(cfg) => Some(Keychain::new(cfg.tenant_id.clone())),
            AuthMode::Mock => None,
        };
        Self {
            mode,
            api,
            session: Mutex::new(Session::default()),
            pending: Mutex::new(None),
            keychain,
            expires_at_ms: Mutex::new(None),
        }
    }

    pub fn session(&self) -> Session {
        self.session.lock().clone()
    }

    pub fn is_signed_in(&self) -> bool {
        self.session.lock().is_signed_in()
    }

    fn set_session(&self, session: Session) -> Session {
        *self.session.lock() = session.clone();
        session
    }

    /// Startup: restore a session without user interaction, if possible.
    pub async fn restore(&self) -> Session {
        match &self.mode {
            AuthMode::Mock => match self.api.session().await {
                Ok(s) => self.set_session(s),
                Err(err) => {
                    log::warn!("mock session unavailable: {err}");
                    self.set_session(Session::signed_out(Some(SignOutReason::Error)))
                }
            },
            AuthMode::Entra(cfg) => {
                let Some(cred) = self.keychain.as_ref().and_then(Keychain::load) else {
                    return self.set_session(Session::signed_out(None));
                };
                match self.refresh_with(cfg, &cred).await {
                    Ok(session) => session,
                    Err(err) => {
                        log::warn!("silent refresh failed: {err}");
                        self.keychain.as_ref().map(Keychain::clear);
                        self.set_session(Session::signed_out(Some(SignOutReason::Expired)))
                    }
                }
            }
        }
    }

    /// Interactive sign-in. Resolves when the browser callback arrives.
    pub async fn sign_in(&self, _app: &AppHandle) -> IpcResult<Session> {
        match &self.mode {
            AuthMode::Mock => {
                let s = self.api.session().await?;
                Ok(self.set_session(s))
            }
            AuthMode::Entra(cfg) => {
                self.set_session(Session::signing_in());
                match self.sign_in_entra(cfg).await {
                    Ok(session) => Ok(session),
                    Err(err) => {
                        self.set_session(Session::signed_out(Some(SignOutReason::Error)));
                        Err(err)
                    }
                }
            }
        }
    }

    /// Clear local credentials and, for Entra, end the browser session.
    pub async fn sign_out(&self, reason: SignOutReason) -> Session {
        self.api.set_token(None);
        *self.expires_at_ms.lock() = None;
        if let Some(k) = &self.keychain {
            k.clear();
        }
        if let AuthMode::Entra(cfg) = &self.mode {
            if reason == SignOutReason::User {
                let end = format!(
                    "https://login.microsoftonline.com/{}/oauth2/v2.0/logout?post_logout_redirect_uri={}",
                    cfg.tenant_id, cfg.redirect_uri
                );
                if let Ok(url) = Url::parse(&end) {
                    let _ = crate::native::open_url(&url);
                }
            }
        }
        self.set_session(Session::signed_out(Some(reason)))
    }

    /// Deep-link entry point: `loop://auth/callback?code=...&state=...`.
    pub fn handle_callback(&self, url: Url) -> bool {
        if url.scheme() != "loop" || url.host_str() != Some("auth") || url.path() != "/callback" {
            return false;
        }
        match self.pending.lock().take() {
            Some(tx) => {
                let _ = tx.send(url);
                true
            }
            None => {
                log::warn!("auth callback arrived with no sign-in pending");
                false
            }
        }
    }

    /// Milliseconds until the token should be refreshed; `None` when not applicable.
    pub fn refresh_due_in_ms(&self) -> Option<f64> {
        let exp = (*self.expires_at_ms.lock())?;
        Some((exp - crate::now_epoch_ms() - REFRESH_LEAD.as_millis() as f64).max(0.0))
    }

    /// Silent refresh from the stored refresh token (Entra only).
    pub async fn refresh(&self) -> IpcResult<Session> {
        match &self.mode {
            AuthMode::Mock => Ok(self.session()),
            AuthMode::Entra(cfg) => {
                let cred = self.keychain.as_ref().and_then(Keychain::load).ok_or_else(IpcError::unauthenticated)?;
                self.refresh_with(cfg, &cred).await
            }
        }
    }

    // ---- Entra internals ----------------------------------------------------

    fn client(cfg: &EntraConfig) -> IpcResult<LoopClient> {
        let base = format!("https://login.microsoftonline.com/{}/oauth2/v2.0", cfg.tenant_id);
        let client = oauth2::Client::new(ClientId::new(cfg.client_id.clone()))
            .set_auth_uri(AuthUrl::new(format!("{base}/authorize")).map_err(|e| IpcError::internal(e.to_string()))?)
            .set_token_uri(TokenUrl::new(format!("{base}/token")).map_err(|e| IpcError::internal(e.to_string()))?)
            .set_redirect_uri(
                RedirectUrl::new(cfg.redirect_uri.clone()).map_err(|e| IpcError::internal(e.to_string()))?,
            );
        Ok(client)
    }

    fn http() -> IpcResult<reqwest::Client> {
        // No redirects: SSRF hardening recommended by the oauth2 crate.
        reqwest::ClientBuilder::new()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| IpcError::internal(e.to_string()))
    }

    fn scopes(cfg: &EntraConfig) -> Vec<Scope> {
        ["openid", "profile", "offline_access", cfg.api_scope.as_str()]
            .into_iter()
            .map(|s| Scope::new(s.to_owned()))
            .collect()
    }

    async fn sign_in_entra(&self, cfg: &EntraConfig) -> IpcResult<Session> {
        let client = Self::client(cfg)?;
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let mut auth = client.authorize_url(CsrfToken::new_random).set_pkce_challenge(challenge);
        for scope in Self::scopes(cfg) {
            auth = auth.add_scope(scope);
        }
        let (url, csrf) = auth.url();

        let (tx, rx) = oneshot::channel();
        *self.pending.lock() = Some(tx);
        crate::native::open_url(&url).map_err(|e| IpcError::internal(format!("Could not open the browser: {e}")))?;

        let callback = match tokio::time::timeout(SIGN_IN_TIMEOUT, rx).await {
            Ok(Ok(url)) => url,
            Ok(Err(_)) => return Err(IpcError::internal("Sign-in was cancelled.")),
            Err(_) => {
                self.pending.lock().take();
                return Err(IpcError::new(crate::error::IpcErrorCode::Timeout, "Sign-in timed out.", true));
            }
        };

        let mut code = None;
        let mut state = None;
        let mut error = None;
        for (k, v) in callback.query_pairs() {
            match k.as_ref() {
                "code" => code = Some(v.into_owned()),
                "state" => state = Some(v.into_owned()),
                "error_description" | "error" => error = Some(v.into_owned()),
                _ => {}
            }
        }
        if let Some(err) = error {
            return Err(IpcError::new(crate::error::IpcErrorCode::Rejected, err, false));
        }
        if state.as_deref() != Some(csrf.secret().as_str()) {
            return Err(IpcError::internal("Sign-in state mismatch; please try again."));
        }
        let code = code.ok_or_else(|| IpcError::invalid("Sign-in callback carried no code."))?;

        let http = Self::http()?;
        let token = client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(verifier)
            .request_async(&http)
            .await
            .map_err(|e| {
                IpcError::new(crate::error::IpcErrorCode::Rejected, format!("Token exchange failed: {e}"), true)
            })?;

        self.apply_token(cfg, &token, None)
    }

    async fn refresh_with(&self, cfg: &EntraConfig, cred: &StoredCredential) -> IpcResult<Session> {
        let client = Self::client(cfg)?;
        let http = Self::http()?;
        let refresh_token = RefreshToken::new(cred.refresh_token.clone());
        let mut req = client.exchange_refresh_token(&refresh_token);
        for scope in Self::scopes(cfg) {
            req = req.add_scope(scope);
        }
        let token = req.request_async(&http).await.map_err(|e| {
            IpcError::new(crate::error::IpcErrorCode::Unauthenticated, format!("Refresh failed: {e}"), false)
        })?;
        self.apply_token(cfg, &token, Some(cred))
    }

    fn apply_token(
        &self,
        cfg: &EntraConfig,
        token: &LoopTokenResponse,
        previous: Option<&StoredCredential>,
    ) -> IpcResult<Session> {
        let claims = token.extra_fields().id_token.as_deref().map(decode_claims).unwrap_or_default();
        let user_id = claims
            .oid
            .or(claims.sub)
            .or_else(|| previous.map(|p| p.user_id.clone()))
            .ok_or_else(|| IpcError::internal("Token carried no user identifier."))?;
        let display_name = claims.name.or_else(|| previous.and_then(|p| p.display_name.clone()));
        let upn = claims.preferred_username.or_else(|| previous.and_then(|p| p.upn.clone()));

        let expires_in = token.expires_in().unwrap_or(Duration::from_secs(3600));
        let expires_at_ms = crate::now_epoch_ms() + expires_in.as_millis() as f64;
        *self.expires_at_ms.lock() = Some(expires_at_ms);
        self.api.set_token(Some(token.access_token().secret().clone()));

        let refresh_token =
            token.refresh_token().map(|t| t.secret().clone()).or_else(|| previous.map(|p| p.refresh_token.clone()));
        if let (Some(k), Some(rt)) = (&self.keychain, refresh_token) {
            let cred = StoredCredential {
                refresh_token: rt,
                user_id: user_id.clone(),
                display_name: display_name.clone(),
                upn: upn.clone(),
            };
            if let Err(err) = k.save(&cred) {
                log::warn!("keychain write failed: {err}");
            }
        }

        Ok(self.set_session(Session {
            state: SessionState::SignedIn,
            user_id: Some(user_id),
            display_name,
            upn,
            tenant_id: Some(claims.tid.unwrap_or_else(|| cfg.tenant_id.clone())),
            expires_at: Some(crate::iso_from_epoch_ms(expires_at_ms)),
            reason: None,
        }))
    }
}

/// Decode the JWT payload segment (base64url, unverified: display claims only).
fn decode_claims(id_token: &str) -> IdClaims {
    let Some(payload) = id_token.split('.').nth(1) else { return IdClaims::default() };
    let Some(bytes) = base64url_decode(payload) else { return IdClaims::default() };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn base64url_decode(input: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a') as u32 + 26,
            b'0'..=b'9' => (c - b'0') as u32 + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            _ => return None,
        })
    }
    let bytes = input.trim_end_matches('=').as_bytes();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let mut acc: u32 = 0;
        for (i, &c) in chunk.iter().enumerate() {
            acc |= val(c)? << (18 - 6 * i);
        }
        let n = chunk.len();
        if n >= 2 {
            out.push((acc >> 16) as u8);
        }
        if n >= 3 {
            out.push((acc >> 8) as u8);
        }
        if n == 4 {
            out.push(acc as u8);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_base64url_without_padding() {
        assert_eq!(base64url_decode("aGVsbG8").unwrap(), b"hello");
        assert_eq!(base64url_decode("eyJhIjoxfQ").unwrap(), br#"{"a":1}"#);
    }

    #[test]
    fn reads_display_claims_from_an_unsigned_token() {
        // header.payload.signature with payload {"oid":"u1","name":"Sara","tid":"t1"}
        let payload = "eyJvaWQiOiJ1MSIsIm5hbWUiOiJTYXJhIiwidGlkIjoidDEifQ";
        let claims = decode_claims(&format!("x.{payload}.y"));
        assert_eq!(claims.oid.as_deref(), Some("u1"));
        assert_eq!(claims.name.as_deref(), Some("Sara"));
        assert_eq!(claims.tid.as_deref(), Some("t1"));
    }

    #[test]
    fn callback_url_shape_is_checked() {
        let cfg = AuthMode::Mock;
        let api = api::Client::new(Url::parse("http://127.0.0.1:1").unwrap()).unwrap();
        let auth = Auth::new(cfg, api);
        assert!(!auth.handle_callback(Url::parse("https://evil.example/callback?code=x").unwrap()));
        assert!(!auth.handle_callback(Url::parse("loop://auth/callback?code=x").unwrap()), "nothing pending");
    }
}
