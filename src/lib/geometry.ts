/**
 * Window geometry shared by the browser harness and (by value) the Rust
 * shell in src-tauri/src/windows/placement.rs. Logical pixels.
 */
export const PILL_W = 56;
/** Loop mark on top, then the three mode buttons (docs/ui-ux.md §2.1). */
export const PILL_H = 180;
/** Collapsed edge tab (docs/ui-ux.md §2.1, ADR-005). */
export const TAB_W = 20;
/** Same height as the expanded pill (docs/ui-ux.md §2.1). */
export const TAB_H = PILL_H;
export const PANEL_W = 380;
export const PANEL_H = 640;
/** Gap between the pill and the panel. */
export const PANEL_GAP = 8;
/** Work-area inset the panel keeps top and bottom. */
export const PANEL_INSET = 8;
/** Tab → pill chrome slide inside the fixed anchor window (docs/ui-ux.md §5, ADR-005). */
export const ANCHOR_EXPAND_MS = 180;
/** Pill → tab chrome slide; the window region closes and the tab chrome swaps in after it. */
export const ANCHOR_COLLAPSE_MS = 150;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Pill placement in a work area (docs/shell-architecture.md §2.1). Always the expanded 56×180 rect. */
export function placePill(work: Rect, savedY: number | null): Rect {
  const y = savedY ?? work.y + Math.round(work.h * 0.4);
  return { x: work.x + work.w - PILL_W, y: clamp(y, work.y, work.y + work.h - PILL_H), w: PILL_W, h: PILL_H };
}

/** Collapsed tab, flush with the pill's outer edge, same height as the pill. */
export function placeTab(pill: Rect): Rect {
  return {
    x: pill.x + pill.w - TAB_W,
    y: pill.y,
    w: TAB_W,
    h: TAB_H,
  };
}

/** Panel placement relative to the pill. Height clamps to the work area minus 48. */
export function placePanel(work: Rect, pill: Rect): Rect {
  const h = Math.min(PANEL_H, work.h - 48);
  const centreY = pill.y + pill.h / 2;
  const y = clamp(Math.round(centreY - h * 0.35), work.y + PANEL_INSET, work.y + work.h - h - PANEL_INSET);
  let x = pill.x - PANEL_W - PANEL_GAP;
  if (x < work.x) x = Math.max(work.x, work.x + work.w - PANEL_W);
  return { x, y, w: PANEL_W, h };
}
