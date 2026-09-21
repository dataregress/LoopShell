//! OS-specific behaviour the framework does not provide: non-activating
//! windows, focus capture/restore, screen-capture exclusion, presentation
//! detection, opening the system browser (docs/shell-architecture.md §3-§4).
//!
//! Each function has a real implementation per OS and a harmless fallback so
//! the shell builds and runs everywhere; nothing in the UI depends on them
//! succeeding.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod win;

use tauri::WebviewWindow;

/// Apply the always-on styles right after creation, before first show.
pub fn prepare_window(window: &WebviewWindow) {
    #[cfg(windows)]
    win::prepare_window(window);
    #[cfg(target_os = "macos")]
    macos::prepare_window(window);
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = window;
}

/// Hide the window from screen capture and recordings (Settings toggle).
pub fn set_capture_exclusion(window: &WebviewWindow, exclude: bool) {
    #[cfg(windows)]
    win::set_capture_exclusion(window, exclude);
    #[cfg(target_os = "macos")]
    macos::set_capture_exclusion(window, exclude);
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = (window, exclude);
}

/// Remember the application that has keyboard focus, before we take it.
pub fn capture_foreground() {
    #[cfg(windows)]
    win::capture_foreground();
    #[cfg(target_os = "macos")]
    macos::capture_foreground();
}

/// Passive -> Active: give the panel keyboard focus without a taskbar entry.
pub fn activate(window: &WebviewWindow) {
    #[cfg(windows)]
    win::activate(window);
    #[cfg(target_os = "macos")]
    macos::activate(window);
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = window.set_focusable(true);
        let _ = window.set_focus();
    }
}

/// Active -> hidden: return focus to the application that had it, if it still exists.
pub fn restore_foreground(window: &WebviewWindow) {
    #[cfg(windows)]
    win::restore_foreground(window);
    #[cfg(target_os = "macos")]
    macos::restore_foreground(window);
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = window.set_focusable(false);
}

/// True while keyboard focus is still inside `window` (including its webview child).
pub fn focus_within(window: &WebviewWindow) -> bool {
    #[cfg(windows)]
    {
        win::focus_within(window)
    }
    #[cfg(not(windows))]
    {
        window.is_focused().unwrap_or(false)
    }
}

/// True while the user presents, runs a full-screen D3D app, or has Do Not Disturb-style busy state.
pub fn is_presenting() -> bool {
    #[cfg(windows)]
    {
        win::is_presenting()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Open a URL in the default browser without a shell plugin.
pub fn open_url(url: &url::Url) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        win::open_url(url)
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url.as_str()).spawn()?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url.as_str()).spawn()?;
        Ok(())
    }
}

/// Mica/Acrylic or NSVisualEffectView behind the panel (docs/technology.md §4.4). Best effort.
pub fn set_vibrancy(window: &WebviewWindow, enabled: bool) {
    #[cfg(windows)]
    win::set_vibrancy(window, enabled);
    #[cfg(target_os = "macos")]
    macos::set_vibrancy(window, enabled);
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = (window, enabled);
}

/// Move and resize in physical pixels. On Windows this is one `SetWindowPos`.
pub fn set_physical_rect(window: &WebviewWindow, x: i32, y: i32, w: i32, h: i32) {
    #[cfg(windows)]
    win::set_physical_rect(window, x, y, w, h);
    #[cfg(not(windows))]
    {
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        let _ = window.set_size(tauri::PhysicalSize::new(w.max(1) as u32, h.max(1) as u32));
    }
}

/// Whether `set_window_region` clips drawing and hit-testing here. Where it
/// does not, callers resize the window to the visible chrome instead.
pub const fn supports_window_region() -> bool {
    cfg!(windows)
}

/// Clip a window to a window-relative rect (physical px), or clear the clip.
/// No-op where unsupported; see `supports_window_region`.
pub fn set_window_region(window: &WebviewWindow, region: Option<(i32, i32, i32, i32)>) {
    #[cfg(windows)]
    win::set_window_region(window, region);
    #[cfg(not(windows))]
    let _ = (window, region);
}

/// Hide an unpinned panel when the user clicks outside the pill and panel (ADR-003).
pub fn watch_clicks_outside(app: tauri::AppHandle, on_outside: impl Fn() + Send + Sync + 'static) {
    #[cfg(windows)]
    win::watch_clicks_outside(app, on_outside);
    #[cfg(not(windows))]
    let _ = (app, on_outside);
}
