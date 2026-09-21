# ADR-007 — A2A wire contract between the orchestrator and sub-agents

| | |
|---|---|
| **Status** | Proposed |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Functions performed: Orchestrator team (A2A client, normalisation) · Loop Platform Team (card mapping). Team names identify the function, not a separate group. |
| **Audience** | Orchestrator team · Sub-agent owners · Cloud & AI Team · Security |
| **Related** | [system-architecture.md](../system-architecture.md) §6, §7, §9 · `contracts/a2a/state-map.ts` · `contracts/schemas/events.ts` · ADR-006 · ADR-008 · ADR-011 · ADR-012 |

## Status

Proposed. Closes the A2A items in `system-architecture.md` §9 (card artifact media type, `A2AState` spelling) and fixes the protocol binding, which §6.2 currently states as "JSON-RPC 2.0 over HTTPS is Loop's default" while A2A v1 and Microsoft Agent Framework's v1 client prefer HTTP+JSON.

## Context

- The dock never speaks A2A. It interprets task states the orchestrator reports, through `contracts/a2a/state-map.ts`. Everything in this ADR is between the orchestrator's workflow runtime and the sub-agents, and its only effect on the dock is that the events the orchestrator emits stay inside `contracts@0.2`.
- A2A v1.0 is stable. It publishes task states as a protobuf-style enum (`TASK_STATE_WORKING`) while `contracts/schemas/events.ts` uses the kebab-case spelling (`working`, `input-required`, `canceled`). The eight values map one-to-one.
- A2A v1 defines three bindings (HTTP+JSON, JSON-RPC, gRPC). Microsoft Agent Framework's A2A packages (ADR-011) default to HTTP+JSON with JSON-RPC fallback. The framework's A2A packages were still preview (.NET) and beta (Python) at the framework's 1.0 release; the protocol itself is not.
- Loop cards must travel inside A2A artifacts. §6.5 proposes a single part with media type `application/vnd.loop.card+json` and shows the card as a serialised JSON string in `text`. Nothing has been agreed.
- Human-in-the-loop depends on two A2A states, `input-required` and `auth-required`, and on the runtime being able to resume a task hours later from a checkpoint. Tasks that can pause must not be tied to an open HTTP request.

## Decision

### Scope and repositories

| Repository | What lands there |
|---|---|
| `loop-orchestrator` | A2A client, state normalisation, artifact-to-card mapping and validation, push-notification callback endpoint, decision relay message builder, Agent Card verification in the registry. |
| `loop-agent-template` (ADR-012) | A2A server hosting, Agent Card generator, card emission helpers, the conformance tests in item 9. |
| `LoopShell` | `system-architecture.md` §6 updated to match; no code. `contracts/` is unchanged by this ADR (the dock contract is ADR-006). |

### Decision items

1. **Binding.** Every sub-agent serves **HTTP+JSON** and **JSON-RPC 2.0**, both listed in `supportedInterfaces[]` with HTTP+JSON first. The runtime sets its preferred bindings explicitly (`HTTP+JSON`, then `JSON-RPC`) rather than relying on a library default. gRPC is not used in the pilot. Content type for JSON-RPC stays `application/a2a+json`. `system-architecture.md` §6.2 is corrected accordingly.

2. **Task-state normalisation.** The orchestrator maps `TASK_STATE_*` to the kebab-case `A2AState` at its A2A boundary, using exactly the table in §6.4. `TASK_STATE_UNSPECIFIED` is a protocol error: the task is failed with a `summary` card, `tone: 'failure'`, and the agent is flagged in telemetry. `contracts/` keeps the kebab-case enum; the dock is untouched.

3. **Card transport.** One card = one artifact = one part. The part's `mediaType` is `application/vnd.loop.card+json` and the card envelope (as defined by `contracts/schemas/cards/`) is carried as structured JSON in the part's data field. A part that carries the same JSON serialised as `text` is accepted as a fallback for SDKs that cannot emit structured parts. The runtime:
   - validates each card against the pinned `contracts@x.y` JSON Schema (ADR-006) before publishing;
   - drops a card that fails validation or whose `type` the agent has not declared (item 6), and logs `agentId`, `cardId`, `taskId` and the validation error at `warn`;
   - never rewrites a card's content; it may only stamp `journeyId` and `taskId` if the agent omitted them.
   `artifactId` is the card's `cardId`. A corrected proposal is the same `cardId` sent again (the dock upserts by `cardId`).

4. **Identifiers.** `contextId` = `journeyId`; A2A task `id` = `taskId`; `referenceTaskIds[]` carries earlier tasks in a sequenced journey (§7). An agent must reject a message whose `contextId` does not match the referenced task (`TASK_STATE_REJECTED`).

5. **Interrupts and resumption.** For any skill that may reach `input-required` or `auth-required`, the runtime sends with `returnImmediately: true` and registers a push-notification config (`CreateTaskPushNotificationConfig`) whose callback is the orchestrator endpoint `POST /a2a/callbacks/{taskId}`. The callback is authenticated twice: a per-task random token in the config, and an Entra bearer issued to the sub-agent's own identity (ADR-008). Streaming (`SendStreamingMessage`) is allowed for query skills that complete in one connection. After an orchestrator restart, tasks are re-established with `GetTask` / `ListTasks` filtered by `contextId`.

6. **Agent Card requirements.** Every sub-agent serves `GET /.well-known/agent-card.json` with:
   - `skills[]` each carrying `id`, `name`, `description`, `tags[]`, at least **five** `examples[]` phrased as users ask, and `outputModes` including `application/vnd.loop.card+json`;
   - the card types a skill may emit declared as tags `loop.card.<type>` (for example `loop.card.record`, `loop.card.confirmation`). The runtime drops anything undeclared (product invariant 3);
   - `capabilities.pushNotifications: true` for any agent with an interrupting skill;
   - `securitySchemes` / `securityRequirements` naming the Entra scope the runtime must present (`Agent.Invoke`, ADR-008);
   - `signatures[]`: a JWS over the card, verified by the registry against the public key pinned at registration (item 8). An unsigned or unverifiable card is not routable.

7. **Decision relay message.** A user decision is an ordinary follow-up `SendMessage` on the same `taskId` + `contextId`, `role: user`, with:
   - `metadata["loop.decision"] = { optionId, attentionId, decidedAt }`;
   - the user's `freeText`, when present, as the message's text part.
   The agent acts on both. Ignoring `freeText` is a conformance failure. `'reject'` is a valid `optionId` and means the agent must not execute; it reports `TASK_STATE_CANCELED` or `TASK_STATE_COMPLETED` with a `summary`.

8. **Registry and trust.** Registration is: publish the card, submit `agentId` + card URL + JWKS URL to the registry, the registry fetches and verifies the card, embeds `skills[]` (ADR-011 triage), and stores the entry in state `shadow`. Host allow-listing is per agent; the runtime refuses to send to a host not in the entry. Re-verification runs daily and on every version change.

9. **Conformance tests for sub-agents** (shipped in `loop-agent-template`, run in every agent's CI):
   - card served at the well-known path, signed, validates against the A2A v1 Agent Card schema;
   - every skill has ≥ 5 examples and at least one `loop.card.*` tag;
   - for each declared card type, a fixture the agent can emit that validates against the pinned `contracts` JSON Schema;
   - a scripted task walks `submitted → working → input-required → (decision) → working → completed` over both bindings;
   - the decision relay message with `freeText` changes the agent's output (the template test asserts the free text is echoed into the resulting card or work notes).

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | ADR-006 `contracts@0.2` tagged (the JSON Schema bundle is what the runtime validates cards against) | Loop Platform Team |
| P2 | ADR-008: an Entra identity per sub-agent and the `Agent.Invoke` scope, so `securityRequirements` and the callback bearer can be specified | Identity |
| P3 | ADR-011 language and A2A package chosen; confirmation of the packages' release status (preview is acceptable for the pilot only with a recorded risk) | Orchestrator team |
| P4 | A2A v1 specification pinned by version in `loop-orchestrator/docs/` | Orchestrator team |

### Steps

1. Correct `system-architecture.md` §6.2 (binding), §6.5 (structured part, `text` fallback), §6.6 (relay metadata), and remove the media-type and spelling items from §9. Bump to v0.2 alongside ADR-006 step 8.
2. In `loop-orchestrator`: implement the state map (`TASK_STATE_*` → `A2AState`) with a unit test for all nine inputs; implement artifact-to-card mapping with the JSON Schema validator and the drop-and-log path.
3. Implement the push-notification callback endpoint and the per-task token store (Cosmos `checkpoints` sidecar or the task's own record, ADR-009).
4. Implement the decision relay message builder; unit-test `metadata["loop.decision"]` and the `freeText` part.
5. Implement Agent Card fetch, JWS verification and host allow-listing in the registry service.
6. In `loop-agent-template`: A2A hosting over both bindings, card generator (tags, examples, signatures), card emission helpers, and the conformance tests of item 9.
7. Run the template's conformance tests against the template's own sample agent in CI; run the orchestrator against the sample agent for the three canonical interactions in §6.6.

### Acceptance

- The orchestrator completes §6.6's three interactions against the template sample agent over HTTP+JSON, and again with HTTP+JSON disabled (JSON-RPC fallback).
- A card with an undeclared type is dropped and logged; a malformed card is dropped and the remaining valid cards render in the dock.
- A task paused in `input-required` survives an orchestrator restart and resumes on the relayed decision (proves item 5 together with ADR-009 checkpoints).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| JSON-RPC as the only binding (current §6.2 text) | Fights the framework default and the A2A v1 direction; agents built with other stacks would still need JSON-RPC. Serving both costs nothing in Agent Framework hosting. |
| gRPC | No consumer in the pilot; adds TLS/HTTP2 ingress requirements to every platform team. |
| Follow the spec's `TASK_STATE_*` enum in `contracts/` and remap in the dock | Puts a change into a signed contract and into Rust and TypeScript for something one server-side function handles. Revisit only if A2A retires the legacy spelling. |
| Card as a `text` part only (current §6.5 example) | Double-encodes JSON and loses schema tooling on the agent side. Kept as an accepted fallback. |
| One artifact carrying several cards as parts | Breaks "one `artifactId` = one `cardId`" and makes partial validation ambiguous. |
| Declare card types in a custom Agent Card field | Non-standard fields are stripped by some SDKs; tags survive every A2A tooling path. |
| Blocking `SendMessage` (default `returnImmediately: false`) for interrupting tasks | Ties an HTTP request to a human decision that may take hours; incompatible with checkpointing. |
| Trusting Agent Cards without signatures | A compromised or spoofed card could route work to a hostile endpoint. Verification is cheap. |

## Consequences

**Positive**

- Platform teams can build a sub-agent from the template and know it is routable before the orchestrator team is involved.
- Cards are validated once, server-side, against the same schema the dock enforces; the dock's "unknown types are dropped" rule becomes a second line, not the first.
- The dock contract is untouched; everything here is behind the API edge.

**Negative and mitigations**

- Requiring two bindings and signatures raises the bar for the first sub-agent. Mitigation: the template provides both, and the conformance tests make the bar visible.
- Framework A2A packages may still be preview at build time. Mitigation: pin, record the risk in ADR-011, and keep the runtime's A2A surface behind one interface so the SDK can be swapped.

**Follow-ups**

- ADR-012 uses this contract for `servicenow-itsm` and the `oracle-fusion` shadow card.
- If A2A publishes a first-class "structured output schema" per skill, revisit item 6's tag convention.

## References

- A2A Protocol v1 specification: https://a2a-protocol.org/latest/specification/
- Microsoft Agent Framework A2A (.NET announcement, v1 bindings and migration table): https://devblogs.microsoft.com/agent-framework/a2a-v1-is-here-cross-platform-agent-communication-in-microsoft-agent-framework-for-net/
- Agent Framework agent-to-agent guidance: https://learn.microsoft.com/agent-framework/journey/agent-to-agent
- `system-architecture.md` §6 (current text this ADR amends), `contracts/a2a/state-map.ts`.
