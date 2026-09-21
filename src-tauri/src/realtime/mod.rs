//! Azure Web PubSub client speaking `json.reliable.webpubsub.azure.v1`
//! (docs/shell-architecture.md §6.2, docs/technology.md §7.2). The only
//! WebSocket in the process. Re-emits validated wire events as typed Tauri
//! events; the UI never sees the socket.

mod dedupe;
mod webpubsub;

use std::{sync::Arc, time::Duration};

use parking_lot::Mutex;
use tauri::AppHandle;
use tokio::sync::Notify;

use crate::{
    api,
    ipc::{
        events::ConnectivityChanged,
        types::{Connectivity, ConnectivityState},
    },
    now_epoch_ms,
};
use tauri_specta::Event;

/// Control handle owned by `AppState`.
pub struct Realtime {
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    wake: Arc<Notify>,
    state: Mutex<ConnectivityState>,
    since: Mutex<f64>,
}

impl Default for Realtime {
    fn default() -> Self {
        Self {
            task: Mutex::new(None),
            wake: Arc::new(Notify::new()),
            state: Mutex::new(ConnectivityState::Online),
            since: Mutex::new(now_epoch_ms()),
        }
    }
}

impl Realtime {
    /// Start (or restart) the connection loop for the signed-in user.
    pub fn start(&self, app: AppHandle, api: api::Client, user_id: String) {
        self.stop();
        let wake = self.wake.clone();
        let handle = tauri::async_runtime::spawn(async move {
            webpubsub::run(app, api, user_id, wake).await;
        });
        *self.task.lock() = Some(handle);
    }

    pub fn stop(&self) {
        if let Some(task) = self.task.lock().take() {
            task.abort();
        }
    }

    /// Bypass the backoff once (wake from sleep, network change, `online` event).
    pub fn reconnect_now(&self) {
        self.wake.notify_one();
    }

    pub fn connectivity(&self) -> Connectivity {
        Connectivity { state: *self.state.lock(), since_epoch_ms: *self.since.lock() }
    }

    /// Record a transition and tell the UI; no-op when unchanged.
    pub fn set_state(&self, app: &AppHandle, next: ConnectivityState) {
        let changed = {
            let mut cur = self.state.lock();
            if *cur == next {
                false
            } else {
                *cur = next;
                *self.since.lock() = now_epoch_ms();
                true
            }
        };
        if changed {
            log::info!("connectivity -> {next:?}");
            let _ = ConnectivityChanged(self.connectivity()).emit(app);
        }
    }
}

/// Exponential backoff 0.5 s .. 30 s with jitter (docs/technology.md §7.2).
pub fn backoff(attempt: u32) -> Duration {
    let base_ms = (500u64.saturating_mul(1u64 << attempt.min(6))).min(30_000);
    let jitter = (now_epoch_ms() as u64) % 250;
    Duration::from_millis(base_ms + jitter)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_and_caps() {
        assert!(backoff(0) >= Duration::from_millis(500));
        assert!(backoff(0) < Duration::from_millis(750));
        assert!(backoff(3) >= Duration::from_millis(4000));
        assert!(backoff(20) <= Duration::from_millis(30_250));
    }
}
