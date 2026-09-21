# ADR-013 — Telemetry and correlation across dock, orchestrator and sub-agents

| | |
|---|---|
| **Status** | Proposed |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Functions performed: Loop Platform Team (dock, correlation contract) · Orchestrator team (server) · Cloud & AI Team (sinks). Team names identify the function, not a separate group. |
| **Audience** | Loop build team · Orchestrator team · Sub-agent owners · Security · Support |
| **Related** | [technology.md](../technology.md) §8 · [shell-architecture.md](../shell-architecture.md) §7 · [system-architecture.md](../system-architecture.md) §4.1, §6.9 · `src-tauri/src/api/mod.rs` · ADR-006 · ADR-011 · ADR-012 · ADR-014 |

## Status

Proposed. The stack is locked (Sentry for the dock; OpenTelemetry to Application Insights for traces), but nothing is provisioned, the dock has no `telemetry/` module yet, and the correlation fields that let Support follow one ask across four systems are only implied.

## Context

- `technology.md` §8 and `loop-stack-locked.mdc` fix: Sentry via `tauri-plugin-sentry` (Rust + browser), OpenTelemetry traces to Azure Application Insights, spans carrying `journeyId`, `taskId`, `agentId`, PII scrubbing (UPNs, free-text replies, card bodies never sent).
- The dock's HTTP client already sends a W3C `traceparent` on every request, but it is a fresh root span per request with no exporter (`api/mod.rs`: "Real OTel wiring replaces this"). `Cargo.toml` has no Sentry or OpenTelemetry crates; `lib.rs` has no `telemetry` module although `shell-architecture.md` §1 lists one.
- `x-correlation-id` must be on every edge response; the dock surfaces it in error states (`IpcError.correlationId`) so a user can quote it to Support. Its relationship to the trace id is undefined.
- Application Insights ingests OpenTelemetry from server processes through the Azure Monitor distro. Ingesting OTLP directly from thousands of desktop clients needs an authenticated ingestion path the dock does not have (its token audience is the Loop API), and the dock is only allowed to talk to one backend.
- Sub-agents and the MCP Gateway log tool calls with `journeyId`, `taskId`, `agentId` (`system-architecture.md` §6.9, ADR-012 item 4).
- Retention, residency and which Sentry region are Security decisions (ADR-015).

## Decision

### Scope and repositories

| Repository | What lands there |
|---|---|
| `loop-infra` | Log Analytics workspace, workspace-based Application Insights, diagnostic settings for Cosmos and Web PubSub, alert rules, a workbook. Sentry projects are created in the Sentry organisation (SaaS or self-hosted per ADR-015) and their DSNs stored in Key Vault. |
| `loop-orchestrator` | Azure Monitor OpenTelemetry distro, correlation middleware, span attributes, redaction processor. |
| `loop-agent-template` | Same distro and processor; `traceparent` propagation to MCP calls. |
| `LoopShell` | `src-tauri/src/telemetry/` (Sentry init, trace context, redaction), real `traceparent` propagation, `telemetry_event` command wiring; browser Sentry in `src/`. Scheduled with ADR-014. |

### Decision items

1. **Sinks.** One Log Analytics workspace and one workspace-based Application Insights resource per environment (`dev`, `pilot`) for every server component: orchestrator, sub-agents, MCP Gateway (if it can export), plus Cosmos DB and Web PubSub diagnostics. One Sentry organisation with projects `loop-dock-rust`, `loop-dock-web`, and `loop-orchestrator` (errors only; traces stay in Application Insights). Region and retention per ADR-015; defaults 90 days for Application Insights, 30 days for Sentry events.

2. **Correlation contract.**

   | Field | Origin | Carried where | Rule |
   |---|---|---|---|
   | `traceparent` | Dock (root span per user action: ask submit, decision, reconnect) | HTTP header dock → edge; edge → sub-agent (A2A over HTTP); agent → Gateway → MCP server | W3C Trace Context. The server continues the trace; it never starts a new one when a valid header is present. |
   | `x-correlation-id` | Edge | Response header on every response | **Equals the trace id** of the server span handling the request. What the dock shows in an error state is therefore directly searchable in Application Insights. |
   | `journeyId`, `taskId`, `agentId` | Orchestrator | Span attributes and log scopes on every server span after they are known; `x-journey-id` request header from the dock when known | Also custom dimensions on Application Insights requests and dependencies. Never in URLs of external systems. |
   | `eventId` | Orchestrator (ADR-009) | Attribute on publisher spans and dock realtime logs | Lets a "missing event" report be traced from Cosmos change feed to Web PubSub to dock. |
   | `contractsVersion`, `appVersion` | Dock (`LoopDock/<version>` user agent) and edge | Request attributes | Mismatch dashboards. |

3. **Dock telemetry.**
   - **Sentry** for Rust panics and errors (`tauri-plugin-sentry`) and browser errors; release tagged `loop-dock@<version>`; environment `dev` / `pilot`. Performance tracing in Sentry is **on at 10 % sampling** for the three user actions in item 2, giving the dock its own latency view without an OTLP path.
   - **Traces to Application Insights are propagated, not exported, in the pilot.** The dock generates a proper trace id per user action, reuses it across the request and its follow-up decision, and sends it as `traceparent`. The server side records the spans. This satisfies "traces carry `journeyId` and `taskId`" for everything that happens after the request leaves the dock. Direct OTLP export from the dock is deferred until an authenticated ingestion path exists; the accepted design for that later step is a bearer-authenticated `POST /telemetry/otlp` on the edge that forwards to Application Insights, so the dock still talks to one backend. `technology.md` §8 is amended to say so.
   - **Product events** (`telemetry_event` command): a small fixed set (`panel_open`, `ask_submit`, `decision`, `mode_switch`, `reconnect`) with no free text. They go to Sentry as custom events (with `journeyId` where applicable) and are aggregated in Sentry Discover, so the dock's outbound surface stays Loop API plus Sentry and nothing else.
   - The `traceparent()` stub in `api/mod.rs` is replaced by the real context; `x-journey-id` continues to be sent when known.

4. **Redaction, everywhere.** Never above `debug`, and never to any sink: card bodies (`cards[]`, `record`, `evidence`), `freeText`, UPNs and display names, ask text, MCP tool arguments and results. Allowed: ids (`journeyId`, `taskId`, `attentionId`, `cardId`, `eventId`, `oid`), states, agent ids, card `type`, durations, status codes. Each process has one redaction processor (Sentry `before_send` in the dock; an OpenTelemetry processor in .NET) and a unit test that feeds a payload containing every forbidden field and asserts it does not leave.

5. **Server spans.** ASP.NET Core request spans plus custom spans: `triage.retrieve`, `triage.choose` (with `k`, `decision`, similarity, never the ask text), `workflow.run`, `workflow.checkpoint`, `a2a.send` (agent id, binding, state returned), `ledger.append` (event type), `attention.write`, `publish.send` (event type, recipients count), `relay.decide` (outcome `accepted | replayed | conflict | expired`). Sub-agents: `a2a.receive`, `mcp.call` (tool name, outcome).

6. **Dashboards and alerts** (Application Insights workbook + alert rules in Bicep):

   | Signal | Alert |
   |---|---|
   | Ask → first `journey.updated` p95 | > 3 s for 10 minutes |
   | Decision relay latency p95 (`relay.decide` to `attention.resolved` published) | > 2 s |
   | Change-feed publish lag (item write to publisher send) | > 5 s |
   | Sub-agent failure rate per `agentId` | > 5 % over 15 minutes |
   | Triage `none` rate | > 30 % over 1 hour (routing corpus problem) |
   | Web PubSub connections vs. unit limit | > 80 % |
   | Cosmos 429s | any sustained 5 minutes |
   | Attention items expiring undecided per day | trend, no alert |
   | Contract version mismatch (dock vs. edge) | any |

7. **Support runbook input.** A user reports an error with a correlation id → Application Insights transaction search by operation id → server spans with `journeyId` → `GET /journey/{id}` through the admin path → Ledger rows. The runbook lives in `loop-orchestrator/docs/`.

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | ADR-015: Sentry hosting (SaaS region or self-hosted) and retention values | Security |
| P2 | ADR-011 hosting so the distro has somewhere to run; managed identity for Application Insights ingestion (Entra-authenticated ingestion, no instrumentation key in config) | Cloud & AI Team |
| P3 | Sentry organisation and DSNs in Key Vault | Cloud & AI Team |
| P4 | ADR-006 `contracts@0.2` (`contractsVersion` in `GET /config`) | Loop Platform Team |

### Steps

1. Bicep in `loop-infra`: Log Analytics, Application Insights, diagnostics for Cosmos and Web PubSub, alert rules of item 6, the workbook. Deploy `dev`.
2. `loop-orchestrator`: add the Azure Monitor distro, the correlation middleware (`x-correlation-id` = trace id), span attributes, the redaction processor and its test. Verify a dock request appears as one distributed trace with the dock's `traceparent` as parent.
3. `loop-agent-template`: same, plus `traceparent` propagation into MCP calls; verify a `raiseIncident` trace spans edge → agent → Gateway.
4. `LoopShell`: add `tauri-plugin-sentry` and the `telemetry/` module; real trace context in `api/mod.rs`; `before_send` redaction with its test; browser Sentry in `src/app/bootstrap.tsx`; wire `telemetry_event`. DSN and environment are build-time values (ADR-014). Amend `technology.md` §8 (propagate now, export later).
5. Redaction audit: run the demo scenarios with capture enabled on every sink and grep for the forbidden fields; the audit is repeated before each pilot release.
6. Deploy `pilot`; confirm alerts route to the on-call channel.

### Acceptance

- One `raiseIncident` from a real dock appears as a single trace: dock request → edge → triage → A2A → agent → Gateway, with `journeyId` and `taskId` on every server span, and the correlation id shown by the dock on a forced error matches the trace id in Application Insights.
- The redaction tests pass in all three codebases and the audit finds no forbidden field in any sink.
- Every alert in item 6 has fired once in `dev` through a deliberate fault and reached the channel.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| OTLP export directly from the dock to Azure Monitor now | Needs an Entra token for the Monitor audience in the dock (a second scope and consent), or an ingestion key on every device. Deferred behind the edge proxy design. |
| Sentry for everything (server traces included) | Application Insights is the locked server sink and integrates with Cosmos and Web PubSub diagnostics; two trace stores would split every investigation. |
| Application Insights browser SDK in the webview | Requires network egress from the webview (`connect-src 'none'` forbids it); Sentry runs through the Tauri plugin's Rust transport. |
| Random `x-correlation-id` unrelated to the trace | Adds a second id Support must map; equality with the trace id costs nothing. |
| Logging card bodies at `info` "for debugging" | Forbidden by `shell-architecture.md` §7 and this ADR; redaction tests make the rule mechanical. |

## Consequences

**Positive**

- One id, quoted from the dock, leads to the full server trace and the Ledger.
- The dock keeps a single backend and no telemetry secrets beyond the Sentry DSN.
- PII rules are tests, not guidance.

**Negative and mitigations**

- Dock-internal latency (reveal, reconnect) is visible only in Sentry performance samples, not in Application Insights. Mitigation: 10 % sampling is enough for pilot budgets; the export path is designed for later.
- Two vendors for the pilot. Mitigation: both are locked choices; the split is by concern (client errors vs. server traces).

**Follow-ups**

- Implement `POST /telemetry/otlp` on the edge and turn on dock export when Support needs client spans in Application Insights.
- Extend the workbook with triage accuracy over time once ADR-011's evaluation set runs in production shadow mode.

## References

- `technology.md` §8, `shell-architecture.md` §7 (redaction), `system-architecture.md` §6.9.
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- Azure Monitor OpenTelemetry distro (.NET): https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable
- Entra-authenticated ingestion for Application Insights: https://learn.microsoft.com/azure/azure-monitor/app/azure-ad-authentication
- Sentry Rust SDK: https://docs.sentry.io/platforms/rust/ · `tauri-plugin-sentry`: https://github.com/timfish/tauri-plugin-sentry
