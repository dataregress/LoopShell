# ADR-011 — Orchestrator runtime and hosting: Microsoft Agent Framework (.NET) on Azure Container Apps

| | |
|---|---|
| **Status** | Proposed |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Functions performed: Orchestrator team (runtime, API edge, triage) · Cloud & AI Team (hosting, Foundry). Team names identify the function, not a separate group. |
| **Audience** | Orchestrator team · Cloud & AI Team · Security · Loop Platform Team |
| **Related** | [system-architecture.md](../system-architecture.md) §2–§4, §7, §8 · [design-brief.md](../design-brief.md) §3.2 · ADR-006 · ADR-007 · ADR-008 · ADR-009 · ADR-010 · ADR-012 · ADR-013 |

## Status

Proposed. `system-architecture.md` fixes the orchestrator's behaviour and names Microsoft Agent Framework as the workflow runtime. This ADR fixes what is still open before code can start: language and packages, hosting, how the six orchestrator components in §2 are deployed, how triage is built and measured, and the repository. It is the build ADR for `loop-orchestrator`; ADR-006 through ADR-010 are its inputs.

## Context

- Microsoft Agent Framework reached 1.0 (GA) for .NET and Python in April 2026. Workflows, checkpointing and the orchestration patterns Loop needs (handoff, sequential) are stable in both. A2A integration packages were preview (.NET) and beta (Python) at that release. Cosmos DB checkpoint stores exist for both lines (ADR-009).
- The API edge must validate Entra v2 tokens and perform On-Behalf-Of for every sub-agent call (ADR-008). Token validation and OBO libraries differ markedly in maturity between ecosystems.
- Sub-agents are built by platform teams from a template (ADR-012). Orchestrator and template should be the same stack so one team can help another and one set of conformance tests covers both.
- The dock's contract is frozen (ADR-006). The eight endpoints, `/config`, the wire events and the failure table in §8 are inputs, not design space.
- Triage accuracy is an open question in §9 ("how routing accuracy is measured as agents are onboarded, and what the regression bar is").
- No repository, CI pipeline or infrastructure code exists yet for the server side.

## Decision

### Scope and repositories

| Repository | What lands there |
|---|---|
| `loop-orchestrator` (new) | Everything in items 3–7: one ASP.NET Core application with hosted services, the triage service, evaluation set, integration tests, Dockerfile, CI. Pins a `contracts@x.y` tag. |
| `loop-infra` (new) | Bicep for the Container Apps environment, container registry, Key Vault, Foundry project and model deployments, Log Analytics; consumes ADR-008/009/010 modules. Environment parameter files `dev`, `pilot`. |
| `LoopShell` | No code. `system-architecture.md` §2 gains the hosting and language columns after acceptance. |

### Decision items

1. **Language and framework: .NET 10 (LTS), C#, ASP.NET Core, Microsoft Agent Framework for .NET.** Reasons in this order: `Microsoft.Identity.Web` gives token validation and OBO as configuration rather than code, and OBO is on every request path; Agent Framework's A2A v1 client and hosting are available in .NET with the handoff builder (`AgentWorkflowBuilder.CreateHandoffBuilderWith`); the sub-agent template (ADR-012) uses the same stack, so platform teams get hosting, Agent Card generation and conformance tests from one codebase. The Python line is equivalent in workflow capability and is the accepted alternative **if** the Orchestrator team is Python-first — but the choice is made once, for orchestrator and template together, and recorded here.

   Package pins (exact versions in the repo; the categories are fixed): `Microsoft.Agents.AI`, `Microsoft.Agents.AI.Workflows`, `Microsoft.Agents.AI.CosmosNoSql` (preview — recorded risk), the A2A client/hosting packages (preview — recorded risk), `Microsoft.Identity.Web`, `Microsoft.Azure.Cosmos`, `Azure.Messaging.WebPubSub`, `Azure.AI.OpenAI` (Foundry), `Azure.Monitor.OpenTelemetry.AspNetCore`, `Azure.Identity`.

2. **Hosting: Azure Container Apps.** One Container Apps environment per stage (`dev`, `pilot`) in a VNet, with private endpoints to Cosmos DB and Key Vault. One container app `loop-orchestrator`, external HTTPS ingress with a managed certificate on `api.loop.<domain>`, min replicas 1, max 3, user-assigned managed identity (ADR-008). Images built in CI and pushed to Azure Container Registry; deploy by revision with a single-revision mode for the pilot. A Container Apps **job** runs the nightly Ledger export (ADR-009 item 8).

3. **One deployable, several roles.** The six components in `system-architecture.md` §2 run as one ASP.NET Core process for the pilot:

   | Component (§2) | Implementation |
   |---|---|
   | API edge | Minimal API endpoints: the eight of §4.1, `GET /config` (ADR-006), `GET /negotiate` (ADR-010), `POST /a2a/callbacks/{taskId}` (ADR-007), `/health` (liveness) and `/ready` (readiness: Cosmos, Web PubSub, Foundry reachable). Token validation middleware (ADR-008). Every response sets `x-correlation-id` (ADR-013). |
   | Triage | `ITriageService` (item 5). |
   | Workflow runtime | Agent Framework workflows: handoff for single-platform asks, sequential for multi-platform (§4.3, §7). `CheckpointManager` over the Cosmos checkpoint store; a checkpoint is taken at every `input-required` / `auth-required` before the Attention item is written (ADR-009 item 7). Runs are resumed from any replica by run id stored on the journey. |
   | Decision relay | `POST /attention/{id}/decide` → ADR-009 item 4 conditional replace → Ledger `confirmed` → resume the checkpointed run with the ADR-007 relay message. |
   | Ledger writer | The only code path that writes `ledger`; `confirmed` rows are written here and nowhere else (§4.5). |
   | Event fan-out | ADR-009 change-feed processor + ADR-010 publisher, as hosted services. Leases make multiple replicas safe. |
   | Attention expiry | Hosted service sweep (ADR-009 item 4). |
   | Registry | `registry` / `registrySkills` repositories, Agent Card verification (ADR-007 item 8), embedding refresh on registration. |

   Splitting into separate apps (edge vs. worker) is a deployment change, not a code change, because every role is a hosted service behind an interface.

4. **Journey and task orchestration rules** (from §4, restated as implementation constraints): `POST /ask` returns `{ journeyId, taskId }` after writing `asks` and the first `journeyRevisions` item (`submitted`), then triage and the workflow run asynchronously; every state change writes a `journeyRevisions` item before anything else observes it; `agentId` is set on the `working` revision so the handoff chip appears immediately (product invariant 2); the orchestrator authors only `choice` cards (`agentId: loop-orchestrator`) and `summary` cards for "no agent" and failure copy; a step that fails stops a sequenced journey (§7).

5. **Triage.** Embedding retrieval over `registrySkills` (ADR-009), then a constrained LLM choice:
   - **Embeddings**: one Foundry deployment of a current text-embedding model (for example `text-embedding-3-large`); skills embedded on registration from `description + tags + examples`; the ask embedded per request.
   - **Retrieval**: top-k (k = 5) by cosine over agents in state `enabled` or `shadow`, excluding `disabledAgents[]`; a similarity floor below which the result is "none" without calling the LLM.
   - **Choice**: one chat-model deployment with structured outputs; the prompt receives only the k candidates (`skillId`, `name`, `description`, two examples each) and returns `{ decision: 'one' | 'several' | 'none', skillIds: string[], multiPlatform: boolean }`. `several` → `choice` card; `none` → neutral `summary` and an `asks` row with `routedTo: null`; `multiPlatform` → sequential workflow. The LLM never sees agent endpoints, tokens or user identity beyond the ask text.
   - **Evaluation set**: `triage/eval/*.jsonl` in the repository, seeded from the demo asks in `design-brief.md` §6 and each Agent Card's `examples[]`, plus 10 paraphrases per skill and 20 out-of-scope asks. CI computes routing accuracy, "none" precision and disambiguation recall. **Gate: ≥ 95 % top-1 accuracy on the set and no regression > 1 point when a new agent's skills are added**; a failing gate blocks moving an agent from `shadow` to `enabled`. This closes the §9 triage-evaluation question.
   - **Shadow agents** are retrieved and may appear in a `choice` card, but a handoff to a shadow agent returns a neutral `summary` ("The Oracle Fusion agent is not available yet") and no A2A call is made (ADR-012).

6. **Configuration and secrets.** No secrets in the image or repository. Managed identity for Cosmos, Web PubSub, Foundry and Key Vault. The few settings (`tenantId`, app ids, Cosmos endpoint, Web PubSub endpoint, Foundry endpoint and deployment names, `contractsVersion`) are Container Apps environment variables set by Bicep from ADR-008 values. `RemoteConfig` (`config` container) is edited through a protected admin endpoint `PUT /admin/config` requiring an app role `Loop.Admin` held by a small ops group; every change is logged with the caller's `oid`.

7. **Failure semantics** implement `system-architecture.md` §8 exactly: sub-agent timeout (A2A call timeout 30 s for query skills; interrupting skills use push notifications, so no request-scoped timeout) → `failed` row + failure `summary` with a `link`; card validation failure → drop and log, `failed` only if nothing valid remains; Ledger write failure → the action is not announced; Web PubSub outage → writes continue, publication resumes from the change feed; MCP denial reported by the agent → `failed`, no retry offered.

8. **Repository layout** (`loop-orchestrator`):

   ```
   src/Loop.Orchestrator/            # ASP.NET Core host, endpoints, hosted services
   src/Loop.Orchestrator.Data/       # Cosmos repositories, cursor codec (ADR-009)
   src/Loop.Orchestrator.Triage/     # embeddings, retrieval, choice prompt
   src/Loop.Orchestrator.A2A/        # client, state map, artifact-card mapping (ADR-007)
   src/Loop.Orchestrator.Contracts/  # types generated from the pinned contracts JSON Schema (ADR-006)
   tests/Unit/  tests/Integration/  tests/Conformance/   # Conformance = ADR-006 runner against a running instance
   triage/eval/                      # evaluation set and scorer
   deploy/                           # Dockerfile, container app manifest fragments
   docker-compose.yml                # Cosmos emulator; points at dev Web PubSub and Foundry
   ```

9. **CI/CD.** Build, unit tests, `dotnet format`, dependency audit, contracts type generation from the pinned tag, container build and push, deploy to `dev`, then integration tests, the ADR-006 conformance suite, the ADR-009 append-only gate and the triage gate against `dev`. Promotion to `pilot` is a manual approval. A2A conformance of the template sample agent (ADR-007 item 9) runs in the template's pipeline, not here.

10. **Security review scope.** Token validation and OBO (ADR-008), admin endpoint, prompt-injection posture of triage (the ask text reaches an LLM; the LLM's output is a constrained enum, never an instruction), logging redaction (card bodies, `freeText`, UPNs never above `debug`, ADR-013), egress rules (Foundry, Cosmos, Web PubSub, sub-agent hosts from the registry allow-list only).

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | ADR-006 `contracts@0.2` tagged and published | Loop Platform Team |
| P2 | ADR-007 accepted; A2A package status confirmed and recorded | Orchestrator team |
| P3 | ADR-008 `dev` registrations and values; managed identity for the orchestrator | Identity / Cloud & AI Team |
| P4 | ADR-009 `dev` Cosmos account deployed | Cloud & AI Team |
| P5 | ADR-010 `dev` Web PubSub deployed | Cloud & AI Team |
| P6 | Azure subscription, resource groups, naming, VNet ranges; Container Apps environment; ACR; Key Vault; Log Analytics (ADR-013) | Cloud & AI Team |
| P7 | Foundry project with quota for one embedding and one chat deployment in the chosen region | Cloud & AI Team |
| P8 | DNS name `api.loop.<domain>` and certificate path (managed certificate or corporate CA) | Cloud & AI Team / Security |
| P9 | ADR-012's template sample agent available for integration tests (can be built in parallel; needed by step 7) | Platform team / Orchestrator team |

### Steps

1. Create `loop-orchestrator` with the layout in item 8; pipeline skeleton (build, test, container, deploy `dev`).
2. Generate contract types from `contracts@0.2`; implement the read endpoints first — `GET /session`, `GET /config`, `GET /attention`, `GET /ledger`, `GET /journey/{id}`, `GET /negotiate` — over ADR-009 repositories seeded from the contracts fixtures. Point a `dev` dock at it (ADR-014 dev build): the panel renders Attention and Recent from real storage before any workflow exists.
3. Implement `POST /ask` idempotency, `journeyRevisions` writes, the change-feed publisher and Web PubSub send; the dock sees `journey.updated` for a stub workflow.
4. Implement triage (item 5) with the evaluation set and the CI gate; register the template sample agent and `oracle-fusion` (shadow) cards.
5. Implement the workflow runtime: handoff pattern, checkpoint at interrupt, Attention item creation with `pop` (ADR-006 item 4), decision relay and resume, Ledger rows (`proposed`, `confirmed`, `executed`, `failed`, `cancelled`, `expired`), cancellation.
6. Implement the sequential pattern for multi-platform asks with `referenceTaskIds`.
7. Run the three canonical interactions of `system-architecture.md` §6.6 against the template sample agent, then against `servicenow-itsm` (ADR-012).
8. Failure-table tests for every row of §8; redeploy-mid-journey test; 24-hour soak with synthetic asks and decisions; record RU, message latency, p95 ask-to-first-event.
9. Security review (item 10); fix findings.
10. Promote to `pilot`; hand the API host to ADR-014.

### Acceptance

- The ADR-006 conformance suite passes against `dev` and `pilot`.
- The three canonical interactions and the multi-platform sequence complete end to end with a real dock, and the Ledger shows exactly the rows §4.5 prescribes for each.
- A journey paused in `input-required` survives a redeploy and a 12-hour wait, and resumes on the decision.
- Triage gate ≥ 95 % on the evaluation set; a shadow agent never receives an A2A call.
- The security review has no open high findings.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Agent Framework for Python | Equal workflow capability and a GA Cosmos checkpoint provider. Rejected for the default because identity middleware and OBO are heavier to get right, and the template should match. Accepted override if the team is Python-first; the decision must then be reflected in ADR-012. |
| Semantic Kernel or AutoGen | Superseded by Agent Framework; not the locked choice in `design-brief.md` §3.2. |
| LangGraph or another non-Microsoft runtime | Not the locked choice; no first-party A2A/Foundry/Cosmos integration. |
| Azure Functions (Durable) | Durable orchestrations overlap with Agent Framework checkpointing; two workflow engines. Container Apps hosts the framework as designed. |
| Azure Kubernetes Service | Operational weight for one deployable and a job. Revisit at GA if sub-agent count or isolation needs demand it. |
| App Service | Viable; rejected for consistency with sub-agents on Container Apps and for VNet-integrated jobs. |
| Foundry Agent Service as the runtime | Managed hosting is attractive, but Loop's API edge, Ledger semantics and checkpoint-before-announce ordering are custom; keep as a future option for individual sub-agents. |
| Separate edge and worker apps from day one | Two deployables to secure and observe before load justifies it; the hosted-service design allows the split later. |
| Growing system prompt listing every agent (no retrieval) | Prompt grows with agents; `design-brief.md` §4 fixed retrieval for constant prompt size. |

## Consequences

**Positive**

- One process, one identity, one pipeline for the pilot; every server component the dock depends on is in one place with one contract version.
- Triage has a measurable bar before any agent goes live, closing a §9 question.
- The dock team can start integration at step 2, weeks before workflows exist.

**Negative and mitigations**

- Two preview packages (Cosmos checkpoint store, A2A) on the critical path. Mitigation: pin, abstract behind interfaces, record in the risk log; both are Microsoft-owned and tracking 1.x.
- A single deployable couples the API edge's availability to worker load. Mitigation: replicas 1–3 and the documented split.
- .NET may not match every platform team's skills. Mitigation: the template does the hard parts; a Python template can be added later behind the same conformance tests.

**Follow-ups**

- ADR-012 builds the first sub-agent on this stack.
- Before GA: revisit hosting split, Premium Web PubSub, multi-region Cosmos, and Foundry model lifecycle.

## References

- Microsoft Agent Framework 1.0 announcement: https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/
- Workflow checkpoints: https://learn.microsoft.com/agent-framework/workflows/checkpoints
- A2A in Agent Framework for .NET: https://devblogs.microsoft.com/agent-framework/a2a-v1-is-here-cross-platform-agent-communication-in-microsoft-agent-framework-for-net/
- Microsoft.Identity.Web (token validation, OBO): https://learn.microsoft.com/entra/msal/dotnet/microsoft-identity-web/
- Azure Container Apps: https://learn.microsoft.com/azure/container-apps/
- Azure OpenAI structured outputs: https://learn.microsoft.com/azure/ai-foundry/openai/how-to/structured-outputs
- `system-architecture.md` §4 (behaviour), §8 (failure table), §9 (open questions).
