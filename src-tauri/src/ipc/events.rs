//! Rust -> UI events (docs/shell-architecture.md §5.2). Newtype wrappers so
//! the wire payload is the inner object; names match `AdapterEvents` in
//! `src/adapters/adapter.ts`.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

use super::types::{
    AttentionNewEvent, AttentionRefEvent, Connectivity, DockState, Empty, LedgerAppendedEvent,
    PresentationChangedPayload, Session, Settings, TaskStateEvent, ThemeChangedPayload,
};

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "dock_state_changed")]
pub struct DockStateChanged(pub DockState);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "theme_changed")]
pub struct ThemeChanged(pub ThemeChangedPayload);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "session_changed")]
pub struct SessionChanged(pub Session);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "connectivity_changed")]
pub struct ConnectivityChanged(pub Connectivity);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "task_state")]
pub struct TaskState(pub TaskStateEvent);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "attention_new")]
pub struct AttentionNew(pub AttentionNewEvent);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "attention_resolved")]
pub struct AttentionResolved(pub AttentionRefEvent);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "attention_expired")]
pub struct AttentionExpired(pub AttentionRefEvent);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "ledger_appended")]
pub struct LedgerAppended(pub LedgerAppendedEvent);

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "presentation_changed")]
pub struct PresentationChanged(pub PresentationChangedPayload);

/// The tray asked for Settings; the panel opens its sheet.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "settings_requested")]
pub struct SettingsRequested(pub Empty);

/// Settings were saved (from the sheet or a menu). Every window mirrors them,
/// so the pill picks up a theme change made in the panel.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[tauri_specta(event_name = "settings_changed")]
pub struct SettingsChanged(pub Settings);
