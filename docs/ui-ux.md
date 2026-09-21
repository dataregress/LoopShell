# Loop Dock — UI and UX Specification

| | |
|---|---|
| **Status** | Draft v0.6 |
| **Last updated** | 20 September 2026 |
| **Owner** | Loop Platform Team |
| **Audience** | UI engineer · Design · Shell engineer · Accessibility reviewer |
| **Related** | [design-brief.md](design-brief.md) · [shell-architecture.md](shell-architecture.md) · [technology.md](technology.md) · [ADR-005](adr/ADR-005-edge-tab-hover-reveal.md) |

*Ask once. It's handled.*

This document owns how Loop Dock looks and behaves for the user: the pill, the panel, the three modes, visual system, motion, accessibility and the component inventory. Functional scope is fixed by `design-brief.md` (Ask, Attention, Recent). Comparable products were used as references for interaction and visual patterns only; no function from them is in scope.

---

## 1. Principles

1. **One number.** The pill shows the Attention count and nothing else. Completed work never lights it.
2. **One tap to a mode.** The pill carries one icon button per mode; click it or press the hotkey and you are in Ask, Attention or Recent. There is no intermediate menu.
3. **Never in the way.** The panel does not take keyboard focus until the user clicks into it. It never resizes the desktop, never appears in screen shares by default, never pops during a presentation.
4. **Handoff is visible.** The user always sees which sub-agent is acting and on which platform.
5. **Agents choose card types, the dock draws them.** Six card types, fixed layout, predictable.
6. **Quiet, dense, polished.** Small type, generous whitespace inside cards, tight rows in lists, spring motion, no decoration.
7. **Both themes are first-class.** Appearance follows the OS; nothing is designed dark-first or light-first.

---

## 2. The pill (anchor)

Default: an **edge tab** the same height as the pill. Hover (or an open panel) expands it into the mode pill. [ADR-005](adr/ADR-005-edge-tab-hover-reveal.md).

### 2.1 Anatomy

**Tab** (idle), 20 × 180 logical px, flush with the screen edge, same Y as the pill:

```
 ┌──┐
 │◯ │   Loop mark, 12 px, inset from the top
 │ ·│   Attention: 6 px `--attention` dot, gentle pulse; hidden at 0
 │  │
 │ ◀│   Small triangle, `--fg-subtle`, pointing inboard (the expand direction)
 └──┘   Inner corners `--radius-card` (12 px); the screen-edge side is square
```

**Pill** (hover / panel open), 56 × 180:

```
 ┌──────┐   56 x 180 logical px. Same rounded-rectangle silhouette (inner `--radius-card`, screen-edge square) so it slides out rather than morphing a capsule
 │  ◯   │   Loop mark: open ring (primary) with a yellow spark at 2 o'clock, 28 px; ring filled while the panel is open
 │  ──  │   Hairline, 16 px, `--border`
 │  ▢   │   Ask       — Lucide `message-square`, 36 px hit target, icon 18 px
 │  ▢³  │   Attention — Lucide `bell`; the Attention badge sits on its top-right corner; hidden when 0
 │  ▢   │   Recent    — Lucide `history`
 │  ·   │   Connectivity dot: 6 px, bottom centre, only when not online
 └──────┘
```

- Icon only on the expanded pill; the title is the tooltip (native `title`): "Ask", "Attention · 3 need you", "Recent". The mark's tooltip is "Loop · Ctrl+Alt+L" (or "⌃⌥L") plus "Paused until 14:32" when paused.
- The active mode (panel open) shows `--surface-sunken` behind the icon and the icon in `--primary`; the highlight springs between buttons. Nothing is highlighted while the panel is hidden.
- Sits flush against the right edge of the display. The screen-edge side is square; the inner corners use `--radius-card` (a rounded rectangle, not a capsule). Expanding is a slide (20 → 56) with the same outline.
- Background `--surface-raised`, 1 px `--border`. No drop shadow. The anchor window is exactly the tab or the pill (no extra margin). Theme tokens apply exactly as in the panel; the anchor webview mirrors Settings via `settings_changed`.
- Vertically draggable from anywhere on it, buttons included; x is pinned. Default y is 40 % of the work-area height (top of the *expanded* pill).

### 2.2 States

| State | Visual | Trigger |
|---|---|---|
| Idle | Edge tab | Default |
| Hover | Rounded rectangle slides 20 → 56 out of the screen edge (180 ms ease-out) like a drawer: the chrome rides the moving inboard edge and the tab marks cross-fade into the toolbar (120 ms). Inner `--radius-card`, screen-edge square. Cursor pointer; the hovered button takes `--surface-sunken` | Pointer over the tab or pill |
| Leave | Collapse to the tab after 200 ms (150 ms ease-in), unless the panel is open or the pill is being dragged | Pointer left |
| Panel open | Pill stays expanded | `dock.open` |
| Pressed | Scale 0.98 | Mouse down |
| Badge | On the tab: 6 px `--attention` dot with a 2.2 s pulse. On the expanded Attention button: the numeric count. Hidden at 0 | Attention items > 0 |
| Dragging | Pill stays at its current size; panel hidden | Pointer down + move > 4 px |
| Paused | Opacity 0.6; badge still visible; mark tooltip "Paused until 14:32" | Pause 1h |
| Offline | Connectivity dot `--fg-subtle` (reconnecting) or `--danger` (offline); expanded pill only | `connectivity_changed` |
| Hidden | Not rendered; tray icon and hotkey remain | "Hide pill" |

### 2.3 Interactions

| Input | Result |
|---|---|
| Pointer enter the tab | Expand to the pill (chrome slides to 56 × 180 inside the fixed anchor window) |
| Pointer leave | Collapse to the tab after 200 ms, unless the panel is open or dragging |
| Click a mode button | Open panel in that mode (Passive); if the panel is open in another mode, switch to it |
| Click the active mode button | Hide panel |
| Click the Loop mark (tab or pill) | Open panel in last-used mode (Passive); hide it if open |
| Drag vertically (anywhere on the pill) | Move pill; clamp to work area; persist on release |
| Right-click / long-press (touch) | Nothing. Pin, Pause, Hide pill, Sign out and Quit live on the tray. |
| Middle-click | Nothing |
| Keyboard | The pill is not focusable; keyboard users use the hotkey |

### 2.4 Tray menu

The pill and panel have no context menu. Those actions live on the **tray** (taskbar) icon:

```
Pin panel                ⌃⌥P      (toggle; shows "Unpin panel" when pinned)
Pause for 1 hour                  (shows "Resume" with remaining time when paused)
Hide pill
──────────────
Sign out <displayName>
──────────────
Quit Loop
```

The tray menu is native in the dock. Pin, Pause, Hide pill, Sign out and Quit are not offered on the pill or panel.

**Settings** is on the tray menu after "Hide pill" (or "Show pill" when hidden), plus "Open Loop" at the top. Choosing Settings shows the panel and opens the Settings sheet (§3.9).

---

## 3. The panel

### 3.1 Geometry and placement

- Fixed 380 x 640 logical px (height clamped to work-area height minus 48). Radius 16, background `--surface` (vibrancy behind it when available), 1 px `--border`. No drop shadow.
- Opens 8 px inboard of the pill, vertically biased so the pill is at roughly 35 % of the panel height, clamped to the work area. See `shell-architecture.md` §2.1.
- Never resizes. Content that does not fit scrolls inside the body.

### 3.2 Layout

```
┌────────────────────────────────────────────┐
│ Header (44 px)                              │  [<]  Attention                    pin  ⋯
├────────────────────────────────────────────┤
│                                              │
│ Body (flex, scrolls)                         │  mode content
│                                              │
├────────────────────────────────────────────┤
│ Footer (mode-specific)                       │  Ask: composer · Attention: decision bar · Recent: filter chips
└────────────────────────────────────────────┘
│ Status strip (20 px, only when needed)      │  "Reconnecting…" / "Offline — decisions paused" / "Paused until 14:32"
```

- **Mode title:** the current mode's name (16 px, 600) with a back chevron when a detail view is open. Modes are chosen on the pill (§2.1) or with `Ctrl/⌘+1/2/3` when the panel is Active; the header has no switcher.
- **Pin:** icon toggle (Lucide `pin` / `pin-off`). Pinned panels ignore grace-timer and click-outside hiding; Esc still hides.
- **Overflow (⋯):** About (version, remote-config state), Sign out. Settings is not here; it comes from the tray (§2.4).

### 3.3 Open, close and focus behaviour

| Trigger | Behaviour |
|---|---|
| Pill click, tray Show, toast click | Open in last-used mode, Passive (no keyboard focus) |
| Hotkey (Ctrl+Alt+L / ⌃⌥L) | Open in **Ask**, Passive. Pressing again while open: Active with caret in the composer. Third press: hide. |
| Attention item arrives while hidden | Panel opens in Attention with the new item selected, Passive, unless paused or presenting; auto-hide is suppressed until the user acts, dismisses, or 60 s passes with no pointer activity |
| Click into composer or a text field | Active (panel takes keyboard focus); previous app is remembered |
| Esc | Hide (from any state, pinned or not); focus returns to the previous app |
| Click outside both windows | Hide unless pinned |
| Pointer leaves both windows, unpinned, not Active | Hide after 400 ms grace |
| Panel Active and pointer leaves | Stays open (typing takes precedence) |
| Session lock | Hide immediately |

Panel enter: `slideInRight` (24 px, spring) plus `stagger` on header, body, footer. Exit: 160 ms fade + 12 px slide. The webview stays mounted while hidden so entry starts on the first frame.

### 3.4 Ask

**Purpose:** a plain-language ask to the orchestrator, results as cards, actions as proposals.

**Body (thread):**

- Empty thread: a short prompt line "What do you need?" in `--fg-muted`, then **quick actions** (max 3, 36 px rows, Lucide icon + label):
  - "3 need your attention" → switches to Attention (only when count > 0)
  - "Continue: Raise P2 for payments dashboard" → reopens the last journey (only when one exists)
  - "Recent" → switches to Recent
- Thread items, newest at the bottom, auto-scroll on new content unless the user has scrolled up:
  - **User ask** — right-aligned bubble, `--surface-sunken`, 14 px, max 80 % width.
  - **Handoff chip** — left-aligned, "Handed to ServiceNow agent", `--info` text on `--info/10` background, agent icon, appears as soon as routing completes.
  - **Progress** — skeleton card (3 lines) with "Working…" label and the agent name; replaced in place by cards.
  - **Cards** — rendered by type (§3.7); stacked with 8 px gap; `fadeUp` with `stagger`.
  - **Choice** — a `choice` card with 2-3 options as full-width buttons; selecting one sends the decision and continues the same journey; the card collapses to a one-line "Chose: ServiceNow" chip.
  - **Confirmation** — `confirmation` card with options and free-text reply; nothing executes until the user decides. If the panel hides with a proposal unanswered, the proposal moves to Attention and an in-panel toast says "Moved to Attention" the next time the panel opens.
  - **Failure** — `summary` card with `tone: failure`, plain explanation, "Try again" and "Open in ServiceNow" (link) when available.
  - **Can't help yet** — `summary` card: "No agent can do this yet. Recorded for the Loop team." (only when the orchestrator returns no route).
- "New ask" text button at the top of a non-empty thread clears the view (the journey remains in Recent).

**Footer (composer):**

```
┌──────────────────────────────────────────────┐
│ [ServiceNow agent ▾]  ← context chip (only when a journey is active) │
│ Ask Loop…                                    ↑ │  textarea 1-4 lines, send button
└──────────────────────────────────────────────┘
```

- Placeholder "Ask Loop…". Enter sends; Shift+Enter inserts a newline. Send button disabled when empty or offline.
- While a task is `working`, the send button becomes a stop (cancel) icon.
- Context chip shows the active agent for follow-ups; clicking it shows "Ask something new" to start a fresh journey.
- Offline: composer disabled with the status strip explaining why.

### 3.5 Attention

**Purpose:** every journey waiting on this user.

**Body (list → detail):**

- List rows (56 px): kind icon (`confirm` check-square, `choose` list, `provide` message-square, auth key), title (14 px), second line "requester · agent · platform" (12.5 px `--fg-muted`), TTL at the right ("2 h", "14:59" under one hour, "Expired" pill).
- Sort: expiring soonest first, then newest. Expired items sink to a collapsed "Expired (2)" group and are read-only for 24 h, then disappear.
- Selecting a row opens the **detail** in place (list slides left 24 px and fades; back arrow in the header):
  - **Who and what** — requester avatar/name, subject, owning department, agent chip, platform.
  - **Evidence** — bordered list of checks (Lucide `check`/`alert-triangle`), e.g. "Policy check passed", "Receipt attached", "Cost centre matches".
  - **Record** — optional embedded `record` card with `link` to the system of record.
  - **TTL** — "Expires in 14:59" in `--warning` under one hour.
- Footer (**decision bar**): 2-3 option buttons (primary = the agent's recommended option, labelled exactly as the schema provides), a **free-text reply** input ("Add a note or ask for more…") that is sent with any option, and a secondary "Reject". Confirming shows an inline spinner on the pressed button; on success the item fades out, the list returns, and an in-panel toast reads "Approved · Oracle Fusion agent is executing". The result appears in Recent within 2 s.
- **Auth kind** ("Sign in again", "Consent needed for Snowflake agent"): single primary action that opens the system browser; the item resolves when the callback arrives.
- Decisions are **idempotent**: the same key is reused on retry; a `conflict` error shows "Already decided elsewhere" and refreshes the item.

**Empty state:** Lucide `check-circle` at 24 px, "Nothing needs you." Nothing else.

**Offline:** items visible, decision bar disabled, status strip "Offline — decisions paused".

### 3.6 Recent

**Purpose:** the user's Ledger. Dense, scannable, immutable.

- Rows 36 px, bordered (`--border` bottom), not cards: `HH:MM` (or date for older) 11 px mono-ish tabular numerals · event icon · one-line summary (12.5 px) · platform chip · status glyph (`proposed` clock, `confirmed` check, `executed` check-check, `failed` x, `expired` hourglass, `cancelled` slash).
- Grouped by **journey**: a journey header row (bold summary, agent chip, overall status) expands to its events. Default: latest 3 journeys expanded, rest collapsed.
- Day separators ("Today", "Yesterday", "Mon 15 Sep").
- Footer: filter chips — platform (multi), status (multi), "Mine / Routed to me". Active filters shown as chips; "Clear".
- Row click opens **journey detail** in place: the Ask thread (read-only) with its cards, the decision(s) taken and by whom, and "Open in ServiceNow" links. "Continue in Ask" reopens the journey in Ask when it is still open.
- **Paging:** the latest 10 journeys are shown. A quiet "More ⌄" (11 px, `--fg-subtle`, hover `--surface-sunken`) sits at the bottom right under the last row; each click reveals the next 5 journeys, fetching the next Ledger page via `nextCursor` when the loaded rows run out. Changing a filter resets to 10. A new journey arriving in realtime enters at the top and the oldest visible one drops off.
- Virtualised (TanStack Virtual); 10k rows at 60 fps.
- Never editable. No delete, no archive.

**Empty state:** "Nothing yet. Ask Loop something." with a text button to Ask.

### 3.7 Cards

Rendered by `CardRenderer` from `contracts/` schemas. Common frame: `--surface-raised`, 1 px `--border`, radius 12, padding 16, header row (type icon, title, agent chip right), body, optional footer actions. Unknown type: nothing rendered, logged.

| Type | Body | Footer |
|---|---|---|
| `summary` | 1-3 short paragraphs; `tone` in `neutral`/`success`/`failure` tints the left 3 px rule | Optional link |
| `record` | Key-value grid (2 columns at 380 px), label 11 px `--fg-muted`, value 14 px; status badge | "Open in <platform>" |
| `table` | Up to 5 columns, 8 rows visible, horizontal scroll if wider, sticky header, tabular numerals | "Show all (23)" opens a scrollable sheet inside the panel |
| `choice` | Prompt line + 2-3 full-width option buttons with 1-line descriptions | None; collapses to a chip after choice |
| `confirmation` | Proposal summary, "What will happen" list, evidence list | 2-3 option buttons (primary highlighted) + free-text input |
| `link` | Title, host, 1-line description, Lucide `external-link` | Opens via `open_external` (allow-listed hosts) |

Cards never carry agent-supplied colours, images or arbitrary markup. Text supports bold and inline code only.

### 3.8 Shared states

| State | Presentation |
|---|---|
| Loading | Skeletons shaped like the content (rows for lists, 3-line block for cards); shimmer respects reduced motion |
| Empty | One icon, one sentence, at most one action |
| Error (retryable) | Inline card: what failed in plain words, "Try again"; correlation id in the tooltip of a small `info` icon |
| Error (not retryable) | Same without retry; "Recorded for the Loop team" |
| Offline | Status strip; reads work from cache; decisions and sends disabled |
| Reconnecting | Status strip only; nothing disabled until 10 s elapse |
| Signed out | Full-panel state: Loop mark, "Sign in to Loop", primary button; opens system browser; "Waiting for sign-in…" while pending |
| Paused | Status strip "Paused until 14:32 · Resume" |
| Presenting | No pops or toasts; badge updates; nothing shown in panel |

### 3.9 Settings sheet

Radix Dialog rendered inside the panel body (no new window). Sections:

- **Shortcut** — recorder control; default Ctrl+Alt+L / ⌃⌥L; shows a conflict message if registration fails.
- **Pill** — display (list of monitors), edge (Right / Left), "Show pill" toggle.
- **Behaviour** — Start Loop at sign-in (default on), Pin panel by default (off), Exclude from screen sharing (on).
- **Appearance** — Theme: System / Light / Dark; Motion: System / Reduced; Translucent panel (on where supported).
- **Account** — displayName, UPN, tenant; Sign out.
- **About** — version, build, remote-config state, "Copy diagnostics".

### 3.10 Notifications and toasts

- **OS toasts** are raised for Attention items only (never for completions). Title = item title; body = "requester · agent". Clicking opens the panel in Attention on that item where the platform delivers the click; otherwise the pill badge and pop are the reliable path.
- **In-panel toasts** (Radix Toast, bottom of panel body, 4 s): decision outcomes, "Moved to Attention", "Copied", connectivity restored. Max one visible; queue others.

---

## 4. Visual system

### 4.1 Semantic colour tokens

Brand: Regent Green `#003B48`, Turquoise `#00B2A9`, Yellow `#FFC72C`. Components use only the semantic tokens below.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface` | `#FAFAF7` | `#0B1A1E` | Panel background |
| `--surface-raised` | `#FFFFFF` | `#112429` | Cards, pill, active segment |
| `--surface-sunken` | `#F1F2EE` | `#071317` | User bubbles, inputs |
| `--border` | `#E2E5E1` | `#1F353B` | Hairlines |
| `--fg` | `#0F1F23` | `#E8EEEF` | Primary text |
| `--fg-muted` | `#5B6B6E` | `#9FB0B3` | Secondary text |
| `--fg-subtle` | `#8A9799` | `#6E8083` | Tertiary, placeholders |
| `--primary` | `#003B48` | `#00B2A9` | Ring, active underline, primary buttons |
| `--primary-fg` | `#FFFFFF` | `#04262A` | Text on primary |
| `--accent` | `#FFC72C` | `#FFC72C` | Spark, focus highlights on brand mark |
| `--info` | `#00857F` | `#4FD1C5` | Handoff chip, links |
| `--success` | `#1E8E5A` | `#57C785` | Executed, approved |
| `--warning` | `#B7791F` | `#E0A83A` | TTL under 1 h |
| `--danger` | `#B3261E` | `#F0716A` | Failed, offline |
| `--attention` | `#D6453D` | `#F0716A` | Pill badge, Attention count |
| `--focus` | `#00B2A9` | `#4FD1C5` | 2 px focus ring |
| `--shadow-pill` | `0 2px 8px rgba(0,0,0,.14)` | `0 2px 8px rgba(0,0,0,.5)` | |
| `--shadow-panel` | `0 8px 32px rgba(0,0,0,.18)` | `0 8px 32px rgba(0,0,0,.6)` | Menus, toasts, sheets |

Theme follows `prefers-color-scheme`; `[data-theme]` on `<html>` overrides when the user chooses. Both palettes are verified for AA contrast on all text pairs.

### 4.2 Typography

System stack: `"Segoe UI Variable Text", "Segoe UI", -apple-system, "SF Pro Text", system-ui, sans-serif`. Tabular numerals (`font-variant-numeric: tabular-nums`) for times, counts and tables.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `text-xs` | 11 / 16 | 500 | Timestamps, labels in record grids, chips |
| `text-sm` | 12.5 / 18 | 400 | Recent rows, second lines, evidence |
| `text-base` | 14 / 20 | 400 | Body, card text, composer |
| `text-lg` | 16 / 22 | 600 | Card titles, Attention detail subject |
| `text-xl` | 20 / 26 | 600 | Signed-out heading only |

### 4.3 Spacing, radii, elevation

- Spacing scale: 4, 8, 12, 16, 24, 32.
- Radii: `--radius-pill` 9999, `--radius-panel` 16, `--radius-card` 12, `--radius-control` 8, `--radius-chip` 9999.
- Elevation: the panel and the pill use a border only (no drop shadow). Cards use borders only; hover on rows uses `--surface-sunken`, not shadow. `--shadow-panel` remains for in-panel overlays (menu, toast, settings sheet); `--shadow-pill` remains for small overlays (tooltip, toggle thumb).

### 4.4 Iconography and brand mark

- Lucide, stroke 1.75; 16 px in rows and chips, 20 px in cards and headers.
- Loop mark: open ring (2.5 px stroke, `--primary`) with a 5 px yellow spark at 2 o'clock; the gap in the ring faces the spark. Used on the pill, in the signed-out state and as the app icon. Never recoloured.
- Agent chips use a 16 px platform glyph supplied by the registry (SVG, monochrome, tinted `--info`); unknown agents fall back to Lucide `bot`.

### 4.5 Density and layout rules

- Panel content max width equals the panel; no horizontal scroll except inside `table` cards.
- Lists are rows with hairline borders; cards are for agent output only.
- One primary button per view. Destructive actions are never primary.
- Copy: short, verbs first, no exclamation marks, name the agent and platform ("ServiceNow agent created INC0012345").

---

## 5. Motion

All variants come from `src/ui/motion.ts`.

| Preset | Definition | Used for |
|---|---|---|
| `spring` | stiffness 400, damping 30, mass 1 | Panel enter, badge, segment underline |
| `expand` | 180 ms ease-out cubic | Tab → pill chrome width |
| `collapse` | 150 ms ease-in cubic | Pill → tab chrome width |
| `fadeFast` | opacity 0 → 1, 120 ms | Tab ↔ toolbar chrome swap inside the pill |
| `durations.fast` | 120 ms | Hover states, toggles |
| `durations.base` | 200 ms | Cross-fades, list row enter/exit |
| `stagger` | 35 ms between children, max 8 children | Cards, quick actions, header/body/footer on panel enter |
| `slideInRight` | x 24 → 0, opacity 0 → 1 | Panel enter |
| `fadeUp` | y 8 → 0, opacity 0 → 1 | Cards, rows, mode content |
| `scaleIn` | scale 0.6 → 1, spring | Badge count change, toast |
| Exit | 160 ms, opacity → 0, x → 12 | Panel hide |

Rules:

- Mode switch is a cross-fade plus `fadeUp`; never a horizontal carousel.
- Streaming text appears by line, not by character, to avoid layout thrash.
- Skeleton shimmer is a 1.2 s linear gradient; disabled under reduced motion.
- Reduced motion (`useReducedMotion()` or the Settings toggle): transforms removed, opacity-only at `durations.fast`, staggers 0, badge changes instant.
- Neither window is resized to animate. The **panel** window is fixed-size and shown or hidden. The **anchor** window is fixed at the pill size; the shell clips it to the tab with a window region while collapsed, and Motion slides the chrome inside it (ADR-005).

---

## 6. Accessibility

### 6.1 Keyboard

| Context | Key | Action |
|---|---|---|
| Global | Ctrl+Alt+L / ⌃⌥L | Open Ask (Passive) → focus composer (Active) → hide |
| Global | Ctrl+Alt+P / ⌃⌥P | Toggle pin (when panel open) |
| Panel (Active) | Esc | Hide panel, restore focus to previous app |
| Panel (Active) | Ctrl/⌘+1, 2, 3 | Ask, Attention, Recent |
| Panel (Active) | Tab / Shift+Tab | Move through header, body, footer |
| Composer | Enter / Shift+Enter | Send / newline |
| Composer | Ctrl/⌘+Enter | Send (alternative) |
| Choice / Confirmation card | ← → or ↑ ↓ | Move between options; Enter selects; Ctrl/⌘+Enter selects the primary |
| Attention list | ↑ ↓, Enter, Backspace | Move, open detail, back to list |
| Recent | ↑ ↓, →/← , Enter | Move, expand/collapse journey, open detail |
| Filters | Space | Toggle chip |

### 6.2 Focus rules

- Opening Passive never moves keyboard focus away from the user's application.
- When the user activates the panel (composer click or second hotkey press), focus lands in the composer in Ask, on the selected item in Attention, on the first visible row in Recent.
- Mode switch keeps focus on the segmented control; the body receives a `tabindex=-1` container focus only when the user tabs into it.
- On hide, focus returns to the previous application (shell responsibility).
- Focus ring: 2 px `--focus` outside the control, visible for keyboard focus only (`:focus-visible`).

### 6.3 Semantics

- Pill: `role="toolbar"` (vertical) named "Loop", containing the mark (`button`, `aria-label="Loop. 3 items need your attention"`, updates with count) and one `button` per mode (`aria-label="Attention. 3 need you"`, `aria-pressed` for the open mode). Nothing in it is in the tab order.
- Panel body: `main` labelled by the header's mode title.
- Cards: `role="article"` with `aria-labelledby` the title; agent chip has `aria-label="Handled by ServiceNow agent"`.
- `confirmation` and `choice` options: `role="group"` with `aria-describedby` the evidence or prompt; buttons carry the option label verbatim.
- Attention count changes announced via a visually hidden `aria-live="polite"` region inside the panel (never from the pill window, which would announce while the user works elsewhere).
- Toasts: `role="status"`.
- Times carry a full `title` and `datetime`.

### 6.4 Contrast and vision

- All text pairs meet WCAG AA in both themes; badge and status glyphs pair colour with an icon or text.
- Minimum hit target 28 x 28 px; rows are 36 px; pill is 56 x 180 with 36 px buttons.
- Supports 200 % OS scaling without clipping; the panel height clamps to the work area.
- Reduced transparency preference disables vibrancy.

### 6.5 Language

- English (en-GB spelling) for the pilot. All strings through `t()`; logical CSS properties so Arabic/RTL is a later addition, not a rewrite.

---

## 7. Component inventory (Storybook coverage)

Every component has a story per state, in light and dark.

| Component | Location | States |
|---|---|---|
| `Pill` | `anchor/` | tab (idle), hover-expand, badge 1/12/99+ on tab and Attention, paused, offline, reconnecting, dragging, panel-open in each mode |
| Tray menu | `src-tauri/src/tray.rs` | default, pinned, paused, hidden-pill, signed-in / signed-out |
| `PanelChrome` | `shell/` | Ask/Attention/Recent title, with back chevron, pinned, with status strip variants |
| `StatusStrip` | `shell/` | reconnecting, offline, paused, hidden |
| `Composer` | `shell/` | empty, typing, multi-line, sending, working (stop), disabled offline, with context chip |
| `QuickActions` | `shell/` | 0/1/2/3 actions |
| `HandoffChip` | `modes/ask/` | known agent, unknown agent |
| `AskThread` | `modes/ask/` | empty, working, cards, choice pending, choice made, confirmation pending, failure, can't-help |
| `AttentionList` | `modes/attention/` | loading, empty, items, with expired group |
| `AttentionRow` | `modes/attention/` | confirm/choose/provide/auth, TTL > 1 h, < 1 h, expired |
| `AttentionDetail` | `modes/attention/` | default, with record, deciding, decided, conflict, offline |
| `DecisionBar` | `modes/attention/` | 2 options, 3 options, with note, disabled |
| `RecentList` | `modes/recent/` | loading, empty, populated 10k, filtered, day separators, More visible / loading / exhausted |
| `JourneyGroup` / `LedgerRow` | `modes/recent/` | each eventType, expanded/collapsed |
| `JourneyDetail` | `modes/recent/` | open journey, closed journey, with decisions |
| `FilterChips` | `modes/recent/` | none, some, all |
| `CardRenderer` + 6 cards | `cards/` | populated, loading, empty, error, expired (where applicable); `summary` tones |
| `SettingsSheet` | `shell/` | default, shortcut conflict, no second monitor |
| `SignedOut` | `shell/` | idle, waiting, error |
| Primitives | `ui/` | Button (primary/secondary/ghost/danger, sizes, loading, disabled), IconButton, Input, Textarea, Menu, Tooltip, Badge, Chip, Toast, Skeleton, Dialog, Tabs, ScrollArea |

---

## 8. Keyboard shortcut summary (user-facing)

| Action | Windows | macOS |
|---|---|---|
| Open Loop (Ask) / focus composer / hide | Ctrl+Alt+L | ⌃⌥L |
| Pin or unpin panel | Ctrl+Alt+P | ⌃⌥P |
| Switch to Ask / Attention / Recent | Ctrl+1 / 2 / 3 | ⌘1 / 2 / 3 |
| Send ask | Enter | Enter |
| New line in ask | Shift+Enter | Shift+Enter |
| Select primary option | Ctrl+Enter | ⌘Enter |
| Hide panel | Esc | Esc |

Both global shortcuts are configurable in Settings. Defaults avoid Office, Teams, Windows and macOS system bindings.

---

## 9. Demo scenarios (for prototype and Storybook fixtures)

| Mode | Scenario | Agent |
|---|---|---|
| Ask | "Raise a P2 for the payments dashboard outage" → handoff chip → confirmation card → confirm → record card → Recent row | ServiceNow |
| Ask | "Status of INC0012345" → record card, no Attention | ServiceNow |
| Ask | "Order 20 laptops" → choice card (ServiceNow vs Oracle Fusion) → continue | Orchestrator |
| Attention | Expense claim, AED 1,240 client dinner, policy check passed → Approve / Ask for itemised receipt + note | Oracle Fusion |
| Attention | Access request, Snowflake finance schema, read-only 90 days → Approve / Reject | Snowflake |
| Attention | "Which cost centre for the 20 laptops?" → choose | Oracle Fusion |
| Recent | Closed incident · approved expense · laptop request waiting on IT · room booked | Mixed |

---

## Changes in v0.6

The tab ↔ pill slide is Motion inside a fixed-size anchor window (ADR-005 amendment); the window is no longer resized. The chrome rides the inboard edge like a drawer and the tab marks cross-fade into the toolbar with `fadeFast`.

## Changes in v0.5

The panel has no drop shadow; elevation is the 1 px `--border`, matching the pill. Tab → pill is 180 ms ease-out; pill → tab is 150 ms ease-in.

## Changes in v0.4

The default visible surface is a 20 × 180 edge tab (same height as the pill): small mark and a pulsing attention dot at the top, a small inboard triangle in the middle. Hover slides a rounded rectangle out (inner `--radius-card`, screen-edge square).

## Changes in v0.3

The pill has no drop shadow in any state, including drag. `--shadow-pill-raised` is removed. The anchor window is 56 px wide (matching the pill) so a DWM fill during drag does not stick out as a wider bar.

## Changes in v0.2

The pill becomes the navigation: Loop mark on top, then icon-only Ask / Attention / Recent buttons with title tooltips; the Attention count sits on its button (56 x 180). The panel header names the mode instead of switching it. Settings leaves the pill menu and the panel overflow; the tray icon is its only entry point. Recent shows 10 journeys with a quiet "More" that reveals 5 at a time. The anchor webview mirrors Settings (`settings_changed`) so theme changes reach the pill. Hovering the pill no longer scales it or raises its shadow; only the hovered button responds.

## Changes in v0.1

Initial version. Replaces the v0.1 brief's strip/hover/Menu interaction with the pill-and-panel model (ADR-003); adds full visual system, motion, accessibility and component inventory; theme follows the OS with both palettes first-class.
