# ADR-003 — Anchor and panel model: always-visible click pill, two windows, no hover reveal

| | |
|---|---|
| **Status** | Superseded by [ADR-005](ADR-005-edge-tab-hover-reveal.md) |
| **Last updated** | 19 September 2026 |
| **Owner** | Waqas Ahmed (single owner for the Loop initiative; Loop Platform Team function) |
| **Audience** | Loop build team · Design |
| **Related** | [ui-ux.md](../ui-ux.md) · [shell-architecture.md](../shell-architecture.md) · [design-brief.md](../design-brief.md) · ADR-001 |

## Status

Superseded by [ADR-005](ADR-005-edge-tab-hover-reveal.md). Kept for history. The two-window model, non-activating panel, drag, tray Settings and modes-on-the-pill amendment still apply; the always-visible full pill and "no hover reveal" rule do not.

## Context

The v0.1 brief described a thin hidden strip on the right edge revealed by hover, a small floating Menu with three options, then the mode panel. Review of that model found:

- On Windows, the right screen edge is where maximised windows place their vertical scrollbar and the window close button. A full-height hover hot zone fires whenever the user reaches for either. It is the single most likely cause of pilot users uninstalling.
- Hover detection requires either a strip window that intercepts the edge or cursor polling; both cost idle CPU and add a fragile code path (multi-monitor, DPI, sleep/wake).
- The Menu state adds a tap between intent and mode.
- Comparable products with the same "always at your side" positioning (notably Superhuman Go for Windows and Mac) use a small, always-visible, click-to-open pill that the user can drag vertically and right-click for options. The pattern is familiar to users and avoids all of the above.

Only the interaction pattern is borrowed. Functional scope stays Ask, Attention, Recent (see `.cursor/rules/loop-product-invariants.mdc`).

## Decision

1. **The anchor is a pill.** A small (about 56 x 112 px at 100 % scale) always-visible, opaque-content pill on the right edge of the display it lives on. It contains the Loop mark and the Attention badge. It is never hidden by hover logic. Users may hide it from the tray; the hotkey and tray then remain the entry points.
2. **Click opens the panel directly** in the last-used mode. There is no intermediate Menu state. The mode switcher lives in the panel header.
3. **Vertical drag.** The pill can be dragged along the edge; x is pinned to the edge, y is clamped to the work area and persisted per monitor layout.
4. **Tray menu** (not on the pill or panel): Pin, Pause 1h, Hide pill, Settings, Sign out, Quit. Right-click on the pill and panel is disabled.
5. **Two windows.** `anchor` (pill) and `panel` are separate Tauri windows. Both are always-on-top, frameless, transparent, skip-taskbar, non-focusable by default. `panel` is fixed-size; Motion animates content inside it. No native resizing, no third window.
6. **Placement.** The panel opens adjacent to the pill on its inner side, vertically aligned to the pill and clamped to the work area, on the same monitor.
7. **Non-activating until typing.** Neither window activates on show. Clicking the composer (or pressing the hotkey a second time while the panel is open) activates `panel`; hiding restores the previously focused application.
8. **Hotkey.** Default Ctrl+Alt+L (Windows) / Ctrl+Option+L (macOS), configurable. Opens the panel in Ask; pressing again while open focuses the composer; Esc hides.
9. **Auto-hide.** When not pinned, the panel hides on Esc, on click outside, or 400 ms after the pointer leaves both windows with no keyboard focus inside. A pending Attention item pops the panel (unless paused or presenting) and suppresses auto-hide until the user acts, dismisses, or 60 s pass with no pointer activity.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Hidden strip with hover reveal (v0.1) | Edge collision with scrollbars/close buttons on Windows; polling cost; fragile; accidental reveals in presentations. |
| Hover reveal limited to a vertical band with dwell time | Reduces but does not remove accidental triggers; still needs the hot-zone code path; discoverability is worse than a visible pill. |
| Tray icon and hotkey only, no on-screen anchor | Loses the "one number" badge that is Attention's primary signal; discoverability for non-keyboard users is poor. |
| Menu pill between anchor and modes (v0.1) | Extra tap for every interaction; the mode switcher in the panel header serves the same purpose without it. |
| Single window that resizes between pill and panel | Native resize animations stutter, DPI transitions are ugly, and click-through/focus rules differ per state; two fixed windows are simpler and cheaper. |
| Windows AppBar (reserved screen space) | Reflows every window on the desktop; unacceptable on laptops; not available on macOS. |

## Consequences

**Positive:** no hot-zone or polling code; near-zero idle cost; no edge collisions; familiar pattern; simpler state machine (pill -> panel[mode]); position preference for the user.

**Negative:** the pill occupies a small permanent area (users can hide it); vertical drag must be implemented as clamped pointer handling rather than free `start_dragging`; two windows must be kept in sync across monitor and DPI changes.

**Follow-ups:** spike proves both windows non-activating on both OSes; placement rules verified with two monitors at different scale factors; presentation-mode suppression of pops and toasts (Windows `SHQueryUserNotificationState`, macOS Focus).

## Amendments

- **19 September 2026 — modes on the pill.** Decisions 1, 2 and 4 are refined, not reversed: the pill (now about 56 x 180 px) carries the Loop mark and one icon button per mode under it, with the Attention badge on the Attention button; clicking a mode opens the panel directly in it, so the panel header names the mode instead of switching it. Settings is removed from the pill menu and the panel overflow and is reached from the tray icon only. `docs/ui-ux.md` §2 is authoritative for the anatomy.

## References

- `docs/ui-ux.md` §2 (pill and panel interaction), `docs/shell-architecture.md` §2-§4.
- Superhuman Go desktop user guide (interaction pattern reference only): https://help.superhuman.com/hc/en-us/articles/46507604484749
