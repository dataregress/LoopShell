//! Connection loop for the reliable JSON subprotocol.
//!
//! ```text
//! negotiate (bearer) -> connect ws (subprotocol) -> joinGroup user:<id>
//! loop: message{sequenceId,data} -> sequenceAck -> dedupe(eventId) -> emit
//! disconnect -> reconnect with reconnectionToken, backoff 0.5s..30s + jitter
//! ```

use std::{sync::Arc, time::Duration};

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;
use tokio::sync::Notify;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};

use super::{backoff, dedupe::Dedupe};
use crate::{
    api,
    ipc::{
        events::{AttentionExpired, AttentionNew, AttentionResolved, LedgerAppended, TaskState},
        types::{
            AttentionNewEvent, AttentionRefEvent, ConnectivityState, LedgerAppendedEvent, TaskStateEvent, WireEvent,
        },
    },
    state::AppState,
};

pub const SUBPROTOCOL: &str = "json.reliable.webpubsub.azure.v1";
const HEARTBEAT: Duration = Duration::from_secs(20);
const DEDUPE_CAPACITY: usize = 1_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Frame {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    sequence_id: Option<u64>,
    #[serde(default)]
    data: Option<Value>,
    #[serde(default)]
    reconnection_token: Option<String>,
    #[serde(default)]
    connection_id: Option<String>,
    #[serde(default)]
    success: Option<bool>,
}

pub async fn run(app: AppHandle, api: api::Client, user_id: String, wake: Arc<Notify>) {
    let mut attempt: u32 = 0;
    let mut dedupe = Dedupe::new(DEDUPE_CAPACITY);
    let mut reconnection: Option<(String, String)> = None; // (connectionId, token)

    loop {
        let realtime = &app.state::<AppState>().realtime;
        match session(&app, &api, &user_id, &mut dedupe, &mut reconnection, &mut attempt).await {
            Ok(()) => {
                // Clean close requested by the server: reconnect promptly.
                attempt = 0;
            }
            Err(err) => {
                attempt = attempt.saturating_add(1);
                log::warn!("realtime disconnected (attempt {attempt}): {err:#}");
            }
        }
        let next = if attempt >= 3 { ConnectivityState::Offline } else { ConnectivityState::Reconnecting };
        realtime.set_state(&app, next);
        let delay = backoff(attempt);
        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = wake.notified() => { log::debug!("realtime: reconnect requested"); }
        }
    }
}

/// One connection, from negotiate to disconnect.
async fn session(
    app: &AppHandle,
    api: &api::Client,
    user_id: &str,
    dedupe: &mut Dedupe,
    reconnection: &mut Option<(String, String)>,
    attempt: &mut u32,
) -> anyhow::Result<()> {
    let negotiated = api.negotiate().await?;
    let mut url = url::Url::parse(&negotiated.url)?;
    if let Some((connection_id, token)) = reconnection.take() {
        url.query_pairs_mut()
            .append_pair("awps_connection_id", &connection_id)
            .append_pair("awps_reconnection_token", &token);
    }
    let mut request = url.as_str().into_client_request()?;
    request.headers_mut().insert("Sec-WebSocket-Protocol", SUBPROTOCOL.parse()?);

    let (ws, _response) = tokio_tungstenite::connect_async(request).await?;
    let (mut sink, mut stream) = ws.split();
    log::info!("realtime connected to {}", url.host_str().unwrap_or("?"));

    let join = json!({ "type": "joinGroup", "group": format!("user:{user_id}"), "ackId": 1 });
    sink.send(Message::Text(join.to_string().into())).await?;

    *attempt = 0;
    app.state::<AppState>().realtime.set_state(app, ConnectivityState::Online);

    let mut heartbeat = tokio::time::interval(HEARTBEAT);
    heartbeat.tick().await; // first tick fires immediately
    let mut missed: u8 = 0;

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                missed += 1;
                if missed > 2 {
                    anyhow::bail!("heartbeat: 2 pings unanswered");
                }
                sink.send(Message::Ping(Vec::new().into())).await?;
            }
            next = stream.next() => {
                let Some(msg) = next else { anyhow::bail!("socket closed") };
                let msg = msg?;
                match msg {
                    Message::Pong(_) => { missed = 0; }
                    Message::Ping(payload) => { sink.send(Message::Pong(payload)).await?; }
                    Message::Close(frame) => {
                        log::info!("realtime: server closed ({frame:?})");
                        return Ok(());
                    }
                    Message::Text(text) => {
                        missed = 0;
                        let Ok(frame) = serde_json::from_str::<Frame>(text.as_str()) else {
                            log::debug!("realtime: unparseable frame dropped");
                            continue;
                        };
                        match frame.kind.as_str() {
                            "system" => {
                                if let (Some(id), Some(token)) = (frame.connection_id, frame.reconnection_token) {
                                    *reconnection = Some((id, token));
                                }
                            }
                            "ack" => {
                                if frame.success == Some(false) {
                                    log::warn!("realtime: joinGroup was not acknowledged");
                                }
                            }
                            "message" => {
                                if let Some(seq) = frame.sequence_id {
                                    let ack = json!({ "type": "sequenceAck", "sequenceId": seq });
                                    sink.send(Message::Text(ack.to_string().into())).await?;
                                }
                                if let Some(data) = frame.data {
                                    dispatch(app, data, dedupe);
                                }
                            }
                            other => log::debug!("realtime: ignoring frame type {other}"),
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

/// Validate the envelope and the top-level payload shape, dedupe, then emit
/// the matching IPC event (docs/shell-architecture.md §5.2 wire-to-IPC table).
fn dispatch(app: &AppHandle, data: Value, dedupe: &mut Dedupe) {
    let wire: WireEvent = match serde_json::from_value(data) {
        Ok(w) => w,
        Err(err) => {
            log::warn!("realtime: malformed wire event dropped: {err}");
            return;
        }
    };
    if !dedupe.insert(&wire.event_id) {
        log::debug!("realtime: duplicate event {} dropped", wire.event_id);
        return;
    }
    // IPC payloads carry the envelope's eventId; splice it into the object.
    let mut payload = wire.payload;
    if let Value::Object(map) = &mut payload {
        map.insert("eventId".into(), Value::String(wire.event_id.clone()));
    }
    let result: tauri::Result<()> = match wire.kind.as_str() {
        "journey.updated" => parse(payload).map(|p: TaskStateEvent| TaskState(p).emit(app)).unwrap_or(Ok(())),
        "attention.created" => match parse::<AttentionNewEvent>(payload) {
            Some(p) => {
                let title = p.item.0.get("title").and_then(Value::as_str).map(str::to_owned);
                let r = AttentionNew(p).emit(app);
                // Panel hidden: pop it on Attention (unless paused/presenting) and nudge via the OS.
                crate::windows::attention_arrived(app);
                notify(app, title.as_deref());
                r
            }
            None => Ok(()),
        },
        "attention.resolved" => {
            parse(payload).map(|p: AttentionRefEvent| AttentionResolved(p).emit(app)).unwrap_or(Ok(()))
        }
        "attention.expired" => {
            parse(payload).map(|p: AttentionRefEvent| AttentionExpired(p).emit(app)).unwrap_or(Ok(()))
        }
        "ledger.appended" => parse(payload).map(|p: LedgerAppendedEvent| LedgerAppended(p).emit(app)).unwrap_or(Ok(())),
        other => {
            log::debug!("realtime: unknown wire event {other} dropped");
            Ok(())
        }
    };
    if let Err(err) = result {
        log::warn!("realtime: emit failed: {err}");
    }
}

/// OS toast for a new Attention item while the panel is hidden and not paused (docs/ui-ux.md §3.3).
fn notify(app: &AppHandle, title: Option<&str>) {
    use tauri_plugin_notification::NotificationExt;
    let state = app.state::<AppState>();
    let dock = state.dock();
    if dock.paused || state.presenting.load(std::sync::atomic::Ordering::Relaxed) {
        return;
    }
    let result = app
        .notification()
        .builder()
        .title("Loop needs you")
        .body(title.unwrap_or("An item is waiting for your decision."))
        .show();
    if let Err(err) = result {
        log::debug!("notification failed: {err}");
    }
}

fn parse<T: serde::de::DeserializeOwned>(payload: Value) -> Option<T> {
    match serde_json::from_value::<T>(payload) {
        Ok(v) => Some(v),
        Err(err) => {
            log::warn!("realtime: payload failed validation and was dropped: {err}");
            None
        }
    }
}
