# ADR-001 — Shell stack: Tauri 2 + Rust native layer + React UI

| | |
|---|---|
| **Status** | Accepted |
| **Last updated** | 18 September 2026 |
| **Owner** | Waqas Ahmed (single owner for the Loop initiative; Loop Platform Team function) |
| **Audience** | Loop build team · Security · Endpoint engineering |
| **Related** | [technology.md](../technology.md) · [shell-architecture.md](../shell-architecture.md) · ADR-003 · ADR-004 |

## Status

Accepted. Revisit only if the native spike (see `shell-architecture.md` §9) fails to prove non-activating behaviour on either OS.

## Context

Loop Dock is an always-resident desktop sidecar on managed Windows 11 and macOS devices. It must:

- Sit on the right screen edge as a small pill, open a panel on click or hotkey, and never steal focus from the application the user is working in.
- Appear over full-screen and maximised applications on both operating systems.
- Stay within a small idle footprint (< 1 % CPU hidden, tight memory) because it runs all day on every pilot device.
- Be packaged as a signed MSI and notarized `.pkg` and distributed by Intune and Jamf.
- Hold Entra ID tokens in the OS keychain and never expose them to the UI layer.
- Be built quickly by a small team (one shell engineer, one UI engineer) with heavy AI-assisted development, and be maintainable by a broader web-skilled talent pool afterwards.

The UI itself is small and mode-based (Ask, Attention, Recent) with a fixed set of card types; it does not need a large native widget toolkit.

## Decision

- **Shell:** Tauri 2 with a Rust native layer. The OS webview (WebView2 on Windows 11, WKWebView on macOS) renders the UI, so browser security patches are inherited from the OS rather than shipped by Loop.
- **Native code:** Rust modules `native/macos.rs` (AppKit via `tauri-nspanel` / `objc2`) and `native/windows.rs` (Win32 via the `windows` crate) implement non-activating windows, screen-capture exclusion and foreground-window restore. These are the only platform-specific files.
- **UI:** React 19 + TypeScript + Vite; Motion for animation; Tailwind v4 with ADIC design tokens; Radix Primitives; Lucide icons.
- **State and data:** Zustand for UI state, TanStack Query for server reads, Zod v4 for every inbound payload.
- **IPC:** `tauri-specta` generates TypeScript bindings for every Rust command and event; bindings are committed and drift-checked in CI.
- **Networking:** all HTTP and WebSocket traffic runs in Rust (`reqwest`, `tokio`, `tokio-tungstenite`). The webview has no network access to Loop backends.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Electron** | Ships Chromium (~150 MB, own patch cadence), high idle memory for an always-on sidecar, weaker story for non-activating windows on macOS without native addons. Security team would own another browser. |
| **.NET MAUI / WPF + WinUI 3 with a separate SwiftUI app** | Two codebases and two UI implementations for a product whose entire UI is one panel. Doubles the UI effort and design QA. |
| **Flutter desktop** | Good rendering, but non-activating panels, NSPanel behaviour and Win32 extended styles require the same native plugin work as Tauri without the web talent pool or Storybook-style iteration. |
| **Qt** | Licensing and a talent pool mismatch; no advantage for a webview-sized UI. |
| **Native-only (SwiftUI + WinUI)** | Best platform fidelity, but two full implementations and no shared card renderer; not achievable with the team size. |
| **Tauri 1** | End-of-life API surface; Tauri 2 has the capability/permission model, multi-window improvements and the plugin set (deep-link, single-instance, window-state) this product depends on. |
| **Web-only (browser tab, PWA)** | Cannot dock to the screen edge, cannot be non-activating, cannot hold tokens in the keychain, cannot appear over full-screen apps. |

## Consequences

**Positive**

- One UI codebase runs in Storybook, Vite and inside the dock via the adapter boundary; feel is tuned in a browser and shipped unchanged.
- Small binary and low idle footprint; OS-patched webview.
- Rust owns the security-relevant surface (tokens, network, native windows); the webview is a pure renderer.
- Signing, notarization and MSI/`.pkg` bundling are first-class in the Tauri CLI.

**Negative and mitigations**

- Two rendering engines (WKWebView, WebView2) can drift visually. Mitigation: Storybook reviewed on both OSes; visual checks at every integration gate.
- WebView2 is a multi-process runtime; hidden resident memory is measured as the whole process tree and will exceed a naive single-process budget. Mitigation: budgets in `shell-architecture.md` §8 are defined on the process tree.
- `tauri-nspanel` is a community crate. Mitigation: vendor the required AppKit glue into `native/macos.rs` if maintenance stalls.
- AI-generated code often targets Tauri 1 or Tailwind 3. Mitigation: `.cursor/rules/loop-stack-locked.mdc`, pinned versions, `cargo check` and `tsc --noEmit` in CI.
- No official Rust SDKs for MSAL or Azure Web PubSub. Mitigation: ADR-002 (PKCE in Rust) and a small subprotocol client over `tokio-tungstenite`.

**Follow-ups**

- Native spike proves non-activating behaviour, click-to-open pill and screen-capture exclusion on both OSes before UI investment.
- Measure reveal latency with the panel webview hidden vs kept off-screen; pick the strategy that meets the budget.

## References

- Tauri 2: https://v2.tauri.app/
- tauri-nspanel: https://github.com/ahkohd/tauri-nspanel
- windows-rs: https://github.com/microsoft/windows-rs
- tauri-specta: https://github.com/specta-rs/tauri-specta
