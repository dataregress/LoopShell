# Loop Dock — Technology Stack

| | |
|---|---|
| **Status** | Draft v0.3 |
| **Last updated** | 19 September 2026 |
| **Owner** | Loop Platform Team |
| **Audience** | Loop build team · Security · Endpoint engineering · Cloud & AI Team |
| **Related** | [design-brief.md](design-brief.md) · [ui-ux.md](ui-ux.md) · [shell-architecture.md](shell-architecture.md) · [system-architecture.md](system-architecture.md) · [ADR-001](adr/ADR-001-shell-stack.md) · [ADR-002](adr/ADR-002-auth-flow.md) · [ADR-003](adr/ADR-003-anchor-and-panel-model.md) · [ADR-004](adr/ADR-004-packaging-and-updates.md) · [ADR-005](adr/ADR-005-edge-tab-hover-reveal.md) |

This document owns the *what and why* of every technology in the LoopShell repository. Versions are the targets to pin at scaffold time; exact pins live in `Cargo.toml` and `package.json` and are upgraded in dedicated PRs. The enforcement summary lives in `.cursor/rules/loop-stack-locked.mdc`.

---

## 1. Scope of this repository

LoopShell contains the dock only:

```
LoopShell/
  src-tauri/               # Rust shell: windows, native, ipc, auth, realtime, api, settings, telemetry
  src/                     # React UI: app, modes, cards, shell, anchor, ui, adapters, stores, lib
  contracts/               # Zod schemas, A2A state map, generated tauri-specta bindings, fixtures
  tools/mock-orchestrator/ # Node/TS mock used by Storybook, Vite and Playwright
  docs/                    # this documentation set and ADRs
  .cursor/rules/           # locked decisions for AI-assisted development
```

The orchestrator, sub-agents, MCP Gateway, Ledger, registry and Web PubSub hub are separate services owned by the orchestrator team and hosted on Azure. This document lists them only where the dock depends on their interface; their architecture is owned by [system-architecture.md](system-architecture.md).

---

## 2. Stack at a glance

| Layer | Choice | Target version | Decision |
|---|---|---|---|
| Shell | Tauri 2 (Rust stable) | Tauri 2.x latest stable; Rust stable toolchain | ADR-001 |
| Webview | WebView2 (Windows 11), WKWebView (macOS 13+) | OS-provided, Evergreen | ADR-001 |
| Native (macOS) | `tauri-nspanel`, `objc2` | latest compatible with Tauri 2.x | ADR-001, ADR-003, ADR-005 |
| Native (Windows) | `windows` crate | 0.5x+ with `Win32_UI_WindowsAndMessaging`, `Win32_Graphics_Dwm` features | ADR-001, ADR-003, ADR-005 |
| Window effects | `window-vibrancy` | latest for Tauri 2 | §4.4 |
| UI | React, TypeScript (strict), Vite | React 19.x, TS 5.x, Vite 6.x+ | ADR-001 |
| Motion | `motion` (Motion for React) | 12.x | §5.3 |
| Styling | Tailwind CSS v4, Radix Primitives, Lucide | Tailwind 4.x, Radix latest, `lucide-react` latest | §5.4 |
| State | Zustand, TanStack Query, Zod | Zustand 5.x, Query 5.x, Zod 4.x | §5.5 |
| IPC | `tauri-specta` | 2.x (Tauri 2 line) | §6 |
| Async / HTTP / WS (Rust) | `tokio`, `reqwest`, `tokio-tungstenite` | current stable | §7 |
| Auth | `oauth2` crate, `keyring`, system browser, deep link | `oauth2` 5.x, `keyring` 3.x | ADR-002 |
| Real-time | Azure Web PubSub, `json.reliable.webpubsub.azure.v1` | service-defined | §7.2 |
| Tauri plugins | global-shortcut, single-instance, deep-link, autostart, notification, log, window-state | matching Tauri 2.x | §4.3 |
| Telemetry | Sentry (Rust + browser via `tauri-plugin-sentry`), OpenTelemetry to Azure Application Insights | current | §8 |
| Packaging | WiX MSI (Windows), signed + notarized `.pkg` (macOS) | Tauri CLI bundler | ADR-004 |
| Signing | Azure Trusted Signing; Apple Developer ID + notarytool | — | ADR-004 |
| Distribution | Intune (Windows), Jamf / Intune (macOS) | — | ADR-004 |
| Tooling | pnpm, Storybook, Vitest, Playwright, ESLint, Prettier, `cargo clippy`, `cargo audit` | current | §9 |

---

## 3. Shell: Tauri 2 and Rust

### 3.1 Why Tauri 2

- Uses the OS webview, so the always-resident sidecar stays small and inherits browser security patches from the OS instead of shipping a Chromium.
- Multi-window with per-window capabilities; the `anchor` and `panel` windows carry only the permissions they use.
- First-class plugin set for the dock's needs (global shortcut, single instance, deep link, autostart, window state, notification, log).
- Rust native layer with direct access to AppKit and Win32 for the two behaviours no framework provides out of the box: non-activating windows and screen-capture exclusion.
- Bundler produces MSI and `.pkg`; signing and notarization are supported in CI.

Rejected alternatives and reasoning: ADR-001.

### 3.2 Rust crates in `src-tauri`

| Crate | Purpose | Notes |
|---|---|---|
| `tauri` 2.x | App, windows, tray, menus, events | Tray and context menus use the built-in menu API; no plugin needed. |
| `tauri-specta` + `specta` | Typed commands and events, TS bindings export | Bindings written to `contracts/bindings/`; CI drift check. |
| `tauri-plugin-global-shortcut` | Summon and pin hotkeys | Defaults Ctrl+Alt+L / Ctrl+Option+L (open Ask) and Ctrl+Alt+P / Ctrl+Option+P (pin); user-configurable; conflicts detected on registration failure. |
| `tauri-plugin-single-instance` (feature `deep-link`) | One process; forwards second-launch args (auth callback) | Required on Windows for `loop://` callbacks. |
| `tauri-plugin-deep-link` | `loop://auth/callback` | Registered at install (MSI) and on first run (macOS). |
| `tauri-plugin-autostart` | Login item / HKCU Run | Toggle in Settings; default on for the pilot. |
| `tauri-plugin-notification` | OS toasts for Attention items | Toast click routing is best-effort on desktop; the pill badge is the reliable signal. |
| `tauri-plugin-log` + `tracing` | Structured logs to file and console | Levels and redaction rules in `shell-architecture.md` §7. |
| `tauri-plugin-window-state` | Persist pill y-position and pinned state per monitor layout | Supplemented by our own `settings/` for per-layout keys. |
| `tauri-nspanel` | Convert `NSWindow` to non-activating `NSPanel` on macOS | Vendor the glue into `native/macos.rs` if maintenance stalls. |
| `objc2`, `objc2-app-kit` | Collection behaviour, `sharingType`, frontmost app | Used only in `native/macos.rs`. |
| `windows` | `WS_EX_NOACTIVATE`, `WS_EX_TOOLWINDOW`, `SetWindowDisplayAffinity`, `GetForegroundWindow`, `SHQueryUserNotificationState` | Used only in `native/windows.rs`. |
| `window-vibrancy` | Optional Mica/Acrylic (Windows) and `NSVisualEffectView` (macOS) panel background | Enhancement; UI must be correct without it. |
| `tokio` | Async runtime | Multi-thread runtime shared by Tauri. |
| `reqwest` (rustls) | Orchestrator HTTP client | Only in `api/`. |
| `tokio-tungstenite` (rustls) | Web PubSub client | Only in `realtime/`. |
| `oauth2` | Auth code + PKCE | Only in `auth/`. |
| `keyring` | OS credential store | Entries `loop-dock/<tenant>/<user>`. |
| `serde`, `serde_json` | Serialisation | — |
| `thiserror`, `anyhow` | Error types (`IpcError` is `thiserror`) | Never `String` errors over IPC. |
| `sentry` (via `tauri-plugin-sentry`) | Crash and error reporting | PII scrubbing before send. |
| `opentelemetry`, `opentelemetry-otlp`, `tracing-opentelemetry` | Traces to Application Insights | Spans carry `journeyId`, `taskId`. |

### 3.3 Tauri configuration essentials

- `app.windows[]`: two entries, labels `anchor` and `panel` (flags in `shell-architecture.md` §2).
- `app.macOSPrivateApi: true` (transparency on macOS).
- `app.security.csp`: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'none'`.
- `bundle.targets`: `["msi"]` on Windows, `["app", "dmg"]` for developer builds and a `.pkg` produced by `pkgbuild`/`productbuild` in CI for macOS distribution.
- `bundle.windows.webviewInstallMode`: `downloadBootstrapper` (fleet already has the runtime; bootstrapper is the safety net).
- `plugins.deep-link.desktop.schemes`: `["loop"]`.

---

## 4. Native layer

### 4.1 macOS

- Both windows are converted to `NSPanel` with `NSWindowStyleMaskNonActivatingPanel`; `hidesOnDeactivate = false`; `collectionBehavior = canJoinAllSpaces | fullScreenAuxiliary | stationary`; `level = .floating` (or `.statusBar` for the pill if Spaces transitions require it).
- Activation policy `Accessory` so Loop never appears in the Dock or the Cmd-Tab switcher.
- Typing into the composer: the panel becomes key without activating the app (`becomesKeyOnlyIfNeeded`), matching Spotlight-style behaviour. WKWebView first-responder handling is verified in the spike.
- Screen-capture exclusion: `NSWindow.sharingType = .none` when the Settings toggle is on.
- Frontmost app capture and restore: `NSWorkspace.shared.frontmostApplication` before activation; `activate()` on it after hide.

### 4.2 Windows

- Both HWNDs get `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` (no activation on click, no taskbar/Alt-Tab entry) in addition to Tauri's `alwaysOnTop`.
- Typing into the composer: `SetForegroundWindow(panel)` after `GetForegroundWindow()` is stored; on hide, the stored HWND is restored. `AllowSetForegroundWindow` is not required because the click originates in our process.
- Screen-capture exclusion: `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` (Windows 10 2004+). Excluded windows are also hidden in RDP recording and some capture paths; the toggle is per user.
- Presentation awareness: `SHQueryUserNotificationState` returns `QUNS_PRESENTATION_MODE`, `QUNS_BUSY`, `QUNS_RUNNING_D3D_FULL_SCREEN`; Attention pops and toasts are suppressed in these states (hotkey still works).
- DPI: per-monitor v2 awareness (Tauri default); geometry is computed in physical pixels using each monitor's scale factor.

### 4.3 Plugins in use (and not in use)

In use: global-shortcut, single-instance, deep-link, autostart, notification, log, window-state.
Not in use: `positioner` (our placement is bespoke), `updater` (ADR-004), `http` and `websocket` plugins (webview must not talk to the backend), `fs`, `shell` beyond `open` for the system browser, `store` (settings are Rust-owned).

### 4.4 Window vibrancy

Optional Mica (Windows 11) / `NSVisualEffectView` (macOS) behind the panel via `window-vibrancy`. Enabled by default where supported, disabled under `prefers-reduced-transparency` or when the user turns it off. The UI's opaque `--surface` token must produce a correct panel with vibrancy off.

---

## 5. UI layer

### 5.1 React 19 + TypeScript + Vite

- Function components, hooks, strict TypeScript. React 19 features used: `use()` for adapter/session context, Actions for composer submit, `useOptimistic` for decision buttons.
- Vite serves three targets from one codebase: the `panel` window, the `anchor` window (a second HTML entry), and Storybook. The adapter chosen at boot (`tauri` inside the dock, `mock` in a browser) is the only difference.

### 5.2 Adapter boundary

`src/adapters/adapter.ts` defines the interface (one method per IPC command, one subscription per event). `tauri.ts` implements it with the generated bindings; `mock.ts` talks to the mock orchestrator over HTTP/WS. Components never import Tauri APIs. This is what makes "UI in the browser first" work and is enforced by `.cursor/rules/react-ui.mdc` and an ESLint `no-restricted-imports` rule.

### 5.3 Motion

`motion` (Motion for React) for panel open, mode cross-fade, card stagger, badge scale and skeleton shimmer. All presets live in `src/ui/motion.ts` (spring 400/30, 35 ms stagger, 120/200 ms durations) and honour `useReducedMotion()`. The panel window is fixed-size; animation is content-only.

### 5.4 Styling: Tailwind v4, Radix, Lucide

- Tailwind v4 CSS-first configuration (`@theme` in `src/ui/tokens.css`), no `tailwind.config.js`. Semantic tokens over ADIC brand colours; light and dark both first-class; theme follows the OS with a user override (`ui-ux.md` §4).
- Radix Primitives for menu, dialog, tooltip, tabs, toggle, scroll area; accessibility semantics come from Radix, styling from tokens.
- Lucide icons, 16 px in dense rows and 20 px in cards.
- System font stack (`Segoe UI Variable`, `SF Pro`), no webfonts.

### 5.5 State and data

- **Zustand** stores: `dock` (mode, open, pinned, pill y), `session`, `attention` (selection, filters), `ledger` (filters, scroll anchor), `composer` (draft, attachments none). UI state only.
- **TanStack Query** for server reads through the adapter: `['attention', userId]`, `['ledger', userId, filters]`, `['journey', journeyId]`. Realtime events update or invalidate queries.
- **Zod v4** schemas from `contracts/` validate every inbound payload before it touches state; unknown card types are dropped and logged. Types are `z.infer`.
- **TanStack Virtual** for the Recent list (10k rows at 60 fps).

---

## 6. IPC contract

- Every Rust command and event is annotated for `tauri-specta`; `cargo run --bin export-bindings` writes `contracts/bindings/{commands,events}.ts`. CI fails on drift.
- Commands (snake_case verbs): `dock_show`, `dock_hide`, `dock_pin`, `dock_set_mode`, `anchor_set_y`, `anchor_set_expanded`, `anchor_hide`, `anchor_show`, `auth_sign_in`, `auth_sign_out`, `auth_get_session`, `ask_submit`, `ask_cancel`, `attention_decide`, `ledger_query`, `settings_get`, `settings_set`, `telemetry_event`.
- Events: `attention_new`, `attention_expired`, `attention_resolved`, `task_state`, `ledger_appended`, `session_changed`, `connectivity_changed`, `dock_state_changed`, `theme_changed`, `settings_changed`, `settings_requested`, `presentation_changed`.
- Errors: `IpcError { code, message, retryable }`.

Full list with payloads: `shell-architecture.md` §5.

---

## 7. Networking, identity and real-time (Rust only)

### 7.1 Orchestrator API

`api/` holds the only `reqwest` client and the only backend URLs (from remote config with a build-time default). Requests carry the bearer token from the keychain, `x-journey-id` when known, and W3C trace context. Responses are deserialised with `serde` and re-validated with Zod in the UI.

### 7.2 Azure Web PubSub

No official Rust SDK; `realtime/webpubsub.rs` speaks the `json.reliable.webpubsub.azure.v1` subprotocol over `tokio-tungstenite`: negotiate via the orchestrator (`GET /negotiate` returns a client access URL), connect, join the user's group, ack messages, reconnect with `reconnectionToken` and exponential backoff (500 ms to 30 s, jitter), resume after sleep/wake and network change, heartbeat every 20 s, dedupe by `eventId` (ring buffer of 1,000). Events are re-emitted to the UI as typed Tauri events.

### 7.3 Identity

Auth code + PKCE in `auth/` using `oauth2`, system browser, `loop://auth/callback` deep link with loopback fallback, tokens in `keyring`. Details and the Conditional Access checkpoint: ADR-002.

---

## 8. Telemetry and remote config

- **Sentry** via `tauri-plugin-sentry`: Rust panics and errors, browser errors from the webview, release tagging (`loop-dock@<version>`), PII scrubbing (UPNs, free-text replies, card bodies never sent).
- **OpenTelemetry** traces from Rust exported over OTLP to Azure Application Insights; spans for ask submission, decision relay, reconnects; attributes `journeyId`, `taskId`, `agentId`.
- **Remote config** (orchestrator endpoint, fetched on start and every 5 min): `dockPaused`, `disabledAgents[]`, `forceSignOut`, `minVersion`. This is the kill switch; it needs no updater.

---

## 9. Tooling, CI and quality gates

- **Package manager:** pnpm. **Rust:** `cargo clippy -D warnings`, `cargo fmt --check`, `cargo audit`.
- **TypeScript:** `tsc --noEmit`, ESLint (with `no-restricted-imports` for `@tauri-apps/*` outside adapters), Prettier.
- **Storybook** for every component state in both themes, with the a11y addon.
- **Vitest** for reducers, adapters, schema guards. **Playwright** for the five UI flows (ask -> cards, choice disambiguation, confirm -> Recent, Attention expiry, ledger filter) against the mock.
- **CI matrix:** macOS and Windows runners; `cargo tauri build`; bindings drift check; visual review artefacts (Storybook static build per OS).
- **Release:** one tag builds, signs, notarizes, generates SBOM (CycloneDX), runs audits, publishes MSI and `.pkg` (ADR-004).

---

## 10. Rejected technologies (summary)

| Technology | Why not | Decision |
|---|---|---|
| Electron, Flutter, MAUI, Qt, native-only | Footprint, double implementation, or no advantage for a webview-sized UI | ADR-001 |
| Tauri 1 | Superseded API surface, no capabilities model | ADR-001 |
| MSAL / embedded-webview sign-in | No Rust MSAL; tokens would touch the webview | ADR-002 |
| MSIX, NSIS, `tauri-plugin-updater` | Bundler support, MDM conflict | ADR-004 |
| Full-height hover hot zone, cursor polling, AppBar | Edge collisions, idle cost, fragility | ADR-003, ADR-005 (tab hover is allowed; full-height strip is not) |
| `tauri-plugin-http` / `websocket` / `store` | Backend traffic and secrets stay in Rust | ADR-001 |
| Redux, MobX, CSS-in-JS, Tailwind v3 config | Duplicates chosen tools; v3 syntax breaks v4 | §5 |
| Webfonts, custom icon sets | Footprint and brand consistency | §5.4 |

---

## Appendix A — Reference links

**Shell**

- Tauri 2 — docs https://v2.tauri.app/ · config reference https://v2.tauri.app/reference/config/ · capabilities https://v2.tauri.app/security/capabilities/ · plugins https://v2.tauri.app/plugin/ · distribute https://v2.tauri.app/distribute/ · core repo https://github.com/tauri-apps/tauri · plugins workspace https://github.com/tauri-apps/plugins-workspace
- Rust — https://www.rust-lang.org/learn · The Book https://doc.rust-lang.org/book/
- WebView2 — https://learn.microsoft.com/microsoft-edge/webview2/ · distribution https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution

**Native layer (Rust)**

- tauri-nspanel — https://github.com/ahkohd/tauri-nspanel · NSPanel https://developer.apple.com/documentation/appkit/nspanel · NSWindow.sharingType https://developer.apple.com/documentation/appkit/nswindow/sharingtype
- objc2 — https://docs.rs/objc2 · objc2-app-kit https://docs.rs/objc2-app-kit
- windows-rs — https://github.com/microsoft/windows-rs · API docs https://microsoft.github.io/windows-docs-rs/ · extended window styles https://learn.microsoft.com/windows/win32/winmsg/extended-window-styles · SetWindowDisplayAffinity https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity · SHQueryUserNotificationState https://learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-shqueryusernotificationstate
- window-vibrancy — https://github.com/tauri-apps/window-vibrancy
- Tauri plugins — global shortcut https://v2.tauri.app/plugin/global-shortcut/ · single instance https://v2.tauri.app/plugin/single-instance/ · deep linking https://v2.tauri.app/plugin/deep-linking/ · autostart https://v2.tauri.app/plugin/autostart/ · notification https://v2.tauri.app/plugin/notification/ · logging https://v2.tauri.app/plugin/logging/ · window state https://v2.tauri.app/plugin/window-state/ · menus and tray https://v2.tauri.app/learn/system-tray/
- tokio — https://tokio.rs · reqwest — https://docs.rs/reqwest · tokio-tungstenite — https://docs.rs/tokio-tungstenite
- oauth2 — https://docs.rs/oauth2 · keyring — https://docs.rs/keyring
- sentry — https://docs.sentry.io/platforms/rust/ · tauri-plugin-sentry https://github.com/timfish/tauri-plugin-sentry · OpenTelemetry Rust https://opentelemetry.io/docs/languages/rust/

**IPC**

- Tauri IPC — concepts https://v2.tauri.app/concept/inter-process-communication/ · commands https://v2.tauri.app/develop/calling-rust/ · events https://v2.tauri.app/develop/calling-frontend/
- tauri-specta — https://github.com/specta-rs/tauri-specta · https://docs.rs/tauri-specta

**UI**

- React — https://react.dev · TypeScript — https://www.typescriptlang.org/docs/ · Vite — https://vite.dev/guide/
- Motion — https://motion.dev/docs/react · https://github.com/motiondivision/motion
- Tailwind CSS v4 — https://tailwindcss.com/docs · theme variables https://tailwindcss.com/docs/theme
- Radix Primitives — https://www.radix-ui.com/primitives · Lucide — https://lucide.dev/icons/
- Zustand — https://zustand.docs.pmnd.rs · TanStack Query — https://tanstack.com/query/latest · TanStack Virtual — https://tanstack.com/virtual/latest · Zod — https://zod.dev
- Storybook — https://storybook.js.org/docs · Vitest — https://vitest.dev · Playwright — https://playwright.dev

**Real-time and API**

- Azure Web PubSub — overview https://learn.microsoft.com/azure/azure-web-pubsub/overview · JSON subprotocol https://learn.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol · reliable subprotocol https://learn.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol
- A2A Protocol — https://a2a-protocol.org/latest/specification/

**Identity**

- Entra identity platform — https://learn.microsoft.com/entra/identity-platform/ · auth code + PKCE https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow · desktop scenario https://learn.microsoft.com/entra/identity-platform/scenario-desktop-overview · Conditional Access https://learn.microsoft.com/entra/identity/conditional-access/overview · Enterprise SSO plug-in (macOS) https://learn.microsoft.com/entra/identity-platform/apple-sso-plugin

**Packaging and distribution**

- Azure Trusted Signing — https://learn.microsoft.com/azure/trusted-signing/ · Apple notarization — https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Intune Win32 apps — https://learn.microsoft.com/mem/intune/apps/apps-win32-app-management · Jamf Pro — https://learn.jamf.com/

---

## Changes in v0.3

- ADR-005: the anchor shows a 20 × 180 edge tab that expands to the 56 × 180 pill on hover (`anchor_set_expanded`; the window is fixed at the pill size and a `SetWindowRgn` clip forms the tab). Full-height hover strips remain rejected.

## Changes in v0.2

- Restructured from a link list into a full stack document with rationale, per-crate purposes, configuration essentials and rejected alternatives.
- Added Tauri menu API (context menus), `tauri-plugin-window-state`, `objc2`, `window-vibrancy` usage, `oauth2`, Sentry and OpenTelemetry, TanStack Virtual, tooling and CI gates.
- Removed the assumption of hover hot zones and the `positioner` plugin (ADR-003).
- Corrected packaging to MSI + notarized `.pkg` with MDM-owned updates (ADR-004) and identity to PKCE-in-Rust (ADR-002).
- Original link list preserved and extended as Appendix A.
