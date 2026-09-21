//! The two windows and the dock state machine (docs/shell-architecture.md
//! §2-§3). Everything that shows, hides, moves or focuses a window goes
//! through here so `dock_state_changed` always reflects reality.

pub mod placement;

use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    sync::atomic::Ordering,
    time::Duration,
};

use tauri::{AppHandle, Manager, Monitor, WebviewWindow};
use tauri_specta::Event;

use crate::{
    ipc::{
        events::DockStateChanged,
        types::{
            DockState, Edge as SettingsEdge, HideReason, Mode, MonitorInfo, Settings, ShowReason,
        },
    },
    native, now_epoch_ms,
    state::AppState,
};
use placement::{Edge, Rect};

pub const ANCHOR: &str = "anchor";
pub const PANEL: &str = "panel";

/// How long the UI gets to run its exit animation before Rust hides anyway (§2.3).
const HIDE_FALLBACK: Duration = Duration::from_millis(250);

pub fn anchor(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(ANCHOR)
}

pub fn panel(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(PANEL)
}

pub fn emit_state(app: &AppHandle) -> DockState {
    let state = app.state::<AppState>().dock();
    if let Err(err) = DockStateChanged(state.clone()).emit(app) {
        log::warn!("emit dock_state_changed failed: {err}");
    }
    crate::tray::refresh(app);
    state
}

// ---- Monitors and geometry ---------------------------------------------------

fn edge_of(settings: &Settings) -> Edge {
    match settings.edge {
        SettingsEdge::Right => Edge::Right,
        SettingsEdge::Left => Edge::Left,
    }
}

/// Stable key for the current monitor arrangement (names, positions, scales).
pub fn layout_key(app: &AppHandle) -> String {
    let mut monitors = app.available_monitors().unwrap_or_default();
    monitors.sort_by_key(|m| (m.position().x, m.position().y));
    let mut h = DefaultHasher::new();
    for m in &monitors {
        m.name().cloned().unwrap_or_default().hash(&mut h);
        m.position().x.hash(&mut h);
        m.position().y.hash(&mut h);
        m.size().width.hash(&mut h);
        m.size().height.hash(&mut h);
        m.scale_factor().to_bits().hash(&mut h);
    }
    format!("{:016x}", h.finish())
}

/// The display the pill lives on: the configured one if present, else primary.
pub fn target_monitor(app: &AppHandle, settings: &Settings) -> Option<Monitor> {
    let monitors = app.available_monitors().unwrap_or_default();
    if let Some(name) = &settings.display {
        if let Some(m) = monitors.iter().find(|m| m.name() == Some(name)) {
            return Some(m.clone());
        }
        log::info!("configured display {name:?} not present; using primary");
    }
    app.primary_monitor().ok().flatten().or_else(|| monitors.into_iter().next())
}

pub fn monitors_list(app: &AppHandle) -> Vec<MonitorInfo> {
    let primary = app.primary_monitor().ok().flatten();
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| MonitorInfo {
            name: m.name().cloned().unwrap_or_else(|| "Display".to_owned()),
            primary: primary.as_ref().map(|p| p.position() == m.position()).unwrap_or(false),
            scale_factor: m.scale_factor(),
        })
        .collect()
}

#[derive(Debug, Clone, Copy)]
pub struct Geometry {
    pub work: Rect,
    pub scale: f64,
    pub edge: Edge,
    pub pill: Rect,
    pub panel: Rect,
}

pub fn geometry(app: &AppHandle) -> Option<Geometry> {
    let state = app.state::<AppState>();
    let settings = state.settings();
    let monitor = target_monitor(app, &settings)?;
    let wa = monitor.work_area();
    let work = Rect::new(wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64);
    let scale = monitor.scale_factor();
    let edge = edge_of(&settings);
    let saved = state.layouts.lock().pill_y.get(&layout_key(app)).copied();
    let pill = placement::place_pill(work, scale, edge, saved);
    let panel = placement::place_panel(work, scale, edge, pill);
    Some(Geometry { work, scale, edge, pill, panel })
}

fn set_rect(window: &WebviewWindow, rect: Rect, _scale: f64) {
    native::set_physical_rect(window, rect.x as i32, rect.y as i32, rect.w as i32, rect.h as i32);
}

/// Re-place both windows from the current monitor and saved position.
pub fn place_windows(app: &AppHandle) {
    let Some(g) = geometry(app) else {
        log::warn!("no monitor available; windows not placed");
        return;
    };
    if let Some(w) = anchor(app) {
        let expanded = app.state::<AppState>().pill_expanded.load(Ordering::Relaxed);
        apply_anchor_shape(&w, &g, expanded);
    }
    if let Some(w) = panel(app) {
        set_rect(&w, placement::panel_window_for(g.panel, g.scale), g.scale);
    }
}

// ---- Show / hide -------------------------------------------------------------

pub fn show(app: &AppHandle, mode: Option<Mode>, reason: ShowReason) -> DockState {
    let state = app.state::<AppState>();
    state.hide_generation.fetch_add(1, Ordering::Relaxed);
    let Some(g) = geometry(app) else { return state.dock() };
    {
        let mut dock = state.dock.lock();
        if let Some(m) = mode {
            dock.mode = m;
        }
        dock.open = true;
        dock.active = false;
    }
    if let Some(w) = panel(app) {
        set_rect(&w, placement::panel_window_for(g.panel, g.scale), g.scale);
        native::capture_foreground();
        if let Err(err) = w.show() {
            log::warn!("panel show failed: {err}");
        }
    }
    // The pill stays expanded while the panel is open (ADR-005).
    state.pill_expanded.store(true, Ordering::Relaxed);
    if placement::panel_overlaps_pill(g.panel, g.pill) {
        if let Some(a) = anchor(app) {
            let _ = a.hide();
        }
    } else if let Some(a) = anchor(app) {
        apply_anchor_shape(&a, &g, true);
    }
    log::info!("dock shown ({reason:?})");
    emit_state(app)
}

/// Ask the UI to animate out; hide for real when it calls `dock_hide` or after the fallback.
pub fn request_hide(app: &AppHandle, reason: HideReason) -> DockState {
    let state = app.state::<AppState>();
    let generation = state.hide_generation.fetch_add(1, Ordering::Relaxed) + 1;
    {
        let mut dock = state.dock.lock();
        if !dock.open {
            return dock.clone();
        }
        dock.open = false;
        dock.active = false;
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(HIDE_FALLBACK).await;
        let state = handle.state::<AppState>();
        if state.hide_generation.load(Ordering::Relaxed) == generation && !state.dock.lock().open {
            log::debug!("hide fallback fired ({reason:?})");
            hide_now(&handle, reason);
        }
    });
    emit_state(app)
}

/// Hide the window and restore focus (§3.3). Safe to call twice.
pub fn hide_now(app: &AppHandle, reason: HideReason) -> DockState {
    let state = app.state::<AppState>();
    let was_active = {
        let mut dock = state.dock.lock();
        let was = dock.active;
        dock.open = false;
        dock.active = false;
        was
    };
    if let Some(w) = panel(app) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        }
        if was_active {
            native::restore_foreground(&w);
        }
    }
    // Bring the pill back if it hid under an overlapping panel.
    if state.dock.lock().pill_visible {
        if let Some(a) = anchor(app) {
            let _ = a.show();
        }
    }
    log::info!("dock hidden ({reason:?})");
    emit_state(app)
}

pub fn toggle(app: &AppHandle, reason: ShowReason) -> DockState {
    let open = app.state::<AppState>().dock.lock().open;
    if open {
        request_hide(app, HideReason::Pill)
    } else {
        show(app, None, reason)
    }
}

pub fn pin(app: &AppHandle, pinned: bool) -> DockState {
    app.state::<AppState>().dock.lock().pinned = pinned;
    emit_state(app)
}

pub fn set_mode(app: &AppHandle, mode: Mode) -> DockState {
    app.state::<AppState>().dock.lock().mode = mode;
    emit_state(app)
}

/// Passive -> Active: only ever from an explicit user action (composer click, hotkey).
pub fn activate(app: &AppHandle) {
    let state = app.state::<AppState>();
    {
        let mut dock = state.dock.lock();
        if !dock.open || dock.active {
            return;
        }
        dock.active = true;
    }
    if let Some(w) = panel(app) {
        native::activate(&w);
    }
    emit_state(app);
}

/// The panel lost keyboard focus while Active: back to Passive; hide if unpinned (§3.1).
pub fn on_panel_blur(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (open, active, pinned) = {
        let d = state.dock.lock();
        (d.open, d.active, d.pinned)
    };
    if !open || !active {
        return;
    }
    state.dock.lock().active = false;
    if let Some(w) = panel(app) {
        // Keep the non-activating style consistent for the next Passive phase.
        native::restore_foreground(&w);
    }
    if pinned {
        emit_state(app);
    } else {
        request_hide(app, HideReason::Outside);
    }
}

/// Click that is not on the pill or panel: hide unless pinned (docs/shell-architecture.md §3.1).
pub fn on_click_outside(app: &AppHandle) {
    let (open, pinned) = {
        let state = app.state::<AppState>();
        let d = state.dock.lock();
        (d.open, d.pinned)
    };
    if !open || pinned {
        return;
    }
    request_hide(app, HideReason::Outside);
}

// ---- Pill ----------------------------------------------------------------------

/// Move the pill to `y_logical` (DIP screen coords of its top edge), clamped. Returns the applied value.
pub fn anchor_set_y(app: &AppHandle, y_logical: f64, commit: bool) -> f64 {
    let Some(g) = geometry(app) else { return y_logical };
    let top_phys = (y_logical * g.scale).round();
    let pill =
        Rect::new(g.pill.x, placement::clamp(top_phys, g.work.y, g.work.bottom() - g.pill.h), g.pill.w, g.pill.h);
    if let Some(a) = anchor(app) {
        let expanded = app.state::<AppState>().pill_expanded.load(Ordering::Relaxed);
        apply_anchor_shape(&a, &Geometry { pill, ..g }, expanded);
    }
    // The panel follows the pill; it is hidden during a drag (§2.2) so only re-place it.
    if let Some(p) = panel(app) {
        let panel_rect = placement::place_panel(g.work, g.scale, g.edge, pill);
        set_rect(&p, placement::panel_window_for(panel_rect, g.scale), g.scale);
    }
    if commit {
        let state = app.state::<AppState>();
        let offset_logical = (pill.y - g.work.y) / g.scale;
        let key = layout_key(app);
        let layouts = {
            let mut l = state.layouts.lock();
            l.pill_y.insert(key, offset_logical);
            l.clone()
        };
        if let Err(err) = state.store.save_layouts(&layouts) {
            log::warn!("saving layout failed: {err}");
        }
    }
    pill.y / g.scale
}

/// Show the anchor as the edge tab or the pill (ADR-005). The webview animates
/// the chrome; nothing native is resized while it does. The window region
/// changes once per flip: opened before the chrome grows, closed after it has
/// shrunk (the UI calls this at the end of its collapse ease). Resizing WebView2
/// mid-animation is what showed the desktop: Chromium's stale frame stays
/// anchored top-left, so a right-edge window went bare at the edge every step.
pub fn anchor_set_expanded(app: &AppHandle, expanded: bool) {
    let state = app.state::<AppState>();
    let _shape = state.anchor_shape.lock();
    state.pill_expanded.store(expanded, Ordering::Relaxed);
    let Some(g) = geometry(app) else { return };
    let Some(a) = anchor(app) else { return };
    apply_anchor_shape(&a, &g, expanded);
}

/// The anchor HWND spans the pill and a window region clips it to the tab, so
/// the collapsed gutter neither draws nor swallows clicks. Where regions are
/// unsupported the window itself snaps to the visible chrome.
fn apply_anchor_shape(a: &WebviewWindow, g: &Geometry, expanded: bool) {
    if native::supports_window_region() {
        set_rect(a, g.pill, g.scale);
        let region = placement::anchor_region_for(g.pill, g.scale, g.edge, expanded)
            .map(|r| (r.x as i32, r.y as i32, r.w as i32, r.h as i32));
        native::set_window_region(a, region);
    } else {
        set_rect(a, placement::anchor_window_for(g.pill, g.scale, g.edge, expanded), g.scale);
    }
}

pub fn set_pill_visible(app: &AppHandle, visible: bool) -> DockState {
    let state = app.state::<AppState>();
    state.dock.lock().pill_visible = visible;
    let changed = {
        let mut s = state.settings.lock();
        if s.pill_visible != visible {
            s.pill_visible = visible;
            let _ = state.store.save_settings(&s);
            Some(s.clone())
        } else {
            None
        }
    };
    if let Some(settings) = changed {
        crate::emit_settings(app, settings);
    }
    if let Some(a) = anchor(app) {
        if visible {
            let _ = a.show();
        } else {
            let _ = a.hide();
        }
    }
    emit_state(app)
}

// ---- Pause ---------------------------------------------------------------------

pub fn set_paused(app: &AppHandle, until_epoch_ms: Option<f64>) -> DockState {
    let state = app.state::<AppState>();
    let generation = state.pause_generation.fetch_add(1, Ordering::Relaxed) + 1;
    {
        let mut dock = state.dock.lock();
        dock.paused = until_epoch_ms.is_some();
        dock.paused_until_epoch_ms = until_epoch_ms;
    }
    if let Some(until) = until_epoch_ms {
        let wait = (until - now_epoch_ms()).max(0.0) as u64;
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(wait)).await;
            let state = handle.state::<AppState>();
            if state.pause_generation.load(Ordering::Relaxed) == generation {
                set_paused(&handle, None);
            }
        });
    }
    emit_state(app)
}

// ---- Session-driven visibility ---------------------------------------------------

/// Called once the startup session restore has settled (§2): the pill appears.
/// Signed out, it stays as the entry point to the sign-in view; only the
/// user's "Hide pill" removes it.
pub fn apply_session(app: &AppHandle) {
    let pill_visible = app.state::<AppState>().dock.lock().pill_visible;
    place_windows(app);
    if let Some(a) = anchor(app) {
        if pill_visible {
            let _ = a.show();
        } else {
            let _ = a.hide();
        }
    }
}

/// An Attention item arrived while hidden: pop the panel unless paused or presenting (§3.4).
pub fn attention_arrived(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (open, paused) = {
        let d = state.dock.lock();
        (d.open, d.paused)
    };
    if open || paused || state.presenting.load(Ordering::Relaxed) || !state.auth.is_signed_in() {
        return;
    }
    show(app, Some(Mode::Attention), ShowReason::Attention);
}

// ---- Settings that touch windows -------------------------------------------------

pub fn apply_settings(app: &AppHandle, previous: &Settings, next: &Settings) {
    if previous.exclude_from_capture != next.exclude_from_capture {
        for w in [anchor(app), panel(app)].into_iter().flatten() {
            native::set_capture_exclusion(&w, next.exclude_from_capture);
        }
    }
    if previous.vibrancy != next.vibrancy {
        if let Some(p) = panel(app) {
            native::set_vibrancy(&p, next.vibrancy);
        }
    }
    if previous.pill_visible != next.pill_visible {
        set_pill_visible(app, next.pill_visible);
    }
    if previous.display != next.display || previous.edge != next.edge {
        place_windows(app);
    }
    if previous.shortcut_open != next.shortcut_open || previous.shortcut_pin != next.shortcut_pin {
        if let Err(err) = crate::hotkeys::register(app, next) {
            log::warn!("hotkey registration failed: {err}");
        }
    }
    if previous.autostart != next.autostart {
        crate::autostart_set(app, next.autostart);
    }
}

/// First-run application of settings to freshly created windows.
pub fn apply_initial(app: &AppHandle, settings: &Settings) {
    for w in [anchor(app), panel(app)].into_iter().flatten() {
        native::prepare_window(&w);
        native::set_capture_exclusion(&w, settings.exclude_from_capture);
    }
    if let Some(p) = panel(app) {
        native::set_vibrancy(&p, settings.vibrancy);
    }
    {
        let state = app.state::<AppState>();
        let mut dock = state.dock.lock();
        dock.pinned = settings.pin_by_default;
        dock.pill_visible = settings.pill_visible;
    }
    place_windows(app);
}
