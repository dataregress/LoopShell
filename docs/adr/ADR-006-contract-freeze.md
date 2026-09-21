# ADR-006 — Contract freeze: `contracts@0.1` sign-off, `contracts@0.2` gap-closing, cross-repo distribution

| | |
|---|---|
| **Status** | Accepted (signed off 21 September 2026) |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Team names in this document (Loop Platform Team, Orchestrator team, Cloud & AI Team, Identity, Security) identify the function being performed, not a separate group; every item is owned by him until a second team is named. |
| **Audience** | Loop build team · Orchestrator team · Sub-agent owners · Security |
| **Related** | [system-architecture.md](../system-architecture.md) §4, §5, §9 · [shell-architecture.md](../shell-architecture.md) §5 · `.cursor/rules/contracts.mdc` · `contracts/CHANGELOG.md` · ADR-007 · ADR-008 · ADR-010 · ADR-014 · ADR-015 |

## Status

Accepted. Signed off on 21 September 2026 by Waqas Ahmed as owner of the Loop initiative; the co-signature this ADR originally assigned to the Orchestrator team is held by the same owner until a separate orchestrator team exists, at which point that team is added as a second required approver (item 8) without reopening this decision.

This is the first ADR to execute: every other ADR in the 006–015 set builds against the contract this one freezes. Nothing in the orchestrator, sub-agent or infrastructure repositories should be started before step 2 below (the `contracts@0.1` tag) exists. Accepting this ADR does not by itself sign `contracts@0.1`; that signature is recorded in `contracts/CHANGELOG.md` when step 2 is executed.

## Context

- `contracts/` is the boundary between the dock (this repository), the orchestrator and the sub-agents. `contracts/CHANGELOG.md` lists `contracts@0.1` as **unreleased, sign-off pending**. No tag has ever been signed, so nothing built server-side today is guaranteed to match what the dock validates.
- The dock already implements the eight API-edge endpoints in `system-architecture.md` §4.1 (`src-tauri/src/api/mod.rs`) and validates every wire event and card with the Zod schemas in `contracts/schemas/`. The mock in `tools/mock-orchestrator/` validates everything it emits against the same schemas. The shapes are therefore proven against a working UI; what is missing is the formal agreement.
- Three things the docs describe are not in the contract at all:
  - **Remote configuration** (`system-architecture.md` §4.8, `technology.md` §8): `dockPaused`, `disabledAgents[]`, `forceSignOut`, `minVersion`. No endpoint, no schema. `src-tauri/src/config.rs` says it "layers on top at runtime once the orchestrator exposes it".
  - **The authoritative agent registry**: `contracts/registry/agents.ts` is a build-time default; no endpoint serves the real one.
  - **The "one decision, two views" rule**: the mock creates an Attention item silently (`addAttention(full, { pop: false })` in `tools/mock-orchestrator/src/scenarios.ts`) when the deciding card is already in the open thread, and publishes only `journey.updated`. The dock relies on this: `realtime/webpubsub.rs` raises an OS toast and pops the panel on every `attention.created`, without knowing whether the card is on screen. The behaviour exists only as a comment in the mock.
- Three wire-level questions are open in `system-architecture.md` §9: the card artifact media type, the `A2AState` spelling, and whether the losing device in a cross-device decision should learn *what* was decided.
- The orchestrator and sub-agents are not TypeScript. Zod schemas cannot be their source of truth directly; a language-neutral artifact is needed.

## Decision

### Scope and repositories

| Repository | Role for this ADR |
|---|---|
| `LoopShell` (this repo) | Owns `contracts/`. Executes every step below. |
| `loop-orchestrator` (new; orchestrator work stream, same owner) | Consumer. Pins a `contracts@x.y` tag; generates server types from the published JSON Schema; runs the conformance suite in CI. |
| `loop-agent-template` (new, ADR-012) | Consumer of the card and Attention schemas only. |

### Decision items

1. **Sign off `contracts@0.1` as it stands.** No shape changes before the tag. The schemas are the ones the mock validates and the UI renders; the owner reviews them against `system-architecture.md` §4 wearing the orchestrator hat and records sign-off in `contracts/CHANGELOG.md`. When a separate orchestrator team is named, it re-reads the tag it inherits and adds its own signature line; it does not renegotiate 0.1.

2. **`contracts@0.2` is the additive gap-closing release.** Everything is optional or new, so the dock and mock keep working on 0.1 shapes.

   | Addition | Shape | Why |
   |---|---|---|
   | `GET /config` → `RemoteConfig` | `{ contractsVersion: string, dockPaused: boolean, disabledAgents: string[], forceSignOut: boolean, minVersion: string, message?: string, pollIntervalSec?: number, externalHosts?: string[], agents: AgentRegistryEntry[] }` | Kill switch (§4.8) and the authoritative registry in one poll. `contractsVersion` is the tag the edge serves (item 8). `externalHosts` extends the dock's `open_external` allow-list so a new sub-agent's system-of-record host does not need a dock build. |
   | `GET /negotiate` → `NegotiateResponse` | `{ url: string }` | The endpoint has no schema today, so it would be missing from the JSON Schema bundle and the OpenAPI document. `reconnectionToken` is deliberately absent: the dock does not read it (review pass). |
   | `AgentRegistryEntry` | `{ agentId, displayName, platform, state: 'shadow' \| 'enabled' \| 'disabled' }` | Served registry; the dock merges it over `contracts/registry/agents.ts`. `shadow` means "included in triage, never handed work" (ADR-012). No `iconUrl`: the dock's CSP forbids remote images. |
   | `AttentionNewEvent.pop?: boolean` (default `true`) | Added to the `attention.created` payload | The "one decision, two views" rule, made explicit (item 4). |
   | `AttentionRefEvent.decision?: { optionId, by: Person }` on `attention.resolved` | Optional | Resolves the §9 cross-device question: the losing device may show what was decided. |
   | `DockState.remote?: { paused: boolean, updateRequired: boolean, message?: string }` | IPC only | How the dock surfaces `dockPaused` and `minVersion` (ADR-014). |
   | IPC command `remote_config_get`, IPC event `remote_config_changed` | IPC only | The UI reads the registry and kill-switch state through the adapter, as with everything else. |

   `GET /config` requires a bearer token like every other endpoint. It should honour `If-None-Match` and return `304` when unchanged.

3. **Behavioural rules that are part of the contract from 0.2.** They live in `system-architecture.md` §4 (owner) and are tested by the conformance suite:

   | Rule | Decision |
   |---|---|
   | `POST /ask` idempotency | A repeated `clientRequestId` for the same user returns `200` with the original `{ journeyId, taskId }`. Never a second journey. |
   | `POST /ask/{taskId}/cancel` | `204` for an open or already-terminal task (idempotent); `404` code `invalid` for an unknown task. |
   | `GET /session` under Entra | Returns `Session` derived from the validated token (`userId` = `oid`, `displayName`, `upn`, `tenantId`, `expiresAt` = token `exp`). The dock owns the session; this is informational. |
   | `GET /negotiate` | `{ url }` is sufficient. `reconnectionToken` in the body is not read by the dock (reconnection uses the token from the Web PubSub `system` frame). |
   | `x-correlation-id` | Present on every response, success or failure, and equal to the W3C trace id of the server span (ADR-013). |
   | Error body | `{ code, message, retryable }`, `code` an `IpcErrorCode`; status codes as in §4.1. |

4. **The "one decision, two views" rule.** When a sub-agent (or triage) needs a decision from the user who submitted the ask, the orchestrator creates the Attention item **and** delivers the `choice` / `confirmation` card in `journey.updated` (`input-required`) with the same `attentionId`, then publishes `attention.created` with `pop: false`. The dock inserts the item into its Attention cache (badge is correct as soon as the panel hides) but raises no toast and does not pop the panel. Items for any other user, or platform-originated items (an expense claim landing), are published with `pop` absent or `true`. The mock is updated to publish `attention.created { pop: false }` instead of staying silent, so the two agree.

5. **Wire decisions recorded here, detailed in ADR-007.** Card artifact media type is `application/vnd.loop.card+json`; `A2AState` keeps the kebab-case enum and the orchestrator normalises at its A2A boundary; `canceled` (wire) / `cancelled` (`JourneyStatus`) stays as is.

6. **Cross-repo distribution is JSON Schema plus fixtures.** Each tag publishes:
   - `contracts/dist/loop-contracts.schema.json`: one JSON Schema bundle generated with Zod 4's `z.toJSONSchema()` for every exported schema (cards, Attention, Ledger, journey, session, events, `RemoteConfig`, `IpcError`).
   - `contracts/dist/fixtures/*.json`: every fixture in `contracts/fixtures/` serialised, as conformance vectors.
   - `contracts/dist/openapi.yaml`: the API-edge paths of §4.1 plus `/config`, referencing the schema bundle. Generated, never hand-edited.

   The bundle is attached to the tag's release (GitHub Release or Azure Artifacts, whichever hosts the repositories). Consumers pin the tag, generate types (`NJsonSchema` / `quicktype` for .NET, `datamodel-code-generator` for Python) and run the fixtures through their generated types in CI. Zod remains the single source of truth; the generated artifacts are outputs.

7. **Conformance suite.** `contracts/conformance/` is a runner (Vitest, Node) that takes an API base URL and a bearer token and checks: every §4.1 response validates; headers and error bodies match item 3; `POST /ask` idempotency; decision `200` / `200` (same key) / `409` (different key) / `404`; `GET /ledger` cursor stability while rows are appended; and, over Web PubSub, that every received frame validates as `WireEvent` and every payload validates against `IPC_EVENT_SCHEMAS`. It runs against the mock in this repository's CI and against the real edge in `loop-orchestrator`'s CI (test tenant, ADR-008). The mock's scenarios remain the fixtures the suite drives (`system-architecture.md` §5).

8. **Change control.** `CODEOWNERS` names the owner for `contracts/**`; the day a separate orchestrator team exists, it is added as a second required approver on the same path. Minor = additive; major = anything else (`contracts.mdc`). The orchestrator declares which tag it serves in `GET /config` (`contractsVersion: "0.2"`), so a mismatch is visible in telemetry.

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function | State | Why it blocks |
|---|---|---|---|---|
| P1 | A named contract signer with authority to sign | Orchestrator | **Met** — the owner signs (Status above) | Item 1 and item 8 need a signature, not a review comment |
| P2 | `pnpm test` green in `LoopShell` (`contracts/schemas/__tests__/fixtures.test.ts`) | Loop Platform | **Met** — owner confirmed, 21 September 2026 | The tag must be a passing state |
| P3 | Decision on repository hosting (GitHub or Azure DevOps) for `loop-orchestrator` | Cloud & AI | Open | Determines where release artifacts are published (item 6) |
| P4 | ADR-007 wire decisions accepted (media type, state spelling, binding) | Orchestrator | Open — ADR-007 is Proposed | Item 5 records them; §9 must not stay open past 0.2 |

### Steps

1. **Done, 21 September 2026.** Review of `contracts/schemas/` against `system-architecture.md` §4, checked against `src-tauri/src/api/mod.rs` and `realtime/webpubsub.rs`. Outcome: every 0.1 shape is implementable. Disagreements were in the prose, and were fixed in `system-architecture.md` the same day (negotiate body, wire envelope, ledger recipient, query defaults, decision-relay rules, expiry wording). One addition joined the 0.2 table: `NegotiateResponse`. Nothing in `contracts/schemas/` changed. The gaps already scheduled for 0.2 (remote config, `pop`, `attention.resolved.decision`) were confirmed and left there.
2. **Done, 21 September 2026.** `contracts/CHANGELOG.md` records Waqas Ahmed, owner, signing for the orchestrator. The `contracts@0.1` tag points at the commit that contains that entry.
3. Add `contracts/schemas/config.ts` (`RemoteConfig`, `AgentRegistryEntry`) and `NegotiateResponse` (in `session.ts` or `ipc.ts`), extend `events.ts` (`pop`, `decision`), extend `dock.ts` (`DockState.remote`), add fixtures for each, update `contracts/fixtures/` and the fixture tests.
4. Add the Rust IPC types and the `remote_config_get` command / `remote_config_changed` event as **stubs that return the build-time defaults**; regenerate `contracts/bindings/bindings.ts`. Behaviour lands in ADR-014.
5. Update the mock: serve `GET /config` from a fixture; publish `attention.created { pop: false }` in `Ctx.ask()`; add the idempotent `POST /ask` behaviour.
6. Write `contracts/scripts/build-dist.ts` (JSON Schema bundle, fixtures, OpenAPI) and wire it to `pnpm contracts:dist`; commit nothing under `contracts/dist/` (generated at tag time).
7. Write `contracts/conformance/` and run it against the mock in CI.
8. Update `system-architecture.md` §4.1 (add `/config`), §4.6 (`pop`, `decision`), §4.8 (shape), §5 (mock now publishes `attention.created { pop: false }`), and close the three §9 items. Bump to v0.2.
9. Owner signs in `CHANGELOG.md`; tag `contracts@0.2`; publish the release artifacts.
10. `CODEOWNERS` entry for `contracts/**` naming the owner (item 8).

### Acceptance

- `contracts@0.1` and `contracts@0.2` tags exist with sign-off names in `CHANGELOG.md`.
- `pnpm contracts:dist` produces a schema bundle that validates every fixture with an independent JSON Schema validator (Ajv in CI), proving the bundle is faithful to the Zod schemas.
- The conformance suite passes against the mock in CI.
- `system-architecture.md` §9 no longer lists the media type, the state spelling or the cross-device question.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Publish the Zod schemas as an npm package for the orchestrator to import | The orchestrator and sub-agents are not TypeScript (ADR-011, ADR-012). A JSON Schema bundle serves every language. |
| OpenAPI as the source of truth, Zod generated from it | Inverts the working setup: the dock's validation, fixtures and Storybook are Zod-first and proven. OpenAPI is generated as an output instead. |
| Protobuf / gRPC for the dock-to-edge contract | JSON over HTTPS is what the Rust client speaks and what the reliable Web PubSub subprotocol carries. A second encoding buys nothing for a dock that validates with Zod. |
| Separate `GET /registry/agents` endpoint | One more poll and one more thing to keep consistent with `disabledAgents[]`. The registry rides in `GET /config`; a dedicated endpoint can be split out later without breaking 0.2 consumers. |
| Keep the silent Attention creation (mock behaviour) as the rule | The Attention cache on the dock would only learn about the item on the next `GET /attention`, so the badge could be wrong for up to `staleTime` after the panel hides. `pop: false` keeps the item flow explicit and the cache correct. |
| Sign off only at 0.2, skipping 0.1 | Delays the first signature until the additive work is done; the orchestrator team would start against an unsigned base. 0.1 is what the UI already proves. |

## Consequences

**Positive**

- The orchestrator team builds against a signed, versioned, language-neutral artifact and can prove conformance in their own CI before the dock ever connects.
- The kill switch and registry stop being prose; they are schemas with fixtures.
- The toast-on-inline-proposal defect that the mock's silence was hiding is closed by design, not by timing.

**Negative and mitigations**

- Two contract releases before any server code. Mitigation: 0.1 is a signature on existing work; 0.2 is small and additive.
- Generated JSON Schema loses some Zod refinements (for example `.min(1)` on strings survives, custom refinements do not). Mitigation: fixtures are the conformance vectors; the Ajv check in CI catches drift.
- The mock gains behaviour it did not have (`/config`, `pop`). Mitigation: it is a dev tool; the changes are small and covered by the conformance suite.

**Follow-ups**

- ADR-014 implements the dock side of `RemoteConfig`, `pop`, `decision`, and `externalHosts`.
- When the first sub-agent adds a card fixture that the six types cannot express, that is a contract major and a renderer PR (`contracts.mdc`), not a 0.x change.

## References

- `.cursor/rules/contracts.mdc` — layout, versioning, sign-off rule.
- `contracts/CHANGELOG.md` — current unreleased 0.1 entry.
- Zod 4 JSON Schema: https://zod.dev/json-schema
- JSON Schema 2020-12: https://json-schema.org/specification
- `system-architecture.md` §4.1 (API edge), §4.6 (events), §4.8 (remote config), §5 (mock correspondence), §9 (open questions).
