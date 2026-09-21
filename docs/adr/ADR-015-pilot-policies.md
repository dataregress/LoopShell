# ADR-015 — Pilot policies: Attention routing and expiry, Ledger retention and export, data residency

| | |
|---|---|
| **Status** | Proposed (defaults recorded; each item needs Security sign-off before the pilot ring) |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Functions performed: Security (policy) · Loop Platform Team (defaults, mechanisms) · Orchestrator team (enforcement). Team names identify the function, not a separate group. |
| **Audience** | Security · Legal / Compliance · Orchestrator team · Loop build team |
| **Related** | [design-brief.md](../design-brief.md) §2.3, §7 · [system-architecture.md](../system-architecture.md) §4.4, §9 · `contracts/schemas/attention.ts` · ADR-006 · ADR-008 · ADR-009 · ADR-013 |

## Status

Proposed. `system-architecture.md` §9 lists two items as "must be decided before the pilot ring, owned by Security": who may route an Attention item to whom, and Ledger retention and export. `design-brief.md` §7 adds Attention escalation. ADR-009 and ADR-013 need residency and retention values as parameters. This ADR records a default for each so the other ADRs can proceed, and the Security sign-off that turns a default into policy.

## Context

- Attention is the human-in-the-loop inbox. An item can be created for a user by a journey that user did not start (a direct report's expense claim, an access request needing manager approval). Without a routing rule, any sub-agent could place an item in front of any user.
- Items carry `expiresAt` and become read-only when expired (`design-brief.md` §2.3); `AttentionItem.kind` is `approve | confirm | choose | provide | auth`. Who sets the TTL, within what bounds, and what happens when an item ages are open.
- Recent is the audit trail and immutable (product invariant 7). ADR-009 makes it append-only by RBAC and provides a change-feed export hook; how long rows live, where the audit copy goes and who can read it are not decided.
- The pilot tenant is an Abu Dhabi organisation; Azure region, Sentry hosting and customer-managed keys are residency questions Security must answer once for every server component.
- Cross-device: decisions are idempotent and the loser gets `409`; ADR-006 adds an optional `decision` to `attention.resolved` so the losing device can show what was decided. Whether to show it is a policy choice (it reveals one user's decision to the same user on another device — no third party is involved).

## Decision

### Scope and repositories

| Repository | What lands there |
|---|---|
| `loop-orchestrator` | Enforcement of items 1–3 (routing check, TTL bounds, expiry outcome), the export job parameters. |
| `loop-infra` | Parameters: region, retention, WORM policy, CMK, Sentry region; the immutable Blob container. |
| `LoopShell` | `design-brief.md` §7 and `system-architecture.md` §9 updated when Security signs; the local reminder in item 2 (dock follow-up). |

### Decision items (defaults, pending Security sign-off)

1. **Attention routing: the system of record decides the approver; Loop never does.** An Attention item may be created for user B by a journey started by user A only when the platform's own workflow designates B (the claim's approver in Oracle Fusion, the access request's manager in ServiceNow / Snowflake). The sub-agent resolves the platform's assignee to an Entra `oid` (Microsoft Graph lookup by UPN, ADR-008 identity); the orchestrator verifies that the `oid` is a member of the pilot group before creating the item. An assignee outside the pilot fails the journey with a `summary` ("The approver is not in the Loop pilot") and a `failed` Ledger row, and the platform's native approval path is unaffected — Loop layers over it (product invariant 8). No user-to-user routing from the dock exists; there is no "send this to…" affordance and none is planned.

2. **Expiry and escalation.**

   | `kind` | Default TTL | Bounds an agent may set | On expiry |
   |---|---|---|---|
   | `confirm` (destructive-action confirmation) | 24 h | 15 min – 72 h | Journey `cancelled`; `expired` Ledger row; nothing executes |
   | `choose`, `provide` | 4 h | 15 min – 24 h | Journey `cancelled`; `expired` row |
   | `approve` (routed approvals) | 72 h | 1 h – 7 days | Journey `expired`; the platform's native approval remains the path of record |
   | `auth` | 72 h | 1 h – 7 days | Journey `cancelled` |

   The orchestrator clamps an agent's requested TTL to the bounds. **No reassignment or escalation to another person in the pilot**: an expired approval falls back to the platform's own workflow, which already has its escalation. One reminder is allowed: the dock raises a local toast for `confirm` and `approve` items 60 minutes before expiry when the panel is hidden (computed from `expiresAt`; no server change, no new event; still an Attention signal so it respects product invariant 1). Escalation policy is revisited after the pilot with data from the ADR-013 "expired undecided" trend.

3. **Cross-device disclosure.** The losing device shows what was decided and by whom (ADR-006 `decision`), because both devices belong to the same user. If the same item were ever visible to two different users (it is not in the pilot: one assignee per item), the field would be omitted.

4. **Ledger retention and export.**
   - **Online (Cosmos `ledger`)**: rows retained for the life of the pilot plus 12 months, then per the GA policy. No TTL is set (ADR-009).
   - **Audit copy**: nightly export (ADR-009 item 8) to an immutable Blob Storage container with a **time-based WORM retention policy** whose duration Legal / Compliance sets; the default recorded here is **7 years**, the common finance-records period, pending confirmation. Each nightly file is newline-delimited JSON of `LedgerRow` plus `visibleTo`, named by date and change-feed continuation, with a SHA-256 manifest. Legal hold is available through the container's policy if required.
   - **Access**: Cosmos data-plane access per ADR-009 item 3 (orchestrator identity only in `pilot`). The WORM container is readable by a Security / Audit group through Entra RBAC (`Storage Blob Data Reader`) and by nobody else. Every read is logged (storage diagnostics to Log Analytics, ADR-013).
   - **Deletion requests** (data-subject requests): the Ledger is an audit record of actions the user took or approved; the default position is that rows are retained under the audit basis and the WORM copy cannot be altered. Compliance confirms the basis; if a redaction obligation exists, it is applied to the online store only, as a new `redacted` row referencing the original, never as an edit (invariant 7).

5. **Residency and encryption.** Every server component (ADR-009 Cosmos, ADR-010 Web PubSub, ADR-011 Container Apps and Foundry, ADR-013 Log Analytics and Application Insights, the WORM storage) is deployed in **one Azure region chosen by Security for the tenant's residency requirements** (UAE North is the expected choice for an Abu Dhabi tenant; Security confirms and also confirms Foundry model availability there — if the chosen models are not deployable in-region, Security decides between another region for Foundry only and a different model). Platform-managed keys by default; customer-managed keys for Cosmos and Storage only if Security requires, in which case ADR-009 step 1 takes the Key Vault key parameters. Sentry: SaaS in the EU data region by default; self-hosted only if Security rejects SaaS for crash payloads (which contain no card bodies, free text or UPNs after ADR-013 redaction).

6. **What the dock persists** is unchanged and recorded here for completeness: settings and pill layout as plain JSON, the refresh token in the OS credential store, logs with redaction, nothing else (`shell-architecture.md` §7). No Ledger, Attention or card data is stored on the device beyond the in-memory query cache, so device retention policy does not apply to Loop data.

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | A named Security owner and a Legal / Compliance contact for items 4–5 | Security |
| P2 | ADR-009 export mechanism designed (the job takes the values here as parameters) | Orchestrator team |
| P3 | ADR-008 pilot group (the membership check in item 1) | Identity |
| P4 | ADR-013 "expired undecided" dashboard, so item 2 can be revisited with data | Orchestrator team |

### Steps

1. Security review session on items 1–5 using this document; each item is signed, amended or rejected in a single pass. Amendments are edits here, not new ADRs.
2. Record the outcomes in this ADR (status → Accepted) and remove the two items from `system-architecture.md` §9 and escalation from `design-brief.md` §7.
3. Pass values to `loop-infra` parameters: region, WORM duration, CMK yes/no, Sentry region, retention days for Log Analytics and Application Insights.
4. Orchestrator team implements the item 1 membership check, the item 2 clamping and expiry outcomes, and configures the export job with item 4's naming and manifest.
5. Loop Platform Team schedules the item 2 local reminder as a dock follow-up (after ADR-014).
6. Compliance signs the item 4 deletion position; the runbook for a data-subject request is written in `loop-orchestrator/docs/`.

### Acceptance

- Every item has a signature and date in this ADR.
- An Attention item whose platform assignee is outside the pilot group fails the journey with the specified summary and row; a TTL outside bounds is clamped; expiry writes the specified row and state.
- The nightly export lands in the WORM container and an attempt to overwrite or delete a file is refused by the storage policy.
- The infra parameter files contain the signed values; no component is deployed outside the chosen region.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Let sub-agents route to any user in the tenant | Turns Attention into a messaging channel and lets an agent defect place decisions in front of the wrong person; the system of record already knows the approver. |
| Loop-side approval chains or delegation ("route to my deputy") | Duplicates platform workflow; out of scope (`design-brief.md` §8, no fourth mode or new function). |
| Escalate expired items to a manager via Loop | Same duplication; the platform's own escalation stays authoritative in the pilot. |
| Server-side reminder event (`attention.reminder`) | New wire event and contract change for something the dock computes from `expiresAt`. |
| Hide what was decided from the losing device | Both devices are the same user; hiding it makes "Already decided elsewhere" a dead end. |
| Set TTL on the Cosmos `ledger` container for retention | Would make the service delete audit rows; retention is enforced by policy on the WORM copy, and the online store is kept for the pilot period. |
| Editing or deleting Ledger rows for data-subject requests | Violates invariant 7; a `redacted` reference row preserves the trail. |
| Multi-region from the start | Residency and cost; single region with continuous backup is sufficient for a pilot. |

## Consequences

**Positive**

- Every Security-owned question that blocks the pilot ring is in one document with a default, so engineering is not waiting on prose.
- Attention stays what the product says it is: the platform's decisions, surfaced to the person the platform chose.
- The audit copy is independent of the database and of anyone's RBAC.

**Negative and mitigations**

- Defaults may be overturned at sign-off. Mitigation: every default is a parameter in ADR-009, ADR-011 and ADR-013; nothing is hard-coded.
- No escalation in the pilot could leave approvals to expire unseen. Mitigation: the local reminder, the "expired undecided" dashboard, and the platform's own escalation.

**Follow-ups**

- Revisit escalation and delegation after the pilot with the ADR-013 data.
- GA retention policy and multi-region decision before GA.

## References

- `design-brief.md` §2.3 (Attention sources, expiry), §7 (open questions), §8 (non-goals).
- `system-architecture.md` §4.4 (decision relay), §9 (pilot blockers).
- Immutable Blob Storage, time-based retention and legal hold: https://learn.microsoft.com/azure/storage/blobs/immutable-storage-overview
- Azure regions and residency: https://learn.microsoft.com/azure/reliability/regions-overview
- Microsoft Graph user lookup: https://learn.microsoft.com/graph/api/user-get
