//! Loop Dock shell (docs/shell-architecture.md). Owns the two windows, the
//! session, networking and settings; the webviews only render.

pub mod api;
pub mod auth;
pub mod config;
pub mod error;
pub mod hotkeys;
pub mod ipc;
pub mod native;
pub mod realtime;
pub mod settings;
pub mod state;
pub mod tray;
pub mod windows;

use std::{sync::atomic::Ordering, time::Duration};

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_specta::Event;

use crate::{
    config::Config,
    ipc::{
        events::{PresentationChanged, SessionChanged, SettingsChanged, ThemeChanged},
        types::{PresentationChangedPayload, Session, Settings, SignOutReason, SystemTheme, ThemeChangedPayload},
    },
    state::AppState,
};

// ---- Time helpers -------------------------------------------------------------------

pub fn now_epoch_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

pub fn iso_from_epoch_ms(ms: f64) -> String {
    let secs = (ms / 1000.0).floor() as i64;
    time::OffsetDateTime::from_unix_timestamp(secs)
        .ok()
        .and_then(|t| t.format(&time::format_description::well_known::Rfc3339).ok())
        .unwrap_or_default()
}

// ---- Session plumbing ---------------------------------------------------------------

pub fn emit_session(app: &AppHandle, session: Session) {
    if let Err(err) = SessionChanged(session).emit(app) {
        log::warn!("emit session_changed failed: {err}");
    }
}

/// Settings changed: both webviews mirror them (theme, motion, shortcuts…).
pub fn emit_settings(app: &AppHandle, settings: Settings) {
    if let Err(err) = SettingsChanged(settings).emit(app) {
        log::warn!("emit settings_changed failed: {err}");
    }
}

/// A session became valid: connect realtime, schedule refresh, tell the UI.
pub fn session_started(app: &AppHandle, session: Session) {
    let state = app.state::<AppState>();
    if let Some(user_id) = session.user_id.clone() {
        state.realtime.start(app.clone(), state.api.clone(), user_id);
    }
    schedule_refresh(app);
    emit_session(app, session);
    windows::emit_state(app);
}

pub async fn session_sign_out(app: &AppHandle, reason: SignOutReason) {
    let state = app.state::<AppState>();
    state.realtime.stop();
    let session = state.auth.sign_out(reason).await;
    // Signing out closes the panel; the UI clears its caches on `session_changed`.
    windows::request_hide(app, ipc::types::HideReason::Ui);
    emit_session(app, session);
}

/// Entra only: refresh five minutes before expiry; on failure, sign out as expired.
fn schedule_refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Some(due_ms) = state.auth.refresh_due_in_ms() else { return };
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(due_ms as u64)).await;
        let state = handle.state::<AppState>();
        if !state.auth.is_signed_in() {
            return;
        }
        match state.auth.refresh().await {
            Ok(session) => {
                log::info!("token refreshed");
                emit_session(&handle, session);
                schedule_refresh(&handle);
            }
            Err(err) => {
                log::warn!("token refresh failed: {err}");
                session_sign_out(&handle, SignOutReason::Expired).await;
            }
        }
    });
}

pub fn autostart_set(app: &AppHandle, enabled: bool) {
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    if let Err(err) = result {
        log::warn!("autostart {} failed: {err}", if enabled { "enable" } else { "disable" });
    }
}

// ---- Setup --------------------------------------------------------------------------

fn setup(app: &AppHandle) -> anyhow::Result<()> {
    let config = Config::load();
    log::info!(
        "Loop Dock {} · api={} · auth={}",
        env!("CARGO_PKG_VERSION"),
        config.api_base,
        if config.is_mock_auth() { "mock" } else { "entra" }
    );

    let store = settings::Store::new(app)?;
    let settings = store.load_settings();
    let layouts = store.load_layouts();
    let api = api::Client::new(config.api_base.clone())?;
    let auth = auth::Auth::new(config.auth.clone(), api.clone());

    app.manage(AppState {
        config,
        dock: Default::default(),
        settings: parking_lot::Mutex::new(settings.clone()),
        layouts: parking_lot::Mutex::new(layouts),
        store,
        api,
        auth,
        realtime: Default::default(),
        hotkeys: Default::default(),
        hide_generation: Default::default(),
        pause_generation: Default::default(),
        anchor_shape: Default::default(),
        presenting: Default::default(),
        pill_expanded: Default::default(),
    });

    windows::apply_initial(app, &settings);
    tray::install(app)?;
    native::watch_clicks_outside(app.clone(), {
        let handle = app.clone();
        move || windows::on_click_outside(&handle)
    });
    if let Err(err) = hotkeys::register(app, &settings) {
        log::warn!("hotkeys: {err}");
    }
    autostart_set(app, settings.autostart);

    // Deep links: auth callbacks (and, later, `loop://journey/<id>`).
    {
        let handle = app.clone();
        app.deep_link().on_open_url(move |event| {
            for url in event.urls() {
                if handle.state::<AppState>().auth.handle_callback(url.clone()) {
                    continue;
                }
                log::info!("deep link ignored: {url}");
            }
        });
    }

    // Presentation / DND watcher (§3.4). Ten-second poll; zero cost otherwise.
    {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                let presenting = native::is_presenting();
                let state = handle.state::<AppState>();
                if state.presenting.swap(presenting, Ordering::Relaxed) != presenting {
                    let _ = PresentationChanged(PresentationChangedPayload { presenting }).emit(&handle);
                }
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        });
    }

    // Restore the session without blocking the event loop; then show the pill.
    {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let session = handle.state::<AppState>().auth.restore().await;
            if session.is_signed_in() {
                session_started(&handle, session);
            } else {
                emit_session(&handle, session);
            }
            windows::apply_session(&handle);
        });
    }
    Ok(())
}

fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    let app = window.app_handle();
    match event {
        WindowEvent::ThemeChanged(theme) if window.label() == windows::PANEL => {
            let system = match theme {
                tauri::Theme::Dark => SystemTheme::Dark,
                _ => SystemTheme::Light,
            };
            let _ = ThemeChanged(ThemeChangedPayload { system }).emit(app);
        }
        WindowEvent::Focused(false) if window.label() == windows::PANEL => {
            // Focus bounces between the top-level window and the WebView2 child
            // (and briefly during our own activation), so decide after it settles.
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(120)).await;
                let still_ours = windows::panel(&handle).map(|w| native::focus_within(&w)).unwrap_or(false);
                if !still_ours {
                    windows::on_panel_blur(&handle);
                }
            });
        }
        WindowEvent::ScaleFactorChanged { .. } => {
            windows::place_windows(app);
        }
        WindowEvent::CloseRequested { api, .. } => {
            // The windows live as long as the process; the tray owns Quit.
            api.prevent_close();
            let _ = window.hide();
        }
        _ => {}
    }
}

pub fn run() {
    let specta = ipc::builder();

    let app = tauri::Builder::default()
        // Must be first: a second launch forwards its args (deep links) here and exits.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            log::info!("second instance launched with {args:?}; showing the dock");
            windows::show(app, None, ipc::types::ShowReason::Tray);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info })
                .level_for("tao", log::LevelFilter::Warn)
                .level_for("wry", log::LevelFilter::Warn)
                .level_for("hyper_util", log::LevelFilter::Warn)
                .level_for("reqwest", log::LevelFilter::Warn)
                .level_for("tungstenite", log::LevelFilter::Warn)
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| hotkeys::on_shortcut(app, shortcut, event.state()))
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(specta.invoke_handler())
        .setup(move |app| {
            specta.mount_events(app);
            setup(app.handle()).map_err(|e| -> Box<dyn std::error::Error> { e.into() })
        })
        .on_window_event(on_window_event)
        .build(tauri::generate_context!())
        .expect("error while building Loop Dock");

    app.run(|app, event| {
        if let RunEvent::ExitRequested { api, code, .. } = event {
            // Closing the last window must not quit: only the tray/menu Quit does.
            if code.is_none() {
                api.prevent_exit();
            }
        }
        let _ = app;
    });
}
