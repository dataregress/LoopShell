//! Process-wide state managed by Tauri (`app.state::<AppState>()`).

use std::sync::atomic::{AtomicBool, AtomicU64};

use parking_lot::Mutex;
use tauri_plugin_global_shortcut::Shortcut;

use crate::{
    api,
    auth::Auth,
    config::Config,
    ipc::types::{DockState, Settings},
    realtime::Realtime,
    settings::{Layouts, Store},
};

#[derive(Default)]
pub struct Hotkeys {
    pub open: Option<Shortcut>,
    pub pin: Option<Shortcut>,
}

pub struct AppState {
    pub config: Config,
    pub dock: Mutex<DockState>,
    pub settings: Mutex<Settings>,
    pub layouts: Mutex<Layouts>,
    pub store: Store,
    pub api: api::Client,
    pub auth: Auth,
    pub realtime: Realtime,
    pub hotkeys: Mutex<Hotkeys>,
    /// Bumped on every show/hide so a stale hide-fallback timer does nothing.
    pub hide_generation: AtomicU64,
    /// Cancels a running "Pause 1h" timer when the user resumes early.
    pub pause_generation: AtomicU64,
    pub presenting: AtomicBool,
    /// Anchor shows the 56×180 pill (true) or the 20×180 tab (false). ADR-005.
    pub pill_expanded: AtomicBool,
    /// Serialises `pill_expanded` store + window-region apply so two quick
    /// hover flips cannot land out of order.
    pub anchor_shape: Mutex<()>,
}

impl AppState {
    pub fn dock(&self) -> DockState {
        self.dock.lock().clone()
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().clone()
    }
}
