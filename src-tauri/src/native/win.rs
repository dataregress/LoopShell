//! Win32 glue (docs/shell-architecture.md §3.3, §3.4; docs/technology.md §4.2).

use std::sync::{
    atomic::{AtomicIsize, Ordering},
    OnceLock,
};

use tauri::{AppHandle, Manager, WebviewWindow};
use windows::{
    core::HSTRING,
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
        Graphics::Gdi::{CreateRectRgn, DeleteObject, SetWindowRgn},
        UI::{
            Input::KeyboardAndMouse::SetFocus,
            Shell::{
                SHQueryUserNotificationState, ShellExecuteW, QUNS_BUSY, QUNS_PRESENTATION_MODE,
                QUNS_RUNNING_D3D_FULL_SCREEN,
            },
            WindowsAndMessaging::{
                CallNextHookEx, GetAncestor, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, IsWindow,
                IsWindowVisible, SetForegroundWindow, SetWindowDisplayAffinity, SetWindowLongPtrW, SetWindowPos,
                SetWindowsHookExW, GA_ROOT, GWL_EXSTYLE, MSLLHOOKSTRUCT, SWP_NOACTIVATE, SWP_NOOWNERZORDER,
                SWP_NOZORDER, SW_SHOWNORMAL, WDA_EXCLUDEFROMCAPTURE, WDA_NONE, WH_MOUSE_LL,
                WM_LBUTTONDOWN, WM_RBUTTONDOWN, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
            },
        },
    },
};

/// The HWND that had focus before the panel went Active (0 = none).
static PREVIOUS: AtomicIsize = AtomicIsize::new(0);

fn hwnd_of(window: &WebviewWindow) -> Option<HWND> {
    window.hwnd().ok()
}

/// `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`: clicks never activate, no taskbar or Alt-Tab entry.
pub fn prepare_window(window: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(window) else { return };
    // SAFETY: hwnd belongs to a live window owned by this process.
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let wanted = ex | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize;
        if wanted != ex {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, wanted);
        }
    }
}

pub fn set_capture_exclusion(window: &WebviewWindow, exclude: bool) {
    let Some(hwnd) = hwnd_of(window) else { return };
    let affinity = if exclude { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
    // SAFETY: valid HWND owned by this process.
    if let Err(err) = unsafe { SetWindowDisplayAffinity(hwnd, affinity) } {
        log::warn!("SetWindowDisplayAffinity failed: {err}");
    }
}

pub fn capture_foreground() {
    // SAFETY: plain query.
    let fg = unsafe { GetForegroundWindow() };
    PREVIOUS.store(fg.0 as isize, Ordering::Relaxed);
}

/// Store the foreground window, then take it. The call follows a click in our
/// own process, so Windows grants foreground without `AllowSetForegroundWindow`.
pub fn activate(window: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(window) else { return };
    // SAFETY: valid HWND owned by this process.
    unsafe {
        let fg = GetForegroundWindow();
        if fg != hwnd {
            PREVIOUS.store(fg.0 as isize, Ordering::Relaxed);
        }
        // Drop WS_EX_NOACTIVATE while Active so the webview accepts keyboard focus.
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex & !(WS_EX_NOACTIVATE.0 as isize));
    }
    let _ = window.set_focusable(true);
    // SAFETY: valid HWND owned by this process.
    unsafe {
        let _ = SetForegroundWindow(hwnd);
        let _ = SetFocus(Some(hwnd));
    }
    let _ = window.set_focus();
}

/// Never activate the desktop or the taskbar: only restore a still-valid, visible window.
pub fn restore_foreground(window: &WebviewWindow) {
    if let Some(hwnd) = hwnd_of(window) {
        // SAFETY: valid HWND owned by this process.
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize);
        }
        let _ = window.set_focusable(false);
    }
    let prev = PREVIOUS.swap(0, Ordering::Relaxed);
    if prev == 0 {
        return;
    }
    let prev = HWND(prev as *mut core::ffi::c_void);
    // SAFETY: IsWindow validates the handle before use.
    unsafe {
        if IsWindow(Some(prev)).as_bool() && IsWindowVisible(prev).as_bool() {
            let _ = SetForegroundWindow(prev);
        }
    }
}

/// True while keyboard focus is inside `window` or any of its child HWNDs (the
/// WebView2 host). tao reports `Focused(false)` on the top-level window when
/// focus moves to the webview child, which is not a blur for our purposes.
pub fn focus_within(window: &WebviewWindow) -> bool {
    let Some(hwnd) = hwnd_of(window) else { return false };
    // SAFETY: plain queries on handles we do not dereference.
    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return false;
        }
        GetAncestor(fg, GA_ROOT) == hwnd || fg == hwnd
    }
}

pub fn is_presenting() -> bool {
    // SAFETY: plain query with an out-param the binding wraps.
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => matches!(state, QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE),
        Err(err) => {
            log::debug!("SHQueryUserNotificationState failed: {err}");
            false
        }
    }
}

pub fn open_url(url: &url::Url) -> anyhow::Result<()> {
    let target = HSTRING::from(url.as_str());
    let verb = HSTRING::from("open");
    // SAFETY: null-terminated wide strings outlive the call.
    let result = unsafe { ShellExecuteW(None, &verb, &target, None, None, SW_SHOWNORMAL) };
    // ShellExecuteW returns a pseudo-HINSTANCE; values <= 32 are error codes.
    if (result.0 as isize) <= 32 {
        anyhow::bail!("ShellExecuteW failed with code {}", result.0 as isize);
    }
    Ok(())
}

/// Position and size in one `SetWindowPos`, without activating or re-ordering.
pub fn set_physical_rect(window: &WebviewWindow, x: i32, y: i32, w: i32, h: i32) {
    let Some(hwnd) = hwnd_of(window) else { return };
    // SAFETY: hwnd belongs to a live window owned by this process.
    let _ = unsafe {
        SetWindowPos(hwnd, None, x, y, w.max(1), h.max(1), SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER)
    };
}

/// Clip the window to a window-relative rect, or clear the clip with `None`.
/// Outside the region nothing is drawn and hit-testing skips the window, so
/// the anchor's collapsed gutter neither shows nor swallows clicks (ADR-005).
pub fn set_window_region(window: &WebviewWindow, region: Option<(i32, i32, i32, i32)>) {
    let Some(hwnd) = hwnd_of(window) else { return };
    // SAFETY: hwnd belongs to a live window owned by this process. After a
    // successful SetWindowRgn the system owns the region handle; it is only
    // deleted here when the call fails.
    unsafe {
        match region {
            None => {
                SetWindowRgn(hwnd, None, true);
            }
            Some((x, y, w, h)) => {
                let rgn = CreateRectRgn(x, y, x + w, y + h);
                if SetWindowRgn(hwnd, Some(rgn), true) == 0 {
                    let _ = DeleteObject(rgn.into());
                }
            }
        }
    }
}

/// Mica/Acrylic paint the *whole* HWND, including the transparent rounded
/// corners, so the panel window would show as a solid rectangle. Until the
/// backdrop can be confined to the panel's own rect (a child HWND, or DWM
/// rounded corners), the panel is opaque via CSS and the setting is a no-op
/// here. `clear_*` runs when turning the setting off so an older build's
/// backdrop never lingers.
pub fn set_vibrancy(window: &WebviewWindow, enabled: bool) {
    if enabled {
        log::debug!("system backdrop disabled on Windows: whole-window Mica breaks rounded corners");
    } else {
        let _ = window_vibrancy::clear_mica(window);
        let _ = window_vibrancy::clear_acrylic(window);
    }
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static ON_OUTSIDE: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

/// Low-level mouse hook: a click that is not on the pill or panel hides an unpinned panel.
pub fn watch_clicks_outside(app: AppHandle, on_outside: impl Fn() + Send + Sync + 'static) {
    let _ = APP.set(app);
    let _ = ON_OUTSIDE.set(Box::new(on_outside));
    // SAFETY: callback is in this process; the Tauri event loop pumps messages.
    // HHOOK is a raw handle with no Drop; the hook lives until process exit.
    match unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_ll), None, 0) } {
        Ok(_) => log::debug!("click-outside mouse hook installed"),
        Err(err) => log::warn!("click-outside mouse hook failed: {err}"),
    }
}

fn click_on_dock(pt: POINT) -> bool {
    let Some(app) = APP.get() else { return false };
    for label in ["anchor", "panel"] {
        let Some(w) = app.get_webview_window(label) else { continue };
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let Ok(hwnd) = w.hwnd() else { continue };
        let mut rect = RECT::default();
        // SAFETY: hwnd is a live Tauri window.
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_ok()
            && pt.x >= rect.left
            && pt.x < rect.right
            && pt.y >= rect.top
            && pt.y < rect.bottom
        {
            return true;
        }
    }
    false
}

unsafe extern "system" fn mouse_ll(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let msg = wparam.0 as u32;
        if msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN {
            // SAFETY: lparam is an MSLLHOOKSTRUCT for WH_MOUSE_LL.
            let info = unsafe { &*(lparam.0 as *const MSLLHOOKSTRUCT) };
            if !click_on_dock(info.pt) {
                if let Some(cb) = ON_OUTSIDE.get() {
                    cb();
                }
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}
