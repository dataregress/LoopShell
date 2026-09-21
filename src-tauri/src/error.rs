//! The one error type that crosses IPC (docs/shell-architecture.md §5.3).
//! Mirrors `contracts/schemas/ipc.ts` `IpcError`. Never a bare `String`.

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum IpcErrorCode {
    Unauthenticated,
    Offline,
    Timeout,
    Rejected,
    Conflict,
    Invalid,
    Internal,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{code:?}: {message}")]
pub struct IpcError {
    pub code: IpcErrorCode,
    pub message: String,
    pub retryable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub correlation_id: Option<String>,
}

pub type IpcResult<T> = Result<T, IpcError>;

impl IpcError {
    pub fn new(code: IpcErrorCode, message: impl Into<String>, retryable: bool) -> Self {
        Self { code, message: message.into(), retryable, correlation_id: None }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::Internal, message, false)
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::Invalid, message, false)
    }

    pub fn offline() -> Self {
        Self::new(IpcErrorCode::Offline, "Loop is offline.", true)
    }

    pub fn timeout() -> Self {
        Self::new(IpcErrorCode::Timeout, "The orchestrator did not respond in time.", true)
    }

    pub fn unauthenticated() -> Self {
        Self::new(IpcErrorCode::Unauthenticated, "Sign in to continue.", false)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(IpcErrorCode::Conflict, message, false)
    }

    pub fn with_correlation(mut self, id: Option<String>) -> Self {
        self.correlation_id = id;
        self
    }
}

impl From<anyhow::Error> for IpcError {
    fn from(err: anyhow::Error) -> Self {
        // anyhow chains may wrap an IpcError; keep its code.
        match err.downcast::<IpcError>() {
            Ok(ipc) => ipc,
            Err(other) => IpcError::internal(format!("{other:#}")),
        }
    }
}

impl From<tauri::Error> for IpcError {
    fn from(err: tauri::Error) -> Self {
        IpcError::internal(err.to_string())
    }
}

impl From<serde_json::Error> for IpcError {
    fn from(err: serde_json::Error) -> Self {
        IpcError::invalid(format!("Malformed payload: {err}"))
    }
}

impl From<reqwest::Error> for IpcError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            IpcError::timeout()
        } else if err.is_connect() || err.is_request() {
            IpcError::new(IpcErrorCode::Offline, "Cannot reach the orchestrator.", true)
        } else if err.is_decode() {
            IpcError::invalid("Orchestrator returned an invalid payload.")
        } else {
            IpcError::new(IpcErrorCode::Internal, err.to_string(), true)
        }
    }
}

impl From<url::ParseError> for IpcError {
    fn from(err: url::ParseError) -> Self {
        IpcError::invalid(format!("Invalid URL: {err}"))
    }
}
