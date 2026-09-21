//! Tray icon and the menu the pill's right-click pops up
//! (docs/ui-ux.md §2.4, docs/shell-architecture.md §5.1 `anchor_menu_popup`).
//! Menus are rebuilt from state so labels ("Pin" / "Unpin") stay truthful.
//! The two menus share items and handlers; only the tray offers "Open Loop"
//! and "Settings…", so Settings is reachable from the taskbar alone.

use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};
use tauri_specta::Event;

use crate::{
    ipc::{
        events::SettingsRequested,
        types::{Empty, Mode, ShowReason, SignOutReason},
    },
    now_epoch_ms,
    state::AppState,
    windows,
};

pub const TRAY_ID: &str = "loop";

const ID_OPEN: &str = "open";
const ID_PIN: &str = "pin";
const ID_PAUSE: &str = "pause";
const ID_PILL: &str = "pill";
const ID_SETTINGS: &str = "settings";
const ID_SIGN_OUT: &str = "sign_out";
const ID_QUIT: &str = "quit";

const PAUSE_MS: f64 = 60.0 * 60.0 * 1000.0;

/// Which surface a menu is built for; the pill's is the shorter one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MenuKind {
    Tray,
    Pill,
}

pub fn build_menu(app: &AppHandle, kind: MenuKind) -> tauri::Result<Menu<Wry>> {
    let state = app.state::<AppState>();
    let dock = state.dock();
    let signed_in = state.auth.is_signed_in();
    let shortcut = state.settings().shortcut_open;

    let open = MenuItemBuilder::with_id(ID_OPEN, "Open Loop").accelerator(shortcut).build(app)?;
    let pin = MenuItemBuilder::with_id(ID_PIN, if dock.pinned { "Unpin panel" } else { "Pin panel" }).build(app)?;
    let pause =
        MenuItemBuilder::with_id(ID_PAUSE, if dock.paused { "Resume" } else { "Pause for 1 hour" }).build(app)?;
    let pill =
        MenuItemBuilder::with_id(ID_PILL, if dock.pill_visible { "Hide pill" } else { "Show pill" }).build(app)?;
    let settings = MenuItemBuilder::with_id(ID_SETTINGS, "Settings…").build(app)?;
    let sign_out = MenuItemBuilder::with_id(ID_SIGN_OUT, "Sign out").enabled(signed_in).build(app)?;
    let quit = MenuItemBuilder::with_id(ID_QUIT, "Quit Loop").build(app)?;

    match kind {
        MenuKind::Tray => MenuBuilder::new(app)
            .items(&[&open, &pin, &pause])
            .item(&PredefinedMenuItem::separator(app)?)
            .items(&[&pill, &settings])
            .item(&PredefinedMenuItem::separator(app)?)
            .items(&[&sign_out, &quit])
            .build(),
        // No "Open Loop" (a click does that) and no Settings (tray only).
        MenuKind::Pill => MenuBuilder::new(app)
            .items(&[&pin, &pause, &pill])
            .item(&PredefinedMenuItem::separator(app)?)
            .item(&sign_out)
            .item(&PredefinedMenuItem::separator(app)?)
            .item(&quit)
            .build(),
    }
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let icon = app.default_window_icon().cloned().ok_or_else(|| tauri::Error::AssetNotFound("icon".into()))?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Loop")
        .menu(&build_menu(app, MenuKind::Tray)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                windows::toggle(tray.app_handle(), ShowReason::Tray);
            }
        })
        .build(app)?;
    Ok(())
}

/// Rebuild the tray menu after a state change. Cheap; called from `emit_state`.
pub fn refresh(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        match build_menu(app, MenuKind::Tray) {
            Ok(menu) => {
                let _ = tray.set_menu(Some(menu));
            }
            Err(err) => log::warn!("tray menu rebuild failed: {err}"),
        }
    }
}

/// Pop the pill's menu at the cursor for its right-click.
pub fn popup_at_anchor(app: &AppHandle) -> tauri::Result<()> {
    let Some(anchor) = windows::anchor(app) else { return Ok(()) };
    let menu = build_menu(app, MenuKind::Pill)?;
    anchor.popup_menu(&menu)
}

pub fn on_menu(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    match id {
        ID_OPEN => {
            windows::show(app, Some(Mode::Ask), ShowReason::Tray);
            windows::activate(app);
        }
        ID_PIN => {
            let pinned = !state.dock.lock().pinned;
            windows::pin(app, pinned);
        }
        ID_PAUSE => {
            let paused = state.dock.lock().paused;
            windows::set_paused(app, if paused { None } else { Some(now_epoch_ms() + PAUSE_MS) });
        }
        ID_PILL => {
            let visible = !state.dock.lock().pill_visible;
            windows::set_pill_visible(app, visible);
        }
        ID_SETTINGS => {
            windows::show(app, None, ShowReason::Tray);
            let _ = SettingsRequested(Empty {}).emit(app);
        }
        ID_SIGN_OUT => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::session_sign_out(&handle, SignOutReason::User).await;
            });
        }
        ID_QUIT => app.exit(0),
        other => log::debug!("unhandled menu id {other}"),
    }
}
