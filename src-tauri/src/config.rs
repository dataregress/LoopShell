//! Build-time defaults with environment overrides. The only place backend
//! URLs live (docs/shell-architecture.md §6.1). Remote config (kill switch)
//! layers on top at runtime once the orchestrator exposes it.

use std::env;

use url::Url;

#[derive(Debug, Clone)]
pub enum AuthMode {
    /// Development: the orchestrator (or the mock) answers `GET /session` without a token.
    Mock,
    /// Entra ID authorization code + PKCE in Rust (ADR-002).
    Entra(EntraConfig),
}

#[derive(Debug, Clone)]
pub struct EntraConfig {
    pub tenant_id: String,
    pub client_id: String,
    /// e.g. `api://<loop-app-id>/Dock.Access`
    pub api_scope: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub api_base: Url,
    pub auth: AuthMode,
    /// Hosts `open_external` may open (systems of record). Empty = allow https only.
    pub external_hosts: Vec<String>,
}

const DEFAULT_API_BASE: &str = "http://127.0.0.1:8787";
const DEFAULT_REDIRECT: &str = "loop://auth/callback";

impl Config {
    pub fn load() -> Self {
        let api_base = env::var("LOOP_API_URL")
            .ok()
            .or_else(|| option_env!("LOOP_API_URL").map(str::to_owned))
            .and_then(|s| Url::parse(&s).ok())
            .unwrap_or_else(|| Url::parse(DEFAULT_API_BASE).expect("valid default"));

        let auth = match env::var("LOOP_AUTH_MODE")
            .ok()
            .or_else(|| option_env!("LOOP_AUTH_MODE").map(str::to_owned))
            .as_deref()
        {
            Some("entra") => {
                let get = |k: &str, build: Option<&str>| env::var(k).ok().or_else(|| build.map(str::to_owned));
                match (
                    get("LOOP_ENTRA_TENANT", option_env!("LOOP_ENTRA_TENANT")),
                    get("LOOP_ENTRA_CLIENT_ID", option_env!("LOOP_ENTRA_CLIENT_ID")),
                    get("LOOP_API_SCOPE", option_env!("LOOP_API_SCOPE")),
                ) {
                    (Some(tenant_id), Some(client_id), Some(api_scope)) => AuthMode::Entra(EntraConfig {
                        tenant_id,
                        client_id,
                        api_scope,
                        redirect_uri: get("LOOP_REDIRECT_URI", option_env!("LOOP_REDIRECT_URI"))
                            .unwrap_or_else(|| DEFAULT_REDIRECT.to_owned()),
                    }),
                    _ => {
                        log::warn!("LOOP_AUTH_MODE=entra but tenant/client/scope missing; falling back to mock auth");
                        AuthMode::Mock
                    }
                }
            }
            _ => AuthMode::Mock,
        };

        let external_hosts = env::var("LOOP_EXTERNAL_HOSTS")
            .ok()
            .or_else(|| option_env!("LOOP_EXTERNAL_HOSTS").map(str::to_owned))
            .map(|s| s.split(',').map(|h| h.trim().to_ascii_lowercase()).filter(|h| !h.is_empty()).collect())
            .unwrap_or_default();

        Self { api_base, auth, external_hosts }
    }

    pub fn is_mock_auth(&self) -> bool {
        matches!(self.auth, AuthMode::Mock)
    }
}
