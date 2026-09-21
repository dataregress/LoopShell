# Loop Dock — Design and Architecture Brief

| | |
|---|---|
| **Status** | Draft v0.4 |
| **Last updated** | 21 September 2026 |
| **Owner** | Loop Platform Team |
| **Audience** | Loop platform engineers · Design · Security · Endpoint engineering |
| **Related** | Loop Agent Onboarding Framework (`loop-agent-onboarding-framework.md`) · [ui-ux.md](ui-ux.md) · [shell-architecture.md](shell-architecture.md) · [system-architecture.md](system-architecture.md) · [technology.md](technology.md) · [ADRs](adr/) |

*Ask once. It's handled.*

---

## 1. What Loop Dock is

Loop Dock is the single user-facing surface of Loop. It is a small **edge tab** at the right edge of the desktop that expands to a **pill** on hover. Clicking it (or pressing a hotkey) opens a **panel** with three modes — **Ask**, **Attention** and **Recent** — and nothing else. Behind the dock, a Loop orchestrator triages every ask and hands it to the platform sub-agent that owns it (ServiceNow, Oracle Fusion, Microsoft 365, Snowflake, OutSystems and others as they are onboarded). The sub-agent acts or answers; anything that needs a human decision comes back to the user through Attention; everything that happened is visible in Recent.

**Scope**

- Windows 11 is the primary target; macOS is supported for VIP users.
- The dock is the only UI in scope. Microsoft Teams and MyADIC shells are out of scope for this build.
- All existing platforms remain systems of record. Loop layers over them; it does not replace them.

**Non-goals** (see §8 for the full list): Loop Dock does not read or annotate other applications' content, does not offer an agent marketplace or builder, does not have a web or mobile shell, and does not add a fourth mode.

---

## 2. Interaction model

Detailed specification: [ui-ux.md](ui-ux.md). This section states the model; the UI/UX document owns the behaviour.

### 2.1 States

| State | What the user sees | Enter | Leave |
|---|---|---|---|
| **Tab** | A 20 × 180 px tab flush with the right screen edge. Small Loop mark and a pulsing attention dot at the top; a small inboard triangle in the middle | Default after sign-in | Hover expands the pill |
| **Pill** | 56 × 180 px with Ask / Attention / Recent buttons | Hover the tab; panel open | Pointer leave (200 ms) if the panel is closed |
| **Panel · Ask** | Composer at the bottom, thread of asks, handoff chips and cards above | Hotkey; pill click when Ask was last used; mode switcher | Esc, click away, mode switcher |
| **Panel · Attention** | List of items awaiting this user's decision; detail with evidence and options | Pill click when last used; mode switcher; an Attention item arriving pops the panel | Esc, click away, mode switcher |
| **Panel · Recent** | Dense ledger rows grouped by journey, with filters | Pill click when last used; mode switcher | Esc, click away, mode switcher |

There is no intermediate menu. The panel is one fixed-size window that changes mode. The edge tab expands to the pill on hover; the pill can be dragged vertically, hidden from the tray or hotkey, and paused for an hour. Right-click on the pill and panel does nothing.

### 2.2 Ask

1. The user types an ask in plain language.
2. The orchestrator triages and hands the ask to a sub-agent. The handoff is shown as a chip in the thread ("Handed to ServiceNow agent") so the user always knows who is acting.
3. **Query asks** return results rendered as typed cards (record, table, summary, link).
4. **Action asks** return a proposal as a confirmation card with explicit options and a free-text reply box. Nothing irreversible executes until the user confirms.
5. Asks spanning platforms ("approve the claim and tell Ahmed") are sequenced by the orchestrator across sub-agents within one journey.
6. If the user closes the panel with a proposal unanswered, the proposal moves to Attention rather than dying with the chat.

### 2.3 Attention

Attention is the human-in-the-loop inbox: every journey currently waiting on this user, whether the user started it or someone else's journey routed a decision to them (a direct report's expense claim, an access request needing manager approval).

Every item carries:

- **Who and what** — requester, subject, owning department.
- **Evidence** — what the agent checked (policy check, receipt attached, cost centre match).
- **Options** — two to three explicit choices.
- **Free-text reply** — because "approve, but ask for the itemised receipt" is a response, not a button.

Sources of Attention items: approvals, confirmations before destructive actions, clarifying questions from agents, authentication or consent requests. Items carry an expiry (`expiresAt`); expired items are read-only.

### 2.4 Recent

Recent is the user's ledger: what was asked, which agent did what, on which platform, with what outcome and when. It is a dense list (bordered rows, not cards) grouped by journey that the user scans. Tapping a row reopens the journey. It is stored server-side so it is identical on the Windows desk and the Mac, and it is immutable.

### 2.5 Design principles

- **The pill shows one number.** Only Attention lights it. Completed actions and answered asks never do.
- **One tap to a mode.** No menu between the pill and Ask, Attention or Recent.
- **Handoff is visible.** Users should learn which agent acts for them.
- **Agents pick card types; they never generate layout.** The card set is fixed and rendered by the dock.
- **Never steal focus.** The panel is non-activating until the user clicks into the composer; on hide, focus returns to the application that had it.
- **Never in the way.** The pill reserves no screen space, the panel never resizes the desktop, the dock is excluded from screen sharing by default and stays quiet during presentations.
- **Minimal chrome, both themes.** Quiet, dense, polished motion. Appearance follows the OS; light and dark are both first-class. Feel is a deliverable, not an afterthought.
- **A global hotkey opens Ask directly** (Ctrl+Alt+L on Windows, ⌃⌥L on macOS, configurable).

---

## 3. Architecture

### 3.1 One journey, three views

Ask, Attention and Recent are three views over a single object: the **journey**.

```
received ──► routed ──► running ──► completed
                           │   ▲
                           ▼   │
                    waiting_on_user ──► failed / cancelled / expired
```

- A journey is created by an ask or by a platform event (a claim landing for approval) and identified by `journeyId`. Each sub-agent unit of work is an A2A task (`taskId`, `contextId`).
- Beneath every journey is an append-only **Ledger** of events: `proposed`, `confirmed`, `executed`, `failed`, `cancelled`, `expired`. Only the orchestrator emits `confirmed`.
- **Ask** starts or continues a journey. **Attention** = journeys in `waiting_on_user` where the user is this user. **Recent** = the latest N journeys and events for this user.
- The backend exposes three read models (ask thread, attention list, recent list) and two commands (submit ask, answer attention item). Recent doubles as the audit trail, so the Ledger is immutable.

### 3.2 Orchestration and sub-agents

Summary; the components, the orchestrator's behaviour and the A2A contract between the orchestrator and the sub-agents are owned by [system-architecture.md](system-architecture.md).

- **Orchestrator** — Microsoft Agent Framework. Triage uses embedding-based retrieval over agent skills, then an LLM choice among the top candidates; overlapping candidates produce a choice card, never a guess. Single-platform asks use the handoff pattern; multi-platform asks use a short sequential workflow.
- **Human in the loop** — A2A `input-required` maps onto Attention. The workflow checkpoints at the request-for-input step and resumes when the user's decision is relayed by the orchestrator, so nothing is lost if the laptop sleeps or a service restarts.
- **Sub-agents** — one per platform, each its own deployable with its own identity and its own MCP servers behind the MCP Gateway. The orchestrator speaks A2A to sub-agents and contains no platform-specific code.
- **The dock speaks Loop's API, not A2A.** The dock talks to one orchestrator API (asks, decisions, ledger, negotiate) and receives events over Web PubSub. A2A stays between the orchestrator and sub-agents; the dock only interprets task states it is told about.
- **Extension** — new sub-agents join by registration, following the Loop Agent Onboarding Framework (card, routing corpus, isolation, three contracts, staged pipeline). No orchestrator or dock change.

### 3.3 Card contract

Agents declare the card types they may emit in their Agent Card; undeclared or unknown types are dropped and logged. The set is closed:

| Type | Purpose |
|---|---|
| `summary` | Short answer or status |
| `record` | One object (incident, request, claim) |
| `table` | Several objects |
| `choice` | Disambiguation or a decision with options |
| `confirmation` | Proposal for an action with approve / reject and free-text reply |
| `link` | Deep link into the system of record |

Schemas, envelope fields and versioning live in `contracts/` (see `.cursor/rules/contracts.mdc`).

### 3.4 Identity

- Sign-in with Entra ID: OAuth 2.0 authorization code with PKCE, implemented in the Rust layer, using the system browser and a `loop://auth/callback` deep link. Tokens live in the OS credential store (Windows Credential Manager, macOS Keychain), never in the webview. Decision and Conditional Access checkpoint: [ADR-002](adr/ADR-002-auth-flow.md).
- The dock talks to one backend. The backend uses On-Behalf-Of so sub-agents act as the user wherever the platform accepts Entra tokens (Microsoft Graph, SharePoint, ServiceNow).
- Where a platform requires a service identity (Oracle Fusion), the approving user is stamped on the transaction and in the Ledger. The audit trail shows the approver, never a service account.

### 3.5 Real-time

- **Azure Web PubSub** carries `attention.created`, `attention.resolved`, `attention.expired`, `journey.updated` and `ledger.appended` to the dock over the reliable subprotocol. These drive the pill badge, live panel updates and OS toasts. Toasts are raised only for Attention items.
- Ask progress and results stream over the same channel as task-state events. The Rust layer owns the connection and re-emits typed events to the UI.

### 3.6 Shell mechanics

Detail: [shell-architecture.md](shell-architecture.md).

| Concern | Approach |
|---|---|
| Windows | Two frameless, transparent, always-on-top, non-activating windows: `anchor` (pill) and `panel`. `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`; excluded from capture with `WDA_EXCLUDEFROMCAPTURE`. No AppBar — the dock reserves no screen space |
| macOS | The same two windows as non-activating `NSPanel`s visible on all Spaces and over full-screen apps; `sharingType = .none` for capture exclusion; Accessory activation policy |
| Anchor | Edge tab by default; hover expands the pill. Click to open, vertical drag. Pin, Pause, Hide pill, Sign out and Quit live on the tray. [ADR-005](adr/ADR-005-edge-tab-hover-reveal.md) |
| Panel | Fixed 380 x 640 window placed beside the pill; content animates inside it; Passive until the user clicks the composer; focus restored on hide |
| Summon | Global shortcut opens Ask; second press focuses the composer; Esc hides |
| Placement | Right edge of the chosen display (primary by default); pill position remembered per monitor layout |
| Notifications | Native OS notifications, Attention only |
| Presentation | No pops or toasts while presenting or paused; badge still updates |
| Updates | MDM (Intune / Jamf) delivers new versions; no in-app updater for the pilot. [ADR-004](adr/ADR-004-packaging-and-updates.md) |

---

## 4. Technology stack

Full document with versions and rationale: [technology.md](technology.md). Summary:

| Layer | Choice | Why |
|---|---|---|
| Shell | Tauri 2 (Rust native layer) | Small footprint for an always-on sidecar; uses WebView2 on Windows 11 and WKWebView on macOS, so browser patching is inherited from the OS. [ADR-001](adr/ADR-001-shell-stack.md) |
| UI | React 19 + TypeScript + Vite | Broad talent pool; browser-first iteration; AI-assisted development works well |
| Motion | Motion for React | Content animation inside fixed windows; reduced-motion support |
| Styling | Tailwind v4 with ADIC design tokens; Radix primitives; Lucide icons | Consistent brand in light and dark; accessible primitives |
| State and data | Zustand · TanStack Query · Zod | Local UI state, server cache, validated contracts |
| IPC | tauri-specta | Typed Rust ↔ TypeScript commands and events |
| Networking | Rust only (`reqwest`, `tokio-tungstenite`) | Tokens and backend traffic never reach the webview |
| Real-time | Azure Web PubSub (reliable subprotocol) | Push for Attention and journey updates with replay on reconnect |
| Orchestration | Microsoft Agent Framework · A2A between agents | Handoff and workflow patterns, checkpointing, human-in-the-loop, model-agnostic |
| Tools | Per-platform MCP servers behind the MCP Gateway | Isolation, allow-listing, tool-call logging |
| Routing | Embedding-based retrieval over Agent Card skills | Constant prompt size as agents grow |
| Identity | Entra ID · auth code + PKCE in Rust · OS keychain | SSO; On-Behalf-Of to platforms. [ADR-002](adr/ADR-002-auth-flow.md) |
| Hosting | Azure (preferred AI hosting environment) | Orchestrator, registry, Ledger, Web PubSub |
| Endpoint | Intune (Windows) · Jamf / Intune (macOS) | Packaging and distribution. [ADR-004](adr/ADR-004-packaging-and-updates.md) |

---

## 5. Delivery considerations

- **Security review is on the critical path.** With no Teams fallback, users only get Loop when the dock is packaged and approved. Start the endpoint and security engagement in week one.
- **Native spike first.** Non-activating windows, the click pill and capture exclusion are proven on both OSes before UI investment (`shell-architecture.md` §9).
- **Windows first, Mac second.** Design docking behaviour for Windows; verify the NSPanel behaviour with the VIP Mac users in the pilot ring.
- **Pilot vertical slice** — ServiceNow ITSM agent end to end: ask → handoff → proposal → Attention → Ledger → Recent.
- **Packaging** — signed MSI via Intune on Windows; notarized `.pkg` via Jamf / Intune on macOS; MDM owns updates for the pilot.
- **Identity checkpoint** — Conditional Access behaviour for the system-browser flow is confirmed by the identity team before Phase 5 (ADR-002).

---

## 6. Demo scenarios

Used in the clickable prototype, Storybook fixtures and the mock orchestrator, and recommended for pilot storytelling.

| Mode | Scenario | Agent |
|---|---|---|
| Ask | "Raise a P2 for the payments dashboard outage" → drafted incident → confirm → created | ServiceNow |
| Ask | "Status of INC0012345" → record card, read-only | ServiceNow |
| Ask | "Order 20 laptops" → choice card (ServiceNow vs Oracle Fusion) | Orchestrator |
| Attention | Expense claim, AED 1,240 client dinner, policy check passed → approve or ask for itemised receipt | Oracle Fusion |
| Attention | Access request, Snowflake finance schema, read-only 90 days → manager approval | Snowflake |
| Attention | "Which cost centre for the 20 laptops?" → choice | Oracle Fusion |
| Recent | Closed incident · approved expense · laptop request waiting on IT · room booked | Mixed |

---

## 7. Open questions

- Attention escalation when an item ages without a decision (expiry itself is decided: items carry `expiresAt` and become read-only).
- Voice input in the composer: none for the pilot beyond OS dictation; on-device vs Azure Speech remains open for later.
- Offline behaviour beyond the pilot decision (reads from cache, decisions and sends disabled, clear status strip).
- Policy for who may route an Attention item to a given user.
- Cross-device state: the same Attention item open on Windows and Mac simultaneously (decisions are idempotent; UI shows "Already decided elsewhere").
- Arabic / RTL timing relative to the VIP pilot.

Decided since v0.1 and removed from this list: anchor interaction model (ADR-003, superseded by ADR-005), multi-monitor placement rules (`shell-architecture.md` §2.1), packaging and updates (ADR-004), identity flow wording (ADR-002), theme (follows OS), default hotkey.

---

## 8. Non-goals

Loop borrows interaction and visual patterns from comparable products; it borrows no functions. The following are explicitly out of scope and require an ADR to reconsider:

- Inline underlines, suggestions or edits inside other applications' text fields.
- Reading the active window's content, title, selection or process name; per-application behaviour or block lists.
- A web, mobile, Teams or MyADIC shell of the dock.
- Agent marketplace, agent builder, connector management UI, daily briefs, email or calendar features.
- A fourth mode, a home feed, or a chat-history browser beyond Recent.
- Voice input beyond what the OS provides in a text field.
- In-app updater during the pilot.

---

## Changes in v0.4

- Added [system-architecture.md](system-architecture.md) as the owner of the server side: components, orchestrator behaviour, the API-edge contract and the A2A detail between orchestrator and sub-agents. §3.2 remains the summary and now points there.

## Changes in v0.3

- Default visible surface is a 20 × 180 edge tab (same height as the pill); hover expands the pill (ADR-005, superseding ADR-003's always-visible pill).

## Changes in v0.2

- Replaced the thin hover-reveal strip and Menu pill with an always-visible click pill and a direct-to-mode panel (ADR-003); removed the Menu state from §2.1.
- Two-window shell on both OSes; panel fixed-size; Passive/Active focus model; presentation and capture behaviour added to §2.5 and §3.6.
- Corrected identity wording from "MSAL" to auth code + PKCE in Rust (ADR-002); corrected packaging from MSIX and in-app updates to MSI and MDM-owned updates (ADR-004).
- Clarified that the dock speaks Loop's API, not A2A; added `attention.expired` and `ledger.appended` events; reliable Web PubSub subprotocol.
- Theme follows the OS with both palettes first-class; default hotkey set to Ctrl+Alt+L / ⌃⌥L.
- Added §8 Non-goals; trimmed §7 Open questions to what remains open; moved detail to `ui-ux.md`, `shell-architecture.md` and `technology.md`.
