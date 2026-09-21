//! macOS glue (docs/shell-architecture.md §3.2; docs/technology.md §4.1).
//!
//! `tauri-nspanel` is git-only (not on crates.io) and is not pinned yet, so
//! this module vendors the minimum via Tauri's own APIs and leaves the NSPanel
//! conversion (`nonactivatingPanel`, `becomesKeyOnlyIfNeeded`, `sharingType`)
//! as the documented follow-up for the macOS spike (shell-architecture §9).
//! Everything here is safe to run today: the windows are non-focusable at
//! creation and only become focusable for typing.

use tauri::WebviewWindow;

pub fn prepare_window(window: &WebviewWindow) {
    let _ = window.set_visible_on_all_workspaces(true);
    let _ = window.set_focusable(false);
}

pub fn set_capture_exclusion(window: &WebviewWindow, exclude: bool) {
    // TODO(macos-spike): NSWindow.sharingType = .none via objc2-app-kit.
    let _ = (window, exclude);
}

pub fn capture_foreground() {
    // TODO(macos-spike): NSWorkspace.shared.frontmostApplication.
}

pub fn activate(window: &WebviewWindow) {
    let _ = window.set_focusable(true);
    let _ = window.set_focus();
}

pub fn restore_foreground(window: &WebviewWindow) {
    let _ = window.set_focusable(false);
    // TODO(macos-spike): previous.activate(options: []).
}

/// See the Windows note: `NSVisualEffectView` from `window-vibrancy` fills the
/// whole window, which would paint the transparent rounded corners. The NSPanel
/// spike will attach the effect view to the panel's content rect instead.
pub fn set_vibrancy(window: &WebviewWindow, enabled: bool) {
    if enabled {
        log::debug!("system vibrancy disabled on macOS until the NSPanel spike lands");
    } else {
        let _ = window_vibrancy::clear_vibrancy(window);
    }
}
