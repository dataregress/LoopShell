# ADR-010 — Real-time delivery: Azure Web PubSub hub, negotiate and the event publisher

| | |
|---|---|
| **Status** | Proposed |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Functions performed: Cloud & AI Team (hub, network) · Orchestrator team (negotiate, publisher). Team names identify the function, not a separate group. |
| **Audience** | Orchestrator team · Cloud & AI Team · Endpoint engineering · Loop Platform Team |
| **Related** | [system-architecture.md](../system-architecture.md) §4.6 · [shell-architecture.md](../shell-architecture.md) §6.2 · `src-tauri/src/realtime/webpubsub.rs` · `contracts/schemas/events.ts` · ADR-006 · ADR-008 · ADR-009 · ADR-011 · ADR-014 |

## Status

Proposed. The dock's client side is implemented and fixed (`realtime/webpubsub.rs`); this ADR specifies the service and server side it needs, and the one fleet-network question that can make the client fail silently.

## Context

- The dock negotiates through the orchestrator (`GET /negotiate` → `{ url }`), connects with the `json.reliable.webpubsub.azure.v1` subprotocol, **sends `joinGroup user:<userId>` itself**, acks every `message` frame with `sequenceAck`, dedupes on `eventId` with a 1,000-entry ring buffer, reconnects with `awps_connection_id` / `awps_reconnection_token`, heartbeats every 20 s, and on `offline → online` invalidates every query so missed events are recovered by refetch (`src/shell/useShellEvents.ts`).
- If the client's `joinGroup` is refused, the dock only logs a warning: it reports Online and receives nothing. Azure Web PubSub only honours a client `joinGroup` when the client access token carries the `webpubsub.joinLeaveGroup.<group>` role. Nothing in the mock exercises this because the mock acks every join.
- The dock reads only `url` from the negotiate response; reconnection uses the token from the service's `system` frame.
- The mock publishes frames with `from: 'group'`, `group: 'user:u-1001'`, `dataType: 'json'`, `data: WireEvent`. The dock ignores `from` and `group` and parses `data` as `WireEvent { eventId, type, payload }`.
- ADR-009 decides that events are produced by a change-feed processor with `eventId` derived from stored state, so replay after a publisher restart carries the same id.
- The fleet may egress through a proxy. `reqwest` in the dock is built with `system-proxy`, but `tokio-tungstenite` connects directly; a proxy-only network would break realtime while HTTP works.

## Decision

### Scope and repositories

| Repository | What lands there |
|---|---|
| `loop-infra` | Bicep: Web PubSub resource, hub, identity-based auth, diagnostics, alerts. |
| `loop-orchestrator` | `GET /negotiate` implementation; the publisher (consumes ADR-009's change-feed events, sends to groups); health metrics. |
| `LoopShell` | No protocol change. Two follow-ups scheduled under ADR-014: treat a refused `joinGroup` as a connection failure, and decide on proxy support for the WebSocket. |

### Decision items

1. **Resource.** Azure Web PubSub, **Standard** tier, one unit for the pilot (1,000 concurrent connections, 1M messages/unit/day), hub name `loop`, `disableLocalAuth: true` (server SDK authenticates with the orchestrator's managed identity; no access keys), public network access enabled for client connections (docks are on user devices; the server-side data plane can use a private endpoint where the SKU allows). Diagnostics (connectivity, messaging) to Log Analytics (ADR-013). One resource per environment (`dev`, `pilot`).

2. **Negotiate.** `GET /negotiate` on the API edge, bearer required (ADR-008). The edge mints a client access URL with the service SDK using: `userId` = the caller's `oid`; `roles` = `["webpubsub.joinLeaveGroup.user:<oid>"]`; `groups` = `["user:<oid>"]` (the service adds the connection to the group at connect time, so delivery does not depend on the client's join succeeding); expiry 60 minutes (checked at connect only; an established connection is not cut at expiry). Response: `{ url }`. No `reconnectionToken` in the body.

3. **Group and identity.** One group per user, `user:<oid>`, matching ADR-008 item 3. No other groups in the pilot. The `userId` embedded in the token equals the group suffix, which also enables `sendToUser` as a fallback delivery path without protocol change.

4. **Publisher.** A hosted service in the orchestrator receives events from the ADR-009 change-feed processor and calls `SendToGroup("user:<oid>", frame)` for each recipient, where `frame` is the JSON `WireEvent { eventId, type, payload }` exactly as `contracts/schemas/events.ts` defines it (`type` in `WireEventName`, payload validated against the matching schema before send; a payload that fails validation is logged at `error` and not sent — a bug in the orchestrator must never reach the dock as a malformed frame). Sends are idempotent from the dock's point of view because `eventId` is stable (ADR-009 item 6). Recipients who are not connected simply miss the frame; they recover on the next `GET /attention` / `GET /ledger` / `GET /journey/{id}`, which the dock performs on reconnect.

5. **Reliability semantics that hold, and what does not.** Within the service's reconnection window the reliable subprotocol replays unacked messages to a reconnected connection; the dock's `sequenceAck` and dedupe make this safe. Beyond the window the connection is new, nothing is replayed by the service, and the dock's refetch on `offline → online` is the recovery path. There is therefore no server-side "replay the last N events" store; the ADR-009 stores are the state of record and the dock reads them.

6. **No upstream event handlers in the pilot.** The dock sends only `joinGroup` and `sequenceAck`; there are no client-to-server messages to handle. `connect` / `disconnect` event handlers are not configured. Presence, typing and client-originated messages are out of scope.

7. **Fleet network requirements** (Endpoint engineering, before any pilot device): outbound `wss://<resource>.webpubsub.azure.com:443` and `https://<api host>:443` allowed directly or through a proxy that supports WebSocket upgrade. If egress is proxy-only, ADR-014 adds proxy support to `realtime/` (HTTP CONNECT via the system proxy) before rollout; until then realtime would show `offline` on those devices while HTTP works.

8. **Dock hardening scheduled under ADR-014.** A `joinGroup` ack with `success: false` is treated as a connection failure (reconnect with backoff, `connectivity_changed` to `reconnecting`) instead of a warning. This turns a silent misconfiguration in item 2 into a visible state.

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | ADR-008: the orchestrator's managed identity, assigned `Web PubSub Service Owner` on the resource | Identity / Cloud & AI Team |
| P2 | ADR-009 change-feed processor delivering events with stable `eventId` | Orchestrator team |
| P3 | ADR-011 hosting: the orchestrator runs somewhere that can hold long-lived outbound calls to the service | Cloud & AI Team |
| P4 | Endpoint engineering confirmation of the fleet egress path (item 7) | Endpoint engineering |
| P5 | ADR-006 `contracts@0.2` for `pop` and `decision` in the payloads | Loop Platform Team |

### Steps

1. Bicep module `webpubsub.bicep` in `loop-infra`: resource, hub `loop`, `disableLocalAuth`, role assignment for the orchestrator identity, diagnostics, alerts (connection count near the unit limit, server errors, outbound message failures). Deploy `dev`.
2. Implement `GET /negotiate` (item 2) in `loop-orchestrator`; unit test the token's claims (`roles`, `groups`, `userId`, expiry).
3. Implement the publisher (item 4) with pre-send validation; integration test with the service SDK's test client joining `user:<oid>` and asserting frame shape.
4. Point a `dev` dock at the `dev` edge; verify the `system` frame arrives, `joinGroup` is acked with `success: true`, and a `ledger.appended` produced by an ADR-009 write reaches the UI.
5. Failure drills: (a) kill the publisher mid-stream and restart — no duplicate visible event, no missing event; (b) drop the network on the client for 20 s — reconnection with the token, replayed frames deduped; (c) drop for 10 minutes — new connection, dock refetches, state consistent; (d) revoke the `joinLeaveGroup` role and confirm the dock (after ADR-014 item 8) reports `reconnecting`, not Online.
6. Load test: 200 simulated reliable-subprotocol clients, 1 event/s each for 10 minutes; record message latency p95 and unit utilisation.
7. Endpoint engineering runs the item 7 check on a standard-image device inside the corporate network and on VPN; record the result in ADR-014.
8. Deploy `pilot`.

### Acceptance

- The conformance suite's realtime checks (ADR-006 item 7) pass against `dev`: every frame validates as `WireEvent`, every payload validates against `IPC_EVENT_SCHEMAS`.
- Reconnect after wake reaches `online` in under 5 s (dock budget, `shell-architecture.md` §8) on the test devices.
- The five failure drills behave as described.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Azure SignalR Service | The dock already implements the Web PubSub reliable subprotocol; SignalR would need a second client protocol in Rust and a hub abstraction the orchestrator does not need. |
| WebSocket endpoint on the API edge | Loop would own connection scale-out, replay and reconnection tokens that the service provides. |
| Server-Sent Events or long polling | Banned by `loop-stack-locked.mdc` for the webview and a step down in reliability for Rust; no replay. |
| Access keys instead of managed identity | Secrets in the orchestrator's configuration; `disableLocalAuth` removes the class of problem. |
| Rely on the client's `joinGroup` alone (no `groups` in the token) | Works only if the role is present and the join is processed before the first event; `groups` at connect removes both races. |
| A server-side event replay store (last N events per user) | Duplicates the state of record; the dock's refetch on reconnect already recovers, and ADR-009's stores are queryable. |
| Event handlers for presence | No product need; adds an inbound webhook surface to the edge. |

## Consequences

**Positive**

- The dock's client works unchanged against the real service; the only client changes are hardening.
- No secrets, no custom replay logic, one group per user, one publisher path fed by the state of record.
- Misconfiguration of roles becomes visible in the dock's connectivity state instead of a silent outage.

**Negative and mitigations**

- Standard tier is a fixed monthly cost per unit. Mitigation: one unit covers the pilot; alerts before the connection limit.
- Proxy-only fleets are not supported by the current client. Mitigation: item 7 is a prerequisite check; ADR-014 carries the fix if needed.
- Clients that are offline for longer than the reconnection window depend on refetch, not push. Mitigation: that is already the dock's behaviour and the stores are the source of truth.

**Follow-ups**

- ADR-014 items: `joinGroup` failure handling; WebSocket proxy support if required by item 7.
- Revisit Premium tier (availability zones) before GA.

## References

- Azure Web PubSub overview: https://learn.microsoft.com/azure/azure-web-pubsub/overview
- Reliable JSON subprotocol: https://learn.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol
- Client access token, roles and initial groups: https://learn.microsoft.com/azure/azure-web-pubsub/concept-client-protocols
- Identity-based authentication for the server SDK: https://learn.microsoft.com/azure/azure-web-pubsub/howto-authorize-from-managed-identity
- `shell-architecture.md` §6.2 (client sequence), §8 (reconnect budget).
