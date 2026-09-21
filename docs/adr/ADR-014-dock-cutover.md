# ADR-014 — Dock cutover: from the mock to the real orchestrator (post-orchestrator configuration)

| | |
|---|---|
| **Status** | Proposed |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Function performed: Loop Platform Team (dock). Team names identify the function, not a separate group. |
| **Audience** | Loop build team · Endpoint engineering · Security · Orchestrator team |
| **Related** | [shell-architecture.md](../shell-architecture.md) §6, §7, §10, Appendix A · [technology.md](../technology.md) §7–§9 · [ADR-002](ADR-002-auth-flow.md) · [ADR-004](ADR-004-packaging-and-updates.md) · `src-tauri/src/config.rs` · `src-tauri/src/auth/mod.rs` · `src-tauri/src/realtime/webpubsub.rs` · ADR-006 · ADR-008 · ADR-010 · ADR-013 |

## Status

Proposed. This is the last ADR in the set to execute and the only one whose code lands in `LoopShell`. It lists every configuration and code change the dock needs once ADR-006 to ADR-013 have delivered, and the pipeline that turns them into a signed pilot MSI.

## Context

- The dock is a thin client and stays one: no database, no business logic, no A2A. Its configuration surface is small and lives in `src-tauri/src/config.rs`: `LOOP_API_URL`, `LOOP_AUTH_MODE`, `LOOP_ENTRA_TENANT`, `LOOP_ENTRA_CLIENT_ID`, `LOOP_API_SCOPE`, `LOOP_REDIRECT_URI`, `LOOP_EXTERNAL_HOSTS`, read from the build environment (`option_env!`) with a runtime environment override. Every default points at the mock (`http://127.0.0.1:8787`, `mock` auth).
- `config.rs` falls back to mock auth with a warning when Entra values are missing. In a release build that fallback would silently produce a dock that signs nobody in and talks to `localhost`.
- The React UI needs no environment: `src/adapters/index.ts` picks the `tauri` adapter whenever it runs inside the webview; `VITE_MOCK_URL` only affects the browser harness and Storybook. The UI does need new behaviour for what ADR-006 adds to the contract (`RemoteConfig`, `DockState.remote`, `pop`, `decision`).
- Several dock changes were scheduled here by other ADRs: require `oid` (ADR-008 item 5), `joinGroup` failure handling and possible WebSocket proxy support (ADR-010 items 7–8), the `telemetry/` module (ADR-013 step 4), `pop` handling and the remote-config poller (ADR-006).
- There is no CI pipeline in the repository. `technology.md` §9 and ADR-004 describe one (typecheck, lint, tests, bindings drift, `cargo tauri build`, Trusted Signing, SBOM), and `contracts/bindings/README.md` assumes the drift check exists.
- MDM owns distribution and updates (ADR-004). The pilot ring is Windows first; macOS follows with the VIP users.

## Decision

### Scope and repositories

| Repository | What lands there |
|---|---|
| `LoopShell` | Everything in items 1–7. |
| `loop-infra` | CI identities only: a federated credential for the pipeline to use Azure Trusted Signing; Key Vault entries for the Sentry DSN. No dock configuration lives in infrastructure. |

### Decision items

1. **Configuration is baked at build time, per flavour.** Two build flavours, selected by the pipeline's environment:

   | Variable | `dev` flavour | `pilot` flavour | Source |
   |---|---|---|---|
   | `LOOP_API_URL` | `https://api.dev.loop.<domain>` (or the mock for local work) | `https://api.loop.<domain>` | ADR-011 |
   | `LOOP_AUTH_MODE` | `entra` (or `mock` locally) | `entra` — **required** | ADR-008 |
   | `LOOP_ENTRA_TENANT` | `dev` values | `pilot` values | ADR-008 `values.*.json` |
   | `LOOP_ENTRA_CLIENT_ID` | Loop Dock (dev) app id | Loop Dock (pilot) app id | ADR-008 |
   | `LOOP_API_SCOPE` | `api://<dev-api-app-id>/Dock.Access` | `api://<pilot-api-app-id>/Dock.Access` | ADR-008 |
   | `LOOP_REDIRECT_URI` | `loop://auth/callback` | `loop://auth/callback` | ADR-002 |
   | `LOOP_EXTERNAL_HOSTS` | Build-time seed of system-of-record hosts | Same; extended at runtime by `RemoteConfig.externalHosts` | ADR-006, ADR-012 |
   | `LOOP_SENTRY_DSN`, `LOOP_ENVIRONMENT` (new) | dev DSN, `dev` | pilot DSN, `pilot` | ADR-013 |

   Release builds **ignore runtime environment overrides** (the `std::env::var` path in `config.rs` is compiled only under `debug_assertions`), so an installed dock cannot be pointed at another API by a process environment. Users never configure anything; MDM never configures anything (ADR-004).

2. **Release-build guards.** `src-tauri/build.rs` fails the build when `PROFILE=release` and `LOOP_AUTH_MODE != entra` or any of tenant, client id, scope, API URL (must be `https://`) or Sentry DSN is missing. `config.rs` no longer falls back to mock in release: a missing Entra configuration is a startup panic in release and a warning only in debug. The mock remains fully available to `cargo tauri dev` and to the browser harness.

3. **Rust changes** (each a small PR against the referenced module):

   | # | Change | Module | From |
   |---|---|---|---|
   | R1 | `oid` required; drop the `sub` fallback; sign-in error if absent | `auth/mod.rs` | ADR-008 item 5 |
   | R2 | Remote config poller: `GET /config` after session start and every `pollIntervalSec` (default 300 s), with `If-None-Match`; applies `dockPaused` (a remote pause the user cannot lift; badge still updates), `forceSignOut` (`session_sign_out(Forced)`), `minVersion` (semver compare against `CARGO_PKG_VERSION`; below → `DockState.remote.updateRequired`, composer and decisions disabled, pill stays), `disabledAgents[]` and `agents[]` (exposed to the UI), `externalHosts` (merged into the `open_external` allow-list). Emits `remote_config_changed`; serves `remote_config_get`. | new `remote_config/` | ADR-006 items 2–3 |
   | R3 | `attention.created { pop: false }` → insert only: no `attention_arrived`, no OS toast | `realtime/webpubsub.rs` `dispatch` | ADR-006 item 4 |
   | R4 | `joinGroup` ack with `success: false` → treat as connection failure (`reconnecting`, backoff) | `realtime/webpubsub.rs` | ADR-010 item 8 |
   | R5 | WebSocket egress through the system proxy (HTTP CONNECT) **only if** Endpoint engineering's check (ADR-010 item 7) shows proxy-only egress | `realtime/webpubsub.rs` | ADR-010 step 7 |
   | R6 | `telemetry/` module: Sentry init with `before_send` redaction, real trace context replacing the `traceparent()` stub, `telemetry_event` wiring | new `telemetry/`, `api/mod.rs` | ADR-013 step 4 |
   | R7 | User agent `LoopDock/<version> (<os>)` on every request, `contractsVersion` logged from `GET /config` | `api/mod.rs` | ADR-013 item 2 |

   Bindings are regenerated after R2 (`pnpm bindings`); the drift check in item 6 enforces it.

4. **UI changes** (`src/`, through the adapter only; no new mode, no new window):

   | # | Change | Where |
   |---|---|---|
   | U1 | `remote_config_changed` → Zustand `session`/`dock` state: registry entries merged over `contracts/registry/agents.ts` (server wins), `disabledAgents[]` | `src/shell/useShellEvents.ts`, `src/stores/` |
   | U2 | `DockState.remote.updateRequired` → a status strip in the panel ("Update required — your IT team will install it") and disabled composer and decision buttons; `remote.paused` → the existing paused presentation with the strip copy from `RemoteConfig.message` | `src/shell/`, `ui-ux.md` §3.6 states |
   | U3 | `attention_resolved.decision` → "Already decided elsewhere: *Approve* by Sara" toast and read-only detail | `useShellEvents.ts`, Attention detail |
   | U4 | Handoff chip for an agent in state `disabled` or unknown: neutral copy, no link | `src/modes/ask/` |
   | U5 | Browser Sentry init in `bootstrap.tsx` (errors only; transport through the Tauri plugin) | `src/app/bootstrap.tsx` |

   The mock adapter, Storybook and the Playwright flows against the mock are unchanged and stay the UI's primary development loop.

5. **CSP, capabilities and allow-lists stay as they are.** `connect-src 'none'` remains; the UI loads no remote images (`AgentRegistryEntry` has no icon URL by design, ADR-006); capabilities per window are unchanged; `open_external` keeps the host allow-list, now extended by `externalHosts`.

6. **CI and release pipeline** (new; `technology.md` §9 and ADR-004 are the specification):
   - **CI on every PR**: `pnpm check` (typecheck, lint, Vitest, Vite build), `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, bindings drift (`pnpm bindings && git diff --exit-code contracts/bindings`), the ADR-006 conformance suite against the mock, Playwright against the mock, `cargo audit`, `pnpm audit`.
   - **Release on tag** (`dock@<version>`): Windows runner builds the `pilot` flavour with the item 1 variables from pipeline variables (values from ADR-008 `values.pilot.json`, DSN from Key Vault), signs with Azure Trusted Signing via a federated pipeline identity, produces the MSI, an SBOM (CycloneDX) and a build manifest (version, `contractsVersion`, API host, commit). A `dev` flavour is built unsigned for integration testing and is never distributed. macOS `.pkg` joins when the VIP ring is scheduled (ADR-004).
   - The MSI version is the `package.json` / `Cargo.toml` version (Tauri reads `../package.json`); it is also what `minVersion` compares against and what Intune's detection rule reads.

7. **Verification before the pilot ring.**
   - ADR-006 conformance suite against the `pilot` edge with a pilot test account.
   - `shell-architecture.md` Appendix A rows that involve identity or realtime, on the standard image: session expiry and sign-in via system browser; VPN connect / disconnect during an ask; sleep / wake reconnect < 5 s; lock / unlock.
   - 24-hour refresh soak on both OSes (ADR-002 follow-up, ADR-008 step 6).
   - Two-device test: the same Attention item decided on Windows and macOS; the loser shows the ADR-006 `decision`.
   - Kill-switch drill: `dockPaused`, `forceSignOut`, `minVersion` above the installed version, each applied through `PUT /admin/config` and observed on a device within one poll interval.
   - Endpoint engineering: firewall / proxy allow-list confirmed for `api.loop.<domain>`, `*.webpubsub.azure.com`, `login.microsoftonline.com`, the Sentry ingest host; Intune Win32 packaging, detection rule, `loop://` handler and autostart verified per ADR-004.

8. **Operations after cutover.** The kill switch (`PUT /admin/config`, ADR-011 item 6) is the only runtime lever: pause the dock fleet-wide, disable an agent, force re-authentication, or set `minVersion` after an Intune rollout has completed (never before — a `minVersion` ahead of the installed fleet blocks every user). Rollback is Intune redeploying the previous MSI with `minVersion` unchanged. The mock stays in the repository as the UI development loop and the conformance fixture; it is never part of a release artifact.

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | ADR-006 `contracts@0.2` bindings (`remote_config_*`, `DockState.remote`, `pop`, `decision`) | Loop Platform Team |
| P2 | ADR-008 `values.dev.json` / `values.pilot.json`; CA checkpoint outcome A (or the superseding broker ADR completed) | Identity |
| P3 | ADR-011 `dev` and `pilot` edges reachable; `GET /config` served | Orchestrator team |
| P4 | ADR-010 fleet egress check result (decides R5) | Endpoint engineering |
| P5 | ADR-013 Sentry DSNs in Key Vault | Cloud & AI Team |
| P6 | Azure Trusted Signing account and a federated pipeline identity (multi-week lead time, ADR-004) | Security / Cloud & AI Team |
| P7 | Intune packaging slot for the pilot group (ADR-004) | Endpoint engineering |

### Steps

1. CI pipeline (item 6, PR part) on the current code, so every subsequent PR is gated. Fix any drift it finds.
2. R1, R3, R4, R7 (small, independent of the server).
3. Build-time guards and flavours (items 1–2); `build.rs` check; `config.rs` release behaviour; `.env.example` documents both flavours.
4. R2 remote config poller with stubbed server responses; U1, U2, U4; regenerate bindings.
5. R6 telemetry module and U5 (ADR-013 step 4).
6. U3 and the two-device test against the `dev` edge.
7. R5 only if P4 requires it.
8. Release pipeline (item 6, tag part) producing a signed `pilot` MSI; SBOM and manifest published.
9. Verification of item 7 on the standard-image devices; record results in `shell-architecture.md` Appendix A.
10. Intune packaging and assignment to the pilot group (ADR-004); first pilot release.

### Acceptance

- A `pilot` MSI built from a tag installs silently on a standard-image device, signs in a pilot-group user through the system browser, shows real Attention and Recent, completes `raiseIncident` against `servicenow-itsm`, and reconnects after sleep within budget.
- A release build with a missing Entra value fails in CI; a release build ignores a `LOOP_API_URL` set in the process environment.
- All three kill-switch levers take effect on a device within one poll interval.
- The dock never opens a URL whose host is outside the build-time or remote allow-list.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Runtime configuration file in `%PROGRAMDATA%` / `/Library/Application Support` delivered by Intune / Jamf | A second configuration owner and a tamper surface on the device for values that select the identity provider and API. Revisit for GA if one MSI must serve several tenants. |
| Windows registry policy (ADMX) for configuration | Windows-only, same tamper considerations, and the macOS ring would need a different mechanism. |
| Keep runtime environment overrides in release | Lets any process in the user's session redirect the dock to another API; there is no operational need. |
| Ship the mock adapter out of the bundle via a Vite define | Dead code inside the webview costs kilobytes and removing it would fork the bundle between harness and dock; `isTauri()` already selects the adapter. |
| Reuse the `dev` build for the pilot | Different Entra registrations, API host and Sentry environment; the flavour split is what keeps them apart. |
| `tauri-plugin-updater` to enforce `minVersion` | Banned for the pilot (ADR-004); `minVersion` is a block, not an updater. |

## Consequences

**Positive**

- The dock's cutover is a set of build variables and eight bounded code changes; the UI keeps its browser-first development loop.
- Release builds cannot accidentally run in mock mode or be redirected.
- Every scheduled dock follow-up from ADR-006, ADR-008, ADR-010 and ADR-013 has a home and an order.

**Negative and mitigations**

- Per-flavour builds mean two MSIs per release. Mitigation: only `pilot` is signed and distributed; `dev` is a pipeline artifact.
- A pipeline is new work before any feature work. Mitigation: it is also the drift check the contracts README already assumes; step 1 pays for itself on the first regenerated binding.
- Proxy support (R5) is conditional and could surface late. Mitigation: P4 is a prerequisite, not a discovery.

**Follow-ups**

- macOS `.pkg` pipeline and Jamf packaging when the VIP ring is scheduled (ADR-004).
- Before GA: revisit MDM-delivered configuration for multi-tenant builds, and the OTLP export path in ADR-013.

## References

- `src-tauri/src/config.rs` (current variables and fallbacks), `src-tauri/src/auth/mod.rs`, `src-tauri/src/realtime/webpubsub.rs`, `src/adapters/index.ts`, `src/lib/env.ts`.
- ADR-002 (flow), ADR-004 (packaging, signing, MDM), `technology.md` §9 (CI gates), `shell-architecture.md` §7 (security), Appendix A (test matrix).
- Tauri 2 build and distribution: https://v2.tauri.app/distribute/
- Azure Trusted Signing in CI: https://learn.microsoft.com/azure/trusted-signing/how-to-signing-integrations
- Intune Win32 app management: https://learn.microsoft.com/mem/intune/apps/apps-win32-app-management
