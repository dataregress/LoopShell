//! Global shortcuts (ADR-003 §8): open/focus the panel, toggle pin. Both are
//! user-configurable; re-registered whenever settings change.

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::{
    ipc::types::{Settings, ShowReason},
    state::AppState,
    windows,
};

pub fn parse(spec: &str) -> Option<Shortcut> {
    let spec = spec.trim();
    if spec.is_empty() {
        return None;
    }
    match spec.parse::<Shortcut>() {
        Ok(s) => Some(s),
        Err(err) => {
            log::warn!("shortcut {spec:?} did not parse: {err}");
            None
        }
    }
}

/// Replace the registered shortcuts with the ones in `settings`.
pub fn register(app: &AppHandle, settings: &Settings) -> anyhow::Result<()> {
    let gs = app.global_shortcut();
    gs.unregister_all()?;
    let open = parse(&settings.shortcut_open);
    let pin = parse(&settings.shortcut_pin);
    if let Some(s) = open {
        if let Err(err) = gs.register(s) {
            log::warn!("could not register {}: {err}", settings.shortcut_open);
        }
    }
    if let Some(s) = pin.filter(|s| open != Some(*s)) {
        if let Err(err) = gs.register(s) {
            log::warn!("could not register {}: {err}", settings.shortcut_pin);
        }
    }
    let state = app.state::<AppState>();
    let mut hk = state.hotkeys.lock();
    hk.open = open;
    hk.pin = pin;
    Ok(())
}

/// Plugin handler: runs for every registered shortcut press/release.
pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, state: ShortcutState) {
    if state != ShortcutState::Pressed {
        return;
    }
    let state = app.state::<AppState>();
    let (open, pin) = {
        let hk = state.hotkeys.lock();
        (hk.open, hk.pin)
    };
    if open.as_ref() == Some(shortcut) {
        let dock = app.state::<AppState>().dock();
        if !dock.open {
            windows::show(app, Some(crate::ipc::types::Mode::Ask), ShowReason::Hotkey);
        }
        // Pressing again while open focuses the composer.
        windows::activate(app);
    } else if pin.as_ref() == Some(shortcut) {
        let pinned = !app.state::<AppState>().dock.lock().pinned;
        windows::pin(app, pinned);
    }
}
