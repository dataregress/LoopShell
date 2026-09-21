//! Pill and panel geometry (docs/shell-architecture.md §2.1). Pure functions
//! over physical pixels; `src/lib/geometry.ts` holds the same constants for
//! the browser harness. Keep the two in step.

/// Logical (DIP) sizes at 100 % scale.
pub const PILL_W: f64 = 56.0;
/// Loop mark on top, then the three mode buttons (docs/ui-ux.md §2.1).
pub const PILL_H: f64 = 180.0;
/// Collapsed edge tab (ADR-005).
pub const TAB_W: f64 = 20.0;
/// Same height as the expanded pill (ADR-005).
pub const TAB_H: f64 = PILL_H;
pub const PANEL_W: f64 = 380.0;
pub const PANEL_H: f64 = 640.0;
/// Gap between the pill and the panel.
pub const PANEL_GAP: f64 = 8.0;
/// Work-area inset the panel keeps top and bottom.
pub const PANEL_INSET: f64 = 8.0;
/// Panel height is clamped to the work area minus this.
pub const PANEL_HEIGHT_RESERVE: f64 = 48.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub const fn new(x: f64, y: f64, w: f64, h: f64) -> Self {
        Self { x, y, w, h }
    }
    pub fn right(&self) -> f64 {
        self.x + self.w
    }
    pub fn bottom(&self) -> f64 {
        self.y + self.h
    }
    pub fn center_y(&self) -> f64 {
        self.y + self.h / 2.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edge {
    Right,
    Left,
}

pub fn clamp(n: f64, lo: f64, hi: f64) -> f64 {
    if hi < lo {
        lo
    } else {
        n.max(lo).min(hi)
    }
}

/// Pill placement on a work area (physical px, `scale` = monitor scale factor).
/// `saved_offset_logical` is the persisted top offset from the work-area top in DIP.
pub fn place_pill(work: Rect, scale: f64, edge: Edge, saved_offset_logical: Option<f64>) -> Rect {
    let w = PILL_W * scale;
    let h = PILL_H * scale;
    let default_y = work.y + (work.h * 0.4).round();
    let y = saved_offset_logical.map(|o| work.y + o * scale).unwrap_or(default_y);
    let x = match edge {
        Edge::Right => work.right() - w,
        Edge::Left => work.x,
    };
    Rect::new(x.round(), clamp(y, work.y, work.bottom() - h).round(), w.round(), h.round())
}

/// Panel placement beside the pill, on the pill's inner side.
pub fn place_panel(work: Rect, scale: f64, edge: Edge, pill: Rect) -> Rect {
    let w = PANEL_W * scale;
    let h = (PANEL_H * scale).min(work.h - PANEL_HEIGHT_RESERVE * scale).max(0.0);
    let inset = PANEL_INSET * scale;
    let y = clamp((pill.center_y() - h * 0.35).round(), work.y + inset, work.bottom() - h - inset);
    let mut x = match edge {
        Edge::Right => pill.x - w - PANEL_GAP * scale,
        Edge::Left => pill.right() + PANEL_GAP * scale,
    };
    // Very narrow display: overlap the pill rather than leave the work area.
    if x < work.x || x + w > work.right() {
        x = match edge {
            Edge::Right => (work.right() - w).max(work.x),
            Edge::Left => work.x,
        };
    }
    Rect::new(x.round(), y.round(), w.round(), h.round())
}

/// Screen rect of the visible anchor chrome: the pill when expanded, else the
/// tab strip on the screen-edge side of it (ADR-005).
pub fn anchor_window_for(pill: Rect, scale: f64, edge: Edge, expanded: bool) -> Rect {
    if expanded {
        return pill;
    }
    let w = (TAB_W * scale).round();
    let x = match edge {
        Edge::Right => pill.right() - w,
        Edge::Left => pill.x,
    };
    Rect::new(x, pill.y, w, pill.h)
}

/// Window region for the anchor HWND (which always spans the pill), in
/// window-relative physical px. `None` when expanded: the whole window shows.
/// Collapsed, only the tab strip is drawn and hit-tested; clicks in the
/// remaining gutter fall through to the window beneath (ADR-005).
pub fn anchor_region_for(pill: Rect, scale: f64, edge: Edge, expanded: bool) -> Option<Rect> {
    if expanded {
        return None;
    }
    let tab = anchor_window_for(pill, scale, edge, false);
    Some(Rect::new(tab.x - pill.x, 0.0, tab.w, tab.h))
}

/// Panel HWND matches the panel chrome (no shadow margin).
pub fn panel_window_for(panel: Rect, _scale: f64) -> Rect {
    panel
}

/// Does the panel cover the pill's edge? Then the pill hides while the panel is open.
pub fn panel_overlaps_pill(panel: Rect, pill: Rect) -> bool {
    panel.x < pill.right() && panel.right() > pill.x && panel.y < pill.bottom() && panel.bottom() > pill.y
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Rect = Rect::new(0.0, 0.0, 1920.0, 1032.0);

    #[test]
    fn pill_sits_flush_right_at_40_percent_by_default() {
        let pill = place_pill(WORK, 1.0, Edge::Right, None);
        assert_eq!(pill, Rect::new(1864.0, 413.0, PILL_W, PILL_H));
    }

    #[test]
    fn pill_y_is_clamped_to_the_work_area() {
        assert_eq!(place_pill(WORK, 1.0, Edge::Right, Some(-500.0)).y, 0.0);
        assert_eq!(place_pill(WORK, 1.0, Edge::Right, Some(5000.0)).y, 1032.0 - PILL_H);
    }

    #[test]
    fn pill_scales_with_the_monitor() {
        let pill = place_pill(WORK, 1.5, Edge::Right, Some(100.0));
        assert_eq!(pill.w, PILL_W * 1.5);
        assert_eq!(pill.h, PILL_H * 1.5);
        assert_eq!(pill.y, 150.0);
        assert_eq!(pill.x, 1920.0 - PILL_W * 1.5);
    }

    #[test]
    fn panel_opens_beside_the_pill_with_the_gap() {
        let pill = place_pill(WORK, 1.0, Edge::Right, None);
        let panel = place_panel(WORK, 1.0, Edge::Right, pill);
        assert_eq!(panel.right(), pill.x - PANEL_GAP);
        assert_eq!(panel.w, PANEL_W);
        assert_eq!(panel.h, PANEL_H);
        // Vertically aligned to 35 % below the pill centre, inside the insets.
        assert_eq!(panel.y, (pill.center_y() - PANEL_H * 0.35).round());
    }

    #[test]
    fn panel_height_clamps_on_short_displays() {
        let short = Rect::new(0.0, 0.0, 1366.0, 600.0);
        let pill = place_pill(short, 1.0, Edge::Right, None);
        let panel = place_panel(short, 1.0, Edge::Right, pill);
        assert_eq!(panel.h, 600.0 - PANEL_HEIGHT_RESERVE);
        assert!(panel.y >= PANEL_INSET);
        assert!(panel.bottom() <= short.bottom() - PANEL_INSET);
    }

    #[test]
    fn panel_overlaps_pill_on_very_narrow_displays() {
        let narrow = Rect::new(0.0, 0.0, 400.0, 900.0);
        let pill = place_pill(narrow, 1.0, Edge::Right, None);
        let panel = place_panel(narrow, 1.0, Edge::Right, pill);
        assert_eq!(panel.x, narrow.right() - PANEL_W);
        assert!(panel_overlaps_pill(panel, pill));
    }

    #[test]
    fn left_edge_mirrors_right_edge() {
        let pill = place_pill(WORK, 1.0, Edge::Left, None);
        assert_eq!(pill.x, 0.0);
        let panel = place_panel(WORK, 1.0, Edge::Left, pill);
        assert_eq!(panel.x, pill.right() + PANEL_GAP);
        let win = anchor_window_for(pill, 1.0, Edge::Left, false);
        assert_eq!(win.x, 0.0);
        assert_eq!(win.w, TAB_W);
        let expanded = anchor_window_for(pill, 1.0, Edge::Left, true);
        assert_eq!(expanded, pill);
    }

    #[test]
    fn collapsed_tab_is_flush_right_and_same_height_as_the_pill() {
        let pill = place_pill(WORK, 1.0, Edge::Right, None);
        let tab = anchor_window_for(pill, 1.0, Edge::Right, false);
        assert_eq!(tab, Rect::new(pill.right() - TAB_W, pill.y, TAB_W, TAB_H));
    }

    #[test]
    fn collapsed_region_is_the_tab_strip_on_the_screen_edge() {
        let pill = place_pill(WORK, 1.5, Edge::Right, None);
        let region = anchor_region_for(pill, 1.5, Edge::Right, false).unwrap();
        assert_eq!(region, Rect::new(pill.w - TAB_W * 1.5, 0.0, TAB_W * 1.5, pill.h));
        let left = place_pill(WORK, 1.0, Edge::Left, None);
        assert_eq!(anchor_region_for(left, 1.0, Edge::Left, false).unwrap(), Rect::new(0.0, 0.0, TAB_W, TAB_H));
    }

    #[test]
    fn expanded_window_matches_the_pill() {
        let pill = place_pill(WORK, 1.0, Edge::Right, None);
        let win = anchor_window_for(pill, 1.0, Edge::Right, true);
        assert_eq!(win, pill);
        assert_eq!(anchor_region_for(pill, 1.0, Edge::Right, true), None);
        let panel = place_panel(WORK, 1.0, Edge::Right, pill);
        assert_eq!(panel_window_for(panel, 1.0), panel);
    }
}
