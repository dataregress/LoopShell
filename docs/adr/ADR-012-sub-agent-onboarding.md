# ADR-012 — Sub-agent onboarding framework and the first sub-agent: `servicenow-itsm`

| | |
|---|---|
| **Status** | Proposed |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Functions performed: Loop Platform Team (framework) · ServiceNow platform team (first agent) · Cloud & AI Team (MCP Gateway). Team names identify the function, not a separate group. |
| **Audience** | Sub-agent owners · Orchestrator team · Cloud & AI Team · Security · ServiceNow platform team |
| **Related** | [design-brief.md](../design-brief.md) §3.2, §5, §6 · [system-architecture.md](../system-architecture.md) §2, §6 · ADR-006 · ADR-007 · ADR-008 · ADR-011 · ADR-013 · ADR-015 |

## Status

Proposed. `design-brief.md` references a "Loop Agent Onboarding Framework (`loop-agent-onboarding-framework.md`)" with five parts — card, routing corpus, isolation, three contracts, staged pipeline — and that document does not exist. This ADR decides the framework's content and applies it to the pilot's vertical slice, the ServiceNow ITSM agent (`design-brief.md` §5). The framework document is produced from this ADR as a follow-up.

## Context

- The orchestrator contains no platform-specific code; every platform is reached through a sub-agent over A2A, and every sub-agent reaches its platform through MCP servers behind the MCP Gateway (`system-architecture.md` §3). Onboarding an agent must require no orchestrator or dock change (`design-brief.md` §3.2).
- Without a real sub-agent the orchestrator can only produce the "no agent covers this" summary. `servicenow-itsm` drives two of the three canonical interactions (`trackIncident` query, `raiseIncident` action with confirmation) and, with `oracle-fusion` registered as a shadow card, the third (`orderLaptops` disambiguation).
- The mock's scenarios (`raiseIncident`, `trackIncident`, `orderLaptops`, `cantHelp`, `failure`) and the fixtures in `contracts/fixtures/` define the cards the dock renders for these flows; the real agent's cards must validate against the same schemas.
- The MCP Gateway is listed in §2 as owned by the Cloud & AI Team with "MCP transport, allow-listing, tool logging". Whether an enterprise gateway that meets those requirements already exists is not recorded.
- `contracts/registry/agents.ts` names the pilot agents: `servicenow-itsm`, `oracle-fusion`, `m365`, `snowflake`, `outsystems`. Only the first is built here.

## Decision

### Scope and repositories

| Repository | Function | What lands there |
|---|---|---|
| `loop-agent-template` (new) | Loop Platform Team with the Orchestrator team | .NET (per ADR-011) template: A2A hosting over both bindings, Agent Card generator and signer, card emission helpers validated against the pinned `contracts` JSON Schema, MCP client through the Gateway, Entra token validation and OBO, telemetry (ADR-013), the conformance tests of ADR-007 item 9, Dockerfile and pipeline. Includes a sample agent (`sample-echo`) used by the orchestrator's integration tests. |
| `loop-agent-servicenow` (new) | ServiceNow platform team | The `servicenow-itsm` sub-agent and its MCP server(s) as two deployables in one repository; created from the template. |
| `loop-mcp-gateway` (existing or new) | Cloud & AI Team | The Gateway, if the enterprise one cannot meet item 4. Out of scope here beyond requirements. |
| `loop-infra` | Cloud & AI Team | Container app, managed identity and role assignments per agent; Gateway allow-list entries. |
| `LoopShell` | Loop Platform Team | `docs/loop-agent-onboarding-framework.md` (follow-up); the `oracle-fusion` and `servicenow-itsm` registry defaults already exist. No dock code. |

### Decision items

1. **The five parts of the framework, decided.**

   | Part | Decision |
   |---|---|
   | **Card** | A2A Agent Card per ADR-007 item 6: signed, both bindings, skills with ≥ 5 examples each, `loop.card.<type>` tags, `pushNotifications: true` if any skill can interrupt, `securityRequirements` naming `Agent.Invoke`. |
   | **Routing corpus** | The card's `skills[]` are the corpus. The registry embeds `description + tags + examples` (ADR-011 item 5). An agent tunes routing by editing examples, not by asking the orchestrator team for prompt changes. |
   | **Isolation** | One deployable, one Entra app and managed identity, one set of MCP servers per agent (ADR-008 item 1). Agents never call each other or the Ledger; they see only the task they are given. Every MCP tool call goes through the Gateway with the agent's identity; allow-lists are per agent. |
   | **Three contracts** | (a) **A2A contract** with the orchestrator — ADR-007. (b) **Card contract** with the dock — the pinned `contracts@x.y` JSON Schema (ADR-006); an agent picks from the six types and never sends layout. (c) **MCP contract** with the Gateway — item 4. Conformance tests exist for all three in the template. |
   | **Staged pipeline** | `draft` (repo only) → `registered` (card verified, state `shadow`: retrievable by triage, never handed work) → `enabled` (handoffs allowed for the pilot group) → `disabled` (kill switch via `RemoteConfig.disabledAgents[]` or registry state). Promotion `shadow → enabled` requires: template conformance green, ADR-011 triage gate green with the agent's skills included, a security sign-off on the agent's scopes and tools, and a demo of its canonical interaction against a `dev` dock. |

2. **`servicenow-itsm` scope for the pilot.**

   | Skill id | Kind | Cards | Tools (MCP) | Notes |
   |---|---|---|---|---|
   | `incident.status` | Query | `record`, `link` | `get_incident` | "Status of INC0012345". Read-only, no Attention, no Ledger row. |
   | `incident.create` | Action | `confirmation` → `record`, `link`; `summary` on failure | `create_incident`, `search_ci` (for the affected service) | "Raise a P2 for the payments dashboard outage". Drafts the incident, returns a `confirmation` with evidence (matched CI, priority rationale), executes only on the accepted decision, honours `freeText` by appending it to work notes. Idempotent per `taskId` (ServiceNow correlation id). |
   | `request.order_hardware` | Action | `choice` (quantity/cost centre), `confirmation` → `record` | `search_catalog`, `order_catalog_item` | "Order 20 laptops". Exists so triage must disambiguate against `oracle-fusion`. |

   Examples per skill: at least five, written the way users ask, including the `design-brief.md` §6 phrasings.

3. **`oracle-fusion` is registered as a shadow card only.** Its Agent Card lists `procurement.order_hardware` and `expense.approve` skills with examples, is signed, and points at a placeholder endpoint that returns `TASK_STATE_REJECTED`. Triage can produce the `choice` card for "Order 20 laptops"; a user who picks Oracle Fusion gets the neutral "not available yet" summary (ADR-011 item 5). The Oracle Fusion agent itself is a later onboarding.

4. **MCP Gateway requirements** (Cloud & AI Team confirms the enterprise gateway meets them or ADR-016 is raised):
   - MCP Streamable HTTP transport; Entra authentication of the calling agent (its managed identity or app token), no shared keys;
   - per-agent tool allow-list (agent identity → server → tool names); a call outside the list is refused and logged;
   - every call logged with `journeyId`, `taskId`, `agentId`, tool name, duration, outcome — never tool arguments or results above `debug` (they may contain record data);
   - `traceparent` propagation to the MCP server (ADR-013);
   - rate limits per agent; timeouts (30 s default); health endpoint.
   Agents pass `journeyId` and `taskId` as MCP request metadata so the Gateway can log them.

5. **ServiceNow MCP server** (in `loop-agent-servicenow`): tools of item 2 over the ServiceNow Table and Service Catalog REST APIs against a **sub-production instance** for `dev` and the pilot's designated instance for `pilot`. Authentication preference order: (a) ServiceNow configured to accept Entra-issued tokens (OIDC provider) so the agent's OBO token acts as the user; (b) a ServiceNow service account with the approving user stamped in the incident's `caller_id` / work notes **and** in the Ledger `actor` (`design-brief.md` §3.4). The choice is recorded in the agent's README and in the Ledger row's `summary` never shows the service account.

6. **Card content rules for the first agent** (apply to every agent): a `record` always carries a `link` back to the system of record (product invariant 8); a `confirmation` names the irreversible effect in its title and lists evidence; the `recommended` option is the safe one; failure `summary` cards say what the user can do next and link to the platform; no free-form layout, no HTML, no markdown beyond plain text.

7. **Registration procedure** (the runbook the framework document will carry): create the Entra app and managed identity (ADR-008 scripts, `agent` kind); deploy the agent to Container Apps in the `loop-agents` environment; submit `agentId`, card URL and JWKS URL to the registry admin endpoint; the registry verifies and embeds; state `shadow`; run the promotion checklist of item 1; set `enabled`; add the agent's system-of-record host to `RemoteConfig.externalHosts`.

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | ADR-006 `contracts@0.2` (card JSON Schema for validation) | Loop Platform Team |
| P2 | ADR-007 accepted (binding, card transport, tags, signatures) | Orchestrator team |
| P3 | ADR-008 `agent` registration kind and scripts; a ServiceNow instance accepting Entra tokens, or approval for the service-account path | Identity / ServiceNow team |
| P4 | ADR-011 orchestrator `dev` running with registry admin endpoint | Orchestrator team |
| P5 | MCP Gateway meeting item 4, or ADR-016 accepted | Cloud & AI Team |
| P6 | ServiceNow sub-production instance with test data mirroring the demo scenarios (an open incident `INC0012345`-like record, a "payments dashboard" CI, a laptop catalog item) | ServiceNow team |
| P7 | A named ServiceNow platform-team engineer for the pilot | ServiceNow team |

### Steps

1. Build `loop-agent-template` (Loop Platform Team + Orchestrator team): hosting, card generator and signer, card helpers with schema validation, MCP client via Gateway, identity, telemetry, conformance tests, `sample-echo` agent. Pipeline runs the conformance tests on every push.
2. Orchestrator integration: register `sample-echo` in `dev`; ADR-011 step 7 uses it.
3. Create `loop-agent-servicenow` from the template. Implement the MCP server (item 5) and the three skills (item 2). Fixtures for every card the agent emits, validated in CI.
4. Register in `dev` as `shadow`; run the triage gate with its skills; fix examples until the demo asks route correctly.
5. Register the `oracle-fusion` shadow card (item 3).
6. Promotion checklist: conformance, triage gate, security sign-off of scopes and tools (Gateway allow-list reviewed), demo of `trackIncident`, `raiseIncident` (with `freeText`) and `orderLaptops` against a `dev` dock. Set `enabled` in `dev`.
7. Write `docs/loop-agent-onboarding-framework.md` in `LoopShell` from items 1, 4, 6 and 7; link from `design-brief.md` (the link already exists).
8. Repeat registration for `pilot`; add the ServiceNow host to `externalHosts`.

### Acceptance

- `servicenow-itsm` passes the template conformance tests and is `enabled` in `pilot`.
- From a real dock: "Status of INC…" returns a `record` with a working `link`; "Raise a P2…" returns a `confirmation`, the decision with free text creates the incident with the free text in work notes, Recent shows `proposed → confirmed → executed`; "Order 20 laptops" returns the orchestrator's `choice` card.
- A tool outside the allow-list is refused by the Gateway and surfaces as a failure `summary` without retry.
- Every incident created shows the user, not a service account, in the Ledger.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Build `servicenow-itsm` directly inside the orchestrator for speed | Violates "no platform-specific code in the orchestrator" and would make the first agent the only one that never needed the framework. |
| Skip the shadow state; enable agents once deployed | The `orderLaptops` demo needs a second candidate before Oracle Fusion exists, and triage regressions would only be found in production. |
| Direct MCP server calls without a Gateway | No central allow-list or tool logging; a compromised agent could reach any server. |
| A Python template alongside the .NET one now | Two templates to keep conformant before the first agent exists. Add later behind the same tests if a platform team needs it. |
| Service account for ServiceNow as the default | Loses per-user audit in the platform; kept as the fallback with mandatory actor stamping. |
| One repository per MCP server, separate from the agent | Extra coordination for a pilot where one team owns both; isolation is by deployment and identity, not repository. |

## Consequences

**Positive**

- Platform teams onboard with a template and a checklist; the orchestrator and dock are untouched.
- The three canonical interactions are exercised by real systems before the pilot.
- Card discipline is enforced by tests, not review.

**Negative and mitigations**

- The first agent carries the cost of finishing the template. Mitigation: the Loop Platform Team builds the template; the ServiceNow team builds only the skills and tools.
- Dependence on the Gateway's readiness. Mitigation: item 4 is a prerequisite with a named fallback ADR.

**Follow-ups**

- ADR-016 (MCP Gateway) if the enterprise gateway cannot meet item 4.
- Oracle Fusion, Microsoft 365, Snowflake, OutSystems agents follow the runbook; each is a registration, not an ADR.

## References

- `design-brief.md` §3.2 (extension), §5 (vertical slice), §6 (scenarios).
- `system-architecture.md` §6 (A2A), §8 (failure modes).
- A2A Protocol: https://a2a-protocol.org/latest/specification/
- Model Context Protocol: https://modelcontextprotocol.io/specification/latest
- ServiceNow REST APIs (Table, Service Catalog) and OAuth with external OIDC provider: https://developer.servicenow.com/dev.do#!/reference/api/latest/rest
