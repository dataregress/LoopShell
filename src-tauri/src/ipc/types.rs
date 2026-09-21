//! Rust mirrors of the contract types in `contracts/schemas/*.ts`.
//!
//! Top-level shapes are typed so serde rejects malformed input at the boundary
//! (docs/shell-architecture.md §7). Bodies that only the UI interprets (cards,
//! Attention items, Ledger rows, journeys) pass through as `serde_json::Value`;
//! the UI re-validates them with Zod and drops unknown card types.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::{datatype::DataType, Type, Types};

/// Opaque JSON the UI validates with Zod (cards, Attention items, Ledger rows,
/// journeys). Exported to TypeScript as `unknown`.
///
/// `serde_json::Value`'s own specta impl is inlined recursively in the rc
/// series and overflows the exporter, so it never appears at the IPC boundary.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Json(pub Value);

impl Type for Json {
    fn definition(types: &mut Types) -> DataType {
        specta_typescript::Unknown::<()>::definition(types)
    }
}

impl From<Value> for Json {
    fn from(v: Value) -> Self {
        Self(v)
    }
}

// ---- Dock (contracts/schemas/dock.ts) ---------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Ask,
    Attention,
    Recent,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DockState {
    pub open: bool,
    pub mode: Mode,
    pub pinned: bool,
    /// Panel has keyboard focus (Passive -> Active).
    pub active: bool,
    pub paused: bool,
    pub paused_until_epoch_ms: Option<f64>,
    pub pill_visible: bool,
}

impl Default for DockState {
    fn default() -> Self {
        Self {
            open: false,
            mode: Mode::Ask,
            pinned: false,
            active: false,
            paused: false,
            paused_until_epoch_ms: None,
            pill_visible: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ShowReason {
    Pill,
    Hotkey,
    Tray,
    Attention,
    Toast,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum HideReason {
    Esc,
    Outside,
    Grace,
    Ui,
    Lock,
    Pill,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ConnectivityState {
    Online,
    Reconnecting,
    Offline,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Connectivity {
    pub state: ConnectivityState,
    #[specta(type = specta_typescript::Number)]
    pub since_epoch_ms: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SystemTheme {
    Light,
    Dark,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThemeChangedPayload {
    pub system: SystemTheme,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PresentationChangedPayload {
    pub presenting: bool,
}

// ---- Requests / results (docs/shell-architecture.md §5.1) --------------------

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DockShowRequest {
    #[serde(default)]
    #[specta(optional)]
    pub mode: Option<Mode>,
    pub reason: ShowReason,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DockHideRequest {
    pub reason: HideReason,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DockPinRequest {
    pub pinned: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DockSetModeRequest {
    pub mode: Mode,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnchorSetYRequest {
    /// Pill top edge in logical (DIP) screen coordinates.
    #[specta(type = specta_typescript::Number)]
    pub y_logical: f64,
    /// Persist the position (pointer released).
    pub commit: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnchorY {
    #[specta(type = specta_typescript::Number)]
    pub y_logical: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnchorSetExpandedRequest {
    pub expanded: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PauseSetRequest {
    pub until_epoch_ms: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AskSubmitRequest {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub journey_id: Option<String>,
    pub client_request_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AskSubmitResult {
    pub journey_id: String,
    pub task_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AskCancelRequest {
    pub task_id: String,
}

/// `contracts/schemas/attention.ts` `AttentionDecision` (strict object).
#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttentionDecision {
    pub attention_id: String,
    pub decision: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub free_text: Option<String>,
    pub decided_at: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AttentionDecideResult {
    pub accepted: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LedgerFilters {
    #[serde(default)]
    pub platforms: Vec<String>,
    #[serde(default)]
    pub statuses: Vec<String>,
    #[serde(default = "default_scope")]
    pub scope: String,
}

fn default_scope() -> String {
    "all".to_owned()
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LedgerQuery {
    pub filters: LedgerFilters,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LedgerPage {
    pub rows: Vec<Json>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JourneyGetRequest {
    pub journey_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenExternalRequest {
    pub url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryEventRequest {
    pub name: String,
    #[serde(default)]
    pub props: Json,
}

// ---- Session (contracts/schemas/session.ts) ----------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    SignedOut,
    SigningIn,
    SignedIn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SignOutReason {
    User,
    Expired,
    Revoked,
    Forced,
    Error,
}

/// What the webview may know about the user. Never carries tokens (ADR-002 §7).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub state: SessionState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub upn: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub tenant_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub expires_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub reason: Option<SignOutReason>,
}

impl Session {
    pub fn signed_out(reason: Option<SignOutReason>) -> Self {
        Self {
            state: SessionState::SignedOut,
            user_id: None,
            display_name: None,
            upn: None,
            tenant_id: None,
            expires_at: None,
            reason,
        }
    }

    pub fn signing_in() -> Self {
        Self { state: SessionState::SigningIn, ..Self::signed_out(None) }
    }

    pub fn is_signed_in(&self) -> bool {
        self.state == SessionState::SignedIn
    }
}

impl Default for Session {
    fn default() -> Self {
        Self::signed_out(None)
    }
}

// ---- Settings (contracts/schemas/settings.ts) --------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum MotionPreference {
    System,
    Reduced,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Edge {
    Right,
    Left,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub shortcut_open: String,
    pub shortcut_pin: String,
    /// Monitor name; `None` = primary.
    pub display: Option<String>,
    pub edge: Edge,
    pub pill_visible: bool,
    pub autostart: bool,
    pub pin_by_default: bool,
    pub exclude_from_capture: bool,
    pub theme: ThemePreference,
    pub motion: MotionPreference,
    pub vibrancy: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            shortcut_open: "Ctrl+Alt+L".to_owned(),
            shortcut_pin: "Ctrl+Alt+P".to_owned(),
            display: None,
            edge: Edge::Right,
            pill_visible: true,
            autostart: true,
            pin_by_default: false,
            exclude_from_capture: true,
            theme: ThemePreference::System,
            motion: MotionPreference::System,
            vibrancy: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub name: String,
    pub primary: bool,
    #[specta(type = specta_typescript::Number)]
    pub scale_factor: f64,
}

// ---- Realtime -> UI event payloads (contracts/schemas/events.ts) -----------

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskStateEvent {
    pub event_id: String,
    pub journey_id: String,
    pub task_id: String,
    /// A2A state: submitted | working | input-required | auth-required | completed | failed | rejected | canceled.
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub cards: Option<Vec<Json>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(optional)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AttentionNewEvent {
    pub event_id: String,
    pub item: Json,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AttentionRefEvent {
    pub event_id: String,
    pub attention_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LedgerAppendedEvent {
    pub event_id: String,
    pub row: Json,
}

/// Envelope inside a Web PubSub `message` frame's `data`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireEvent {
    pub event_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub payload: Value,
}

/// Empty payload for `settings_requested`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct Empty {}
