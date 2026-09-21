//! Every UI -> Rust command (docs/shell-architecture.md §5.1). Thin: validate,
//! delegate, map errors to `IpcError`. Parameter names are what the generated
//! bindings expose, so keep them stable.

use tauri::{AppHandle, Manager, State};

use super::types::*;
use crate::{
    error::{IpcError, IpcResult},
    native, session_sign_out,
    state::AppState,
    tray, windows,
};

// ---- Dock and pill -------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn dock_get_state(state: State<'_, AppState>) -> DockState {
    state.dock()
}

#[tauri::command]
#[specta::specta]
pub fn dock_show(app: AppHandle, req: DockShowRequest) -> DockState {
    windows::show(&app, req.mode, req.reason)
}

/// Called by the UI once its exit animation has completed, whether the hide
/// started in the UI (Esc) or in Rust (`dock_state_changed { open: false }`).
#[tauri::command]
#[specta::specta]
pub fn dock_hide(app: AppHandle, req: DockHideRequest) -> DockState {
    windows::hide_now(&app, req.reason)
}

#[tauri::command]
#[specta::specta]
pub fn dock_pin(app: AppHandle, req: DockPinRequest) -> DockState {
    windows::pin(&app, req.pinned)
}

#[tauri::command]
#[specta::specta]
pub fn dock_set_mode(app: AppHandle, req: DockSetModeRequest) -> DockState {
    windows::set_mode(&app, req.mode)
}

/// The user clicked the composer (or another focus target): Passive -> Active.
#[tauri::command]
#[specta::specta]
pub fn dock_activate(app: AppHandle) {
    windows::activate(&app);
}

#[tauri::command]
#[specta::specta]
pub fn dock_open_settings(app: AppHandle) {
    use tauri_specta::Event;
    windows::show(&app, None, ShowReason::Tray);
    let _ = super::events::SettingsRequested(Empty {}).emit(&app);
}

#[tauri::command]
#[specta::specta]
pub fn anchor_set_y(app: AppHandle, req: AnchorSetYRequest) -> AnchorY {
    if !req.y_logical.is_finite() {
        return AnchorY { y_logical: 0.0 };
    }
    AnchorY { y_logical: windows::anchor_set_y(&app, req.y_logical, req.commit) }
}

#[tauri::command]
#[specta::specta]
pub fn anchor_hide(app: AppHandle) -> DockState {
    windows::set_pill_visible(&app, false)
}

#[tauri::command]
#[specta::specta]
pub fn anchor_show(app: AppHandle) -> DockState {
    windows::set_pill_visible(&app, true)
}

#[tauri::command]
#[specta::specta]
pub fn anchor_menu_popup(app: AppHandle) -> IpcResult<()> {
    tray::popup_at_anchor(&app)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn anchor_set_expanded(app: AppHandle, req: AnchorSetExpandedRequest) {
    windows::anchor_set_expanded(&app, req.expanded);
}

#[tauri::command]
#[specta::specta]
pub fn pause_set(app: AppHandle, req: PauseSetRequest) -> DockState {
    windows::set_paused(&app, req.until_epoch_ms.filter(|ms| ms.is_finite()))
}

#[tauri::command]
#[specta::specta]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}

// ---- Identity ----------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn auth_sign_in(app: AppHandle) -> IpcResult<Session> {
    let state = app.state::<AppState>();
    crate::emit_session(&app, state.auth.session());
    let session = state.auth.sign_in(&app).await;
    match &session {
        Ok(s) => crate::session_started(&app, s.clone()),
        Err(_) => crate::emit_session(&app, state.auth.session()),
    }
    session
}

#[tauri::command]
#[specta::specta]
pub async fn auth_sign_out(app: AppHandle) -> IpcResult<()> {
    session_sign_out(&app, SignOutReason::User).await;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn auth_get_session(state: State<'_, AppState>) -> Session {
    state.auth.session()
}

// ---- Journeys ---------------------------------------------------------------------

fn require_session(state: &AppState) -> IpcResult<()> {
    if state.auth.is_signed_in() {
        Ok(())
    } else {
        Err(IpcError::unauthenticated())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn ask_submit(state: State<'_, AppState>, req: AskSubmitRequest) -> IpcResult<AskSubmitResult> {
    require_session(&state)?;
    let text = req.text.trim();
    if text.is_empty() {
        return Err(IpcError::invalid("Ask something first."));
    }
    if text.chars().count() > 2000 {
        return Err(IpcError::invalid("Keep the ask under 2000 characters."));
    }
    state.api.ask_submit(&AskSubmitRequest { text: text.to_owned(), ..req }).await
}

#[tauri::command]
#[specta::specta]
pub async fn ask_cancel(state: State<'_, AppState>, req: AskCancelRequest) -> IpcResult<()> {
    require_session(&state)?;
    state.api.ask_cancel(&req).await
}

#[tauri::command]
#[specta::specta]
pub async fn attention_list(state: State<'_, AppState>) -> IpcResult<Vec<Json>> {
    require_session(&state)?;
    Ok(state.api.attention_list().await?.into_iter().map(Json).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn attention_decide(state: State<'_, AppState>, req: AttentionDecision) -> IpcResult<AttentionDecideResult> {
    require_session(&state)?;
    if req.decision.trim().is_empty() {
        return Err(IpcError::invalid("A decision is required."));
    }
    state.api.attention_decide(&req).await
}

#[tauri::command]
#[specta::specta]
pub async fn ledger_query(state: State<'_, AppState>, req: LedgerQuery) -> IpcResult<LedgerPage> {
    require_session(&state)?;
    let limit = req.limit.unwrap_or(100).clamp(1, 200);
    state.api.ledger_query(&LedgerQuery { limit: Some(limit), ..req }).await
}

#[tauri::command]
#[specta::specta]
pub async fn journey_get(state: State<'_, AppState>, req: JourneyGetRequest) -> IpcResult<Json> {
    require_session(&state)?;
    Ok(Json(state.api.journey_get(&req.journey_id).await?))
}

// ---- Settings and misc --------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
#[specta::specta]
pub fn settings_set(app: AppHandle, req: Settings) -> IpcResult<Settings> {
    let state = app.state::<AppState>();
    let previous = {
        let mut current = state.settings.lock();
        let previous = current.clone();
        *current = req.clone();
        previous
    };
    state.store.save_settings(&req).map_err(|e| IpcError::internal(format!("Could not save settings: {e}")))?;
    windows::apply_settings(&app, &previous, &req);
    crate::emit_settings(&app, req.clone());
    Ok(req)
}

#[tauri::command]
#[specta::specta]
pub fn monitors_list(app: AppHandle) -> Vec<MonitorInfo> {
    windows::monitors_list(&app)
}

/// Opens https links (and configured hosts) in the system browser. Never file:, javascript:, or custom schemes.
#[tauri::command]
#[specta::specta]
pub fn open_external(state: State<'_, AppState>, req: OpenExternalRequest) -> IpcResult<()> {
    let url = url::Url::parse(req.url.trim())?;
    let host = url.host_str().map(|h| h.to_ascii_lowercase()).unwrap_or_default();
    let allowed = match url.scheme() {
        "https" => {
            state.config.external_hosts.is_empty()
                || state.config.external_hosts.iter().any(|h| host == *h || host.ends_with(&format!(".{h}")))
        }
        "mailto" => true,
        _ => false,
    };
    if !allowed {
        return Err(IpcError::new(
            crate::error::IpcErrorCode::Rejected,
            format!("Refusing to open {}", url.scheme()),
            false,
        ));
    }
    native::open_url(&url).map_err(|e| IpcError::internal(e.to_string()))
}

/// UI telemetry breadcrumbs; forwarded to the trace pipeline (log-only until Sentry/OTel land).
#[tauri::command]
#[specta::specta]
pub fn telemetry_event(req: TelemetryEventRequest) {
    log::info!(target: "telemetry", "{} {}", req.name, req.props.0);
}
