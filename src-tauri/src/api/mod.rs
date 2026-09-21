//! The only HTTP client and the only place backend URLs are used
//! (docs/shell-architecture.md §6.1). Every request carries the bearer token
//! (when signed in), `x-journey-id` when known, W3C `traceparent`, a 10 s
//! timeout, and one retry on idempotent GETs.

use std::{sync::Arc, time::Duration};

use parking_lot::RwLock;
use reqwest::{Method, StatusCode};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::Value;
use url::Url;

use crate::{
    error::{IpcError, IpcErrorCode, IpcResult},
    ipc::types::{
        AskCancelRequest, AskSubmitRequest, AskSubmitResult, AttentionDecideResult, AttentionDecision, LedgerPage,
        LedgerQuery, Session,
    },
};

#[derive(Clone)]
pub struct Client {
    http: reqwest::Client,
    base: Url,
    /// Bearer token supplied by `auth/`; never leaves this process.
    token: Arc<RwLock<Option<String>>>,
}

#[derive(Debug, Deserialize)]
pub struct Negotiated {
    pub url: String,
    #[serde(default)]
    pub reconnection_token: Option<String>,
}

/// Error body the orchestrator (and the mock) return: mirrors `IpcError`.
#[derive(Debug, Deserialize)]
struct ErrorBody {
    code: Option<IpcErrorCode>,
    message: Option<String>,
    retryable: Option<bool>,
}

impl Client {
    pub fn new(base: Url) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(5))
            .user_agent(format!("LoopDock/{}", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { http, base, token: Arc::new(RwLock::new(None)) })
    }

    pub fn base(&self) -> &Url {
        &self.base
    }

    pub fn set_token(&self, token: Option<String>) {
        *self.token.write() = token;
    }

    pub fn has_token(&self) -> bool {
        self.token.read().is_some()
    }

    fn url(&self, path: &str) -> IpcResult<Url> {
        Ok(self.base.join(path.trim_start_matches('/'))?)
    }

    async fn send<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
        journey_id: Option<&str>,
    ) -> IpcResult<T> {
        let url = self.url(path)?;
        let idempotent = method == Method::GET;
        let mut attempt = 0;
        loop {
            attempt += 1;
            let mut req = self.http.request(method.clone(), url.clone());
            if let Some(token) = self.token.read().as_deref() {
                req = req.bearer_auth(token);
            }
            if let Some(j) = journey_id {
                req = req.header("x-journey-id", j);
            }
            req = req.header("traceparent", traceparent());
            if let Some(b) = body {
                req = req.json(b);
            }
            match req.send().await {
                Ok(res) => return Self::read(res).await,
                Err(err) if idempotent && attempt == 1 && (err.is_connect() || err.is_timeout()) => {
                    log::debug!("retrying GET {path} after {err}");
                    continue;
                }
                Err(err) => return Err(err.into()),
            }
        }
    }

    async fn read<T: DeserializeOwned>(res: reqwest::Response) -> IpcResult<T> {
        let status = res.status();
        let correlation = res.headers().get("x-correlation-id").and_then(|v| v.to_str().ok()).map(str::to_owned);
        if status.is_success() {
            if status == StatusCode::NO_CONTENT {
                return serde_json::from_value(Value::Null)
                    .map_err(|_| IpcError::internal("Orchestrator returned no body where one was expected."));
            }
            let bytes = res.bytes().await?;
            return serde_json::from_slice::<T>(&bytes)
                .map_err(|err| IpcError::invalid(format!("Orchestrator returned an invalid payload: {err}")))
                .map_err(|e| e.with_correlation(correlation));
        }
        let body: Option<ErrorBody> = res.json().await.ok();
        let (code, retryable) = match status {
            StatusCode::UNAUTHORIZED => (IpcErrorCode::Unauthenticated, false),
            StatusCode::FORBIDDEN => (IpcErrorCode::Rejected, false),
            StatusCode::CONFLICT => (IpcErrorCode::Conflict, false),
            StatusCode::BAD_REQUEST | StatusCode::NOT_FOUND | StatusCode::UNPROCESSABLE_ENTITY => {
                (IpcErrorCode::Invalid, false)
            }
            StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT => (IpcErrorCode::Timeout, true),
            s if s.is_server_error() => (IpcErrorCode::Internal, true),
            _ => (IpcErrorCode::Internal, false),
        };
        let body = body.unwrap_or(ErrorBody { code: None, message: None, retryable: None });
        Err(IpcError::new(
            body.code.unwrap_or(code),
            body.message.unwrap_or_else(|| format!("{} {}", status.as_u16(), status.canonical_reason().unwrap_or(""))),
            body.retryable.unwrap_or(retryable),
        )
        .with_correlation(correlation))
    }

    // ---- Endpoints ----------------------------------------------------------

    /// Development/mock identity: who the backend thinks we are (no token).
    pub async fn session(&self) -> IpcResult<Session> {
        self.send(Method::GET, "/session", None, None).await
    }

    pub async fn negotiate(&self) -> IpcResult<Negotiated> {
        self.send(Method::GET, "/negotiate", None, None).await
    }

    pub async fn ask_submit(&self, req: &AskSubmitRequest) -> IpcResult<AskSubmitResult> {
        let body = serde_json::to_value(req)?;
        self.send(Method::POST, "/ask", Some(&body), req.journey_id.as_deref()).await
    }

    pub async fn ask_cancel(&self, req: &AskCancelRequest) -> IpcResult<()> {
        let path = format!("/ask/{}/cancel", encode(&req.task_id));
        // 204 deserialises to `Value::Null`; any 2xx body is fine too.
        let _: Value = self.send(Method::POST, &path, None, None).await?;
        Ok(())
    }

    pub async fn attention_list(&self) -> IpcResult<Vec<Value>> {
        self.send(Method::GET, "/attention", None, None).await
    }

    pub async fn attention_decide(&self, decision: &AttentionDecision) -> IpcResult<AttentionDecideResult> {
        let path = format!("/attention/{}/decide", encode(&decision.attention_id));
        let body = serde_json::to_value(decision)?;
        self.send(Method::POST, &path, Some(&body), None).await
    }

    pub async fn ledger_query(&self, query: &LedgerQuery) -> IpcResult<LedgerPage> {
        let mut url = self.url("/ledger")?;
        {
            let mut q = url.query_pairs_mut();
            if !query.filters.platforms.is_empty() {
                q.append_pair("platform", &query.filters.platforms.join(","));
            }
            if !query.filters.statuses.is_empty() {
                q.append_pair("status", &query.filters.statuses.join(","));
            }
            if query.filters.scope != "all" {
                q.append_pair("scope", &query.filters.scope);
            }
            if let Some(c) = &query.cursor {
                q.append_pair("cursor", c);
            }
            q.append_pair("limit", &query.limit.unwrap_or(100).to_string());
        }
        let path = format!("{}?{}", url.path(), url.query().unwrap_or(""));
        self.send(Method::GET, &path, None, None).await
    }

    pub async fn journey_get(&self, journey_id: &str) -> IpcResult<Value> {
        let path = format!("/journey/{}", encode(journey_id));
        self.send(Method::GET, &path, None, Some(journey_id)).await
    }
}

fn encode(segment: &str) -> String {
    url::form_urlencoded::byte_serialize(segment.as_bytes()).collect()
}

/// W3C trace context: a fresh root span per request. Real OTel wiring replaces this.
fn traceparent() -> String {
    let trace = uuid::Uuid::new_v4().simple().to_string();
    let span = &uuid::Uuid::new_v4().simple().to_string()[..16];
    format!("00-{trace}-{span}-01")
}
