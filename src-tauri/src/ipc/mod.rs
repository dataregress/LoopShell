//! Typed IPC surface. Every command and event is registered with
//! `tauri-specta`; `cargo run --bin export-bindings` writes the TypeScript
//! bindings to `contracts/bindings/` (docs/technology.md §6).

pub mod commands;
pub mod events;
pub mod types;

use tauri_specta::{collect_commands, collect_events, Builder, ErrorHandlingMode};

/// The single source of truth for what the webviews may call and receive.
pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        // Errors are thrown as `IpcError` objects; the adapter catches and maps them.
        .error_handling(ErrorHandlingMode::Throw)
        .commands(collect_commands![
            // Dock and pill
            commands::dock_get_state,
            commands::dock_show,
            commands::dock_hide,
            commands::dock_pin,
            commands::dock_set_mode,
            commands::dock_activate,
            commands::dock_open_settings,
            commands::anchor_set_y,
            commands::anchor_hide,
            commands::anchor_show,
            commands::anchor_menu_popup,
            commands::anchor_set_expanded,
            commands::pause_set,
            commands::app_quit,
            // Identity
            commands::auth_sign_in,
            commands::auth_sign_out,
            commands::auth_get_session,
            // Journeys
            commands::ask_submit,
            commands::ask_cancel,
            commands::attention_list,
            commands::attention_decide,
            commands::ledger_query,
            commands::journey_get,
            // Settings and misc
            commands::settings_get,
            commands::settings_set,
            commands::monitors_list,
            commands::open_external,
            commands::telemetry_event,
        ])
        .events(collect_events![
            events::DockStateChanged,
            events::ThemeChanged,
            events::SessionChanged,
            events::ConnectivityChanged,
            events::TaskState,
            events::AttentionNew,
            events::AttentionResolved,
            events::AttentionExpired,
            events::LedgerAppended,
            events::PresentationChanged,
            events::SettingsRequested,
            events::SettingsChanged,
        ])
}
