# ADR-005 — Edge tab with hover-reveal pill

| | |
|---|---|
| **Status** | Accepted (decision 3 amended 20 September 2026) |
| **Last updated** | 20 September 2026 |
| **Owner** | Waqas Ahmed (single owner for the Loop initiative; Loop Platform Team function) |
| **Audience** | Loop build team · Design |
| **Related** | [ADR-003](ADR-003-anchor-and-panel-model.md) (superseded) · [ui-ux.md](../ui-ux.md) · [shell-architecture.md](../shell-architecture.md) · [design-brief.md](../design-brief.md) |

## Status

Accepted. Supersedes ADR-003's "always-visible pill, no hover reveal" rule.

## Context

ADR-003 chose an always-visible 56 × 180 px pill so a full-height hover strip would not fight Windows scrollbars and close buttons. After using that pill, the standing chrome is too large for the default desktop. The request is a smaller default: only an edge tab visible, with the full pill (Loop mark and mode buttons) appearing when the pointer is over the tab.

The rejected v0.1 model was a *full-height* hidden strip. This decision is a short tab at the pill's persisted Y, not that strip.

## Decision

1. **Default surface is the edge tab.** 20 × 180 px (same height as the pill), flush with the right (or configured) screen edge. Top: a small Loop mark and, when count > 0, a pulsating `--attention` dot (no numeral). Middle: a small triangle pointing inboard (the expand direction). No mode buttons. It is never a full-height strip. Users may still hide it from the menu; hotkey and tray remain.
2. **Hover expands the pill.** `pointerenter` on the tab expands to the 56 × 180 px pill (mark + Ask / Attention / Recent). `pointerleave` collapses after 200 ms unless the panel is open or the pill is being dragged. An open panel keeps the pill expanded so mode buttons stay reachable.
3. **The anchor window is fixed at the pill size; a window region clips it to the tab.** The HWND is always 56 × 180. Collapsed, `SetWindowRgn` limits it to the 20 × 180 tab strip on the screen edge: outside the region nothing is drawn and hit-testing skips the window, so the gutter neither shows nor swallows clicks. Motion slides the chrome 20 → 56 (180 ms ease-out) and back (150 ms ease-in) inside the window; the region opens before the chrome grows and closes after it has shrunk. No native geometry changes while anything animates. No `set_ignore_cursor_events`. No cursor polling. No third window.

   *Amendment, 20 September 2026.* The original text eased the HWND itself in step with the chrome. WebView2 cannot repaint synchronously with `SetWindowPos`: its stale frame stays anchored to the window's top-left, so every step of a right-edge width change left the screen edge bare for a frame. The region approach keeps the same resting shapes and click behaviour without resizing the webview.
4. **Click, drag, menu, two windows, focus, hotkey, auto-hide** stay as in ADR-003 decisions 2–9 and the 19 September 2026 amendment (modes on the pill, Settings on the tray only).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep ADR-003's always-visible full pill | Occupies more standing chrome than wanted. |
| Full-height hover strip (v0.1 / ADR-003 rejected) | Edge collision with scrollbars and close buttons; accidental reveals. |
| Off-screen peek (full pill HWND hanging off the monitor) | The off-screen remainder appears on the neighbouring monitor. |
| Click-to-expand, no hover | Extra click before every mode tap; hover is the requested path. |
| `set_ignore_cursor_events` on a full-size transparent window | Banned for the anchor: it must receive clicks, and partial hit-testing is not reliable in WebView2. |
| Ease the HWND width with the chrome (original decision 3) | WebView2 repaints after `SetWindowPos`, so each step shows a bare screen edge; the gap is visible at 8 ms steps and with or without `SWP_NOCOPYBITS`. |

## Consequences

**Positive:** quiet default; Attention still visible as a pulsing dot without hover; same mode buttons and panel model once expanded.

**Negative:** a 180 px-tall band at the chosen Y can still meet a scrollbar; dwell is not used, so a passing pointer expands the pill. Presentations still use Pause / Hide pill / capture exclusion.

**Follow-ups:** if accidental expands show up in the pilot, add a short dwell (150–250 ms) without returning to a full-height strip. macOS has no window-region equivalent yet; there the anchor window snaps to the tab or pill at the ends of the chrome slide (to be replaced by an `NSPanel` mask in the macOS spike).

## References

- `docs/ui-ux.md` §2, `docs/shell-architecture.md` §2.
- ADR-003 (history of the always-visible pill and the full-height strip rejection).
