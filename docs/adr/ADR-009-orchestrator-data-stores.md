# ADR-009 — Orchestrator data stores: Azure Cosmos DB for NoSQL

| | |
|---|---|
| **Status** | Proposed |
| **Last updated** | 21 September 2026 |
| **Owner** | Waqas Ahmed — single owner for the Loop initiative. Functions performed: Orchestrator team (data model, access layer) · Cloud & AI Team (account, network, backup). Team names identify the function, not a separate group. |
| **Audience** | Orchestrator team · Cloud & AI Team · Security · Loop Platform Team |
| **Related** | [system-architecture.md](../system-architecture.md) §2, §4.3–§4.6, §5, §8 · `contracts/schemas/ledger.ts` · `contracts/schemas/attention.ts` · `contracts/schemas/journey.ts` · ADR-006 · ADR-008 · ADR-010 · ADR-011 · ADR-015 |

## Status

Proposed. `system-architecture.md` §2 names a Ledger store, an Attention store, an Agent registry and "durable storage" for checkpoints, and gives each a property (append-only, queryable by assignee, durable) but no technology. This ADR chooses one and defines the containers, the access rules and the event publication path. The dock has no database by design (`shell-architecture.md` §1, `loop-stack-locked.mdc`); nothing here changes that.

## Context

- The mock keeps everything in memory (`tools/mock-orchestrator/src/state.ts`: "In memory; restart resets") and §5 of the architecture doc says this is the one divergence the real orchestrator must not share: a pending journey must survive sleep, a redeploy and a sign-in on another machine.
- The stores have different shapes:
  - **Ledger**: append-only audit trail; queried per user with `platform`, `status`, `scope` filters and an opaque cursor (`GET /ledger`, `LedgerQuery`); a row can be visible to more than one user (requester and approver); `routedToUser` is relative to the viewer.
  - **Attention**: small, mutable `open → decided | expired`; queried by assignee; two devices may decide at once and exactly one must win (`409`); the accepted `idempotencyKey` must be remembered.
  - **Journeys**: the `JourneyThread` read model for `GET /journey/{id}`; `POST /ask` is idempotent on `clientRequestId` per user.
  - **Workflow checkpoints**: written at every human-decision pause by Microsoft Agent Framework; schema owned by the framework's store provider.
  - **Registry**: Agent Cards plus a vector index over skills for triage retrieval.
  - **Remote config**: one document.
- "Record, then announce" (§3, §8): a state change is written before it is published, and fan-out follows the Ledger. The dock dedupes on `eventId`, so a replayed event must carry the same id.
- Microsoft Agent Framework 1.0 ships Cosmos DB checkpoint stores for both lines: `Microsoft.Agents.AI.CosmosNoSql` (`CosmosCheckpointStore`, preview at the time of writing) for .NET and `agent-framework-azure-cosmos` (`CosmosCheckpointStorage`) for Python.
- Retention, export and data residency are policy decisions (ADR-015). This ADR provides the mechanisms they need.

## Decision

### Scope and repositories

| Repository | What lands there |
|---|---|
| `loop-infra` | Bicep: Cosmos DB account, database, containers (partition keys, indexing policies, unique keys, vector policy, TTL), custom RBAC role definitions and assignments, private endpoint, backup policy, diagnostic settings. |
| `loop-orchestrator` | Data access layer (one repository class per container), the change-feed publisher (hands events to ADR-010), the expiry sweep, the ask idempotency path, the Ledger cursor codec. Cosmos DB emulator in `docker compose` for local development. |
| `LoopShell` | No code. The mock stays in memory. `system-architecture.md` §2 gains the technology column entries. |

### Decision items

1. **One Azure Cosmos DB for NoSQL account** per environment (`dev`, `pilot`), single region co-located with the orchestrator, **database-level autoscale throughput** (400–4,000 RU/s for the pilot), session consistency, continuous backup (7-day tier for `dev`, 30-day for `pilot`), `disableLocalAuth: true` (Entra data-plane auth only), public network access disabled, private endpoint from the Container Apps environment VNet (ADR-011), diagnostic logs to Log Analytics (ADR-013). Customer-managed keys only if Security requires (ADR-015).

2. **Database `loop`, containers:**

   | Container | Partition key | Mutability | TTL | Purpose and notes |
   |---|---|---|---|---|
   | `ledger` | `/journeyId` | **Append-only** (create + read; no replace, upsert or delete for any principal) | none | Canonical `LedgerRow` plus `visibleTo: string[]` (the `oid`s who may see the row). `GET /ledger` queries `ARRAY_CONTAINS(c.visibleTo, @me)`; `routedToUser` is computed at read time as `c.actor.userId != @me`. Composite index `(occurredAt DESC, eventId ASC)`. |
   | `journeyRevisions` | `/journeyId` | Append-only | 30 days | One item per `journey.updated` event: `{ eventId, journeyId, taskId, state, agentId?, cards?, message?, recipients: string[] }`. Source of the `journey.updated` publication (item 6) and of thread history. |
   | `journeys` | `/journeyId` | Mutable projection, rebuildable from `journeyRevisions` + `ledger` | none | The `JourneyThread` read model for `GET /journey/{id}` plus `ownerUserId`, `participants[]`. |
   | `asks` | `/userId` | Create-only | none | `id = clientRequestId`. `{ text, journeyId, taskId, routedTo: agentId \| null, createdAt }`. Create-if-absent gives `POST /ask` idempotency; `routedTo: null` rows are the "no agent covers this yet" record for the Loop team. |
   | `attention` | `/assigneeUserId` | Mutable via **conditional replace** (`If-Match` ETag) | none | `AttentionItem` plus `pop: boolean`, `acceptedIdempotencyKey?`, `revision`. State machine `open → decided \| expired`; the losing writer's `412` becomes the API's `409`. |
   | `checkpoints` | As defined by the framework's Cosmos checkpoint store | Owned by the framework | none | Workflow checkpoints. Never queried by Loop code; the run id is stored on the journey. |
   | `registry` | `/agentId` | Mutable | none | Verified Agent Card, JWKS URL, allowed hosts, `state: shadow \| enabled \| disabled`, versions, last verification. |
   | `registrySkills` | `/agentId` | Mutable | none | One item per skill: `{ id: skillId, name, description, tags, examples, cardTypes, embedding: number[] }`. Vector embedding policy on `/embedding` (`cosine`), vector index `quantizedFlat` for the pilot (`diskANN` when skills exceed a few thousand). Triage queries `VectorDistance` over enabled and shadow agents. |
   | `config` | `/id` | Mutable | none | Single item `remote` = `RemoteConfig` (ADR-006). Written only by the ops path in ADR-011. |
   | `leases` | `/id` | Owned by the change-feed processor | none | Leases for the publisher (item 6). |

3. **Append-only is enforced by RBAC, not by convention.** Two custom Cosmos DB SQL role definitions:
   - `Loop Ledger Appender`: `readMetadata`, `containers/items/create`, `containers/items/read`, `containers/executeQuery`, `containers/readChangeFeed`. Assigned to the orchestrator's managed identity **scoped to `/dbs/loop/colls/ledger` and `/dbs/loop/colls/journeyRevisions` and `/dbs/loop/colls/asks`**.
   - `Loop Data Contributor`: the built-in Data Contributor actions. Assigned to the same identity **scoped to the remaining containers**.
   No human principal holds a data-plane role in `pilot`; support reads go through the orchestrator's audited endpoints or a time-boxed PIM assignment of Data Reader. TTL is not set on `ledger`, so the service never deletes rows either. Operator error is covered by point-in-time restore.

4. **Concurrency and idempotency.**
   - Decision relay: read the item, check `state == 'open'` and `expiresAt > now`, replace with `If-Match`. On `412`, re-read: same `idempotencyKey` → `200 { accepted: true }`; otherwise `409`. The accepted key is stored on the item, which is the durable idempotency record `system-architecture.md` §4.4 requires.
   - Ask submission: `CreateItem` into `asks` with `id = clientRequestId`; on `409 Conflict` from Cosmos, read the existing item and return its `{ journeyId, taskId }` with HTTP `200`.
   - Expiry: a sweep every 60 s queries `attention` for `state = 'open' AND expiresAt <= now` (cross-partition, small) and performs the same conditional replace to `expired`. Idempotent, so multiple replicas are safe.

5. **Ledger cursor.** Keyset pagination on `(occurredAt DESC, eventId)`; the cursor is the pair, JSON-encoded, HMAC-signed with a key from Key Vault, base64url. Opaque to the client, stable while rows are appended (new rows sort before the first page and do not shift later pages), and rejected with `400` code `invalid` if tampered with. No Cosmos continuation tokens leave the process.

6. **Publication follows the write: change feed → Web PubSub.** A change-feed processor (leases in `leases`, one processor per container, safe with several replicas) turns items into wire events and hands them to the publisher in ADR-010:

   | Source container | Wire event | `eventId` | Recipients |
   |---|---|---|---|
   | `ledger` (create) | `ledger.appended { row }` | the row's `eventId` | every `oid` in `visibleTo` |
   | `journeyRevisions` (create) | `journey.updated { journeyId, taskId, state, agentId?, cards?, message? }` | the revision's `eventId` | `recipients[]` |
   | `attention` (create or update) | `attention.created { item, pop }` when `state = 'open'`; `attention.resolved { attentionId, decision }` when `decided`; `attention.expired { attentionId }` when `expired` | `attentionId + ':' + revision`, formatted as a UUIDv5 so it validates as `Uuid` | `assigneeUserId` |

   Because every published id is derived from stored state, a replay after a processor restart carries the same `eventId` and the dock's ring-buffer dedupe absorbs it. Change feed in latest-version mode may collapse rapid successive updates to one `attention` item; the publisher derives the event from the current state, so a collapse loses only an `attention.created` for an item that was decided within the same window, which the user could never have acted on. `ledger` and `journeyRevisions` are create-only, so nothing there collapses.

7. **Write order inside the orchestrator** (implements "record, then announce"): checkpoint → `attention` item → `journeyRevisions` item → `journeys` projection → publication by the feed. A crash between checkpoint and `attention` re-emits the request on restore (`system-architecture.md` §4.3); a crash after the writes loses nothing because publication is asynchronous from the feed.

8. **Retention and export hooks.** `ledger` keeps rows for the period ADR-015 sets. A nightly job (Container Apps job) reads the `ledger` change feed from a stored continuation and appends rows to an immutable Blob Storage container (time-based WORM retention, ADR-015). Cosmos remains the query store; Blob is the audit copy.

9. **Local development.** Cosmos DB emulator (Linux container) in `loop-orchestrator/docker-compose.yml` with the same Bicep-derived container definitions applied by a bootstrap script. Vector search and RBAC differ on the emulator; tests that need them run against the `dev` account in CI.

### Prerequisites

Owner for every row: Waqas Ahmed. The "Function" column names the hat being worn, so the row can be handed over if a team is named later.

| # | Prerequisite | Function |
|---|---|---|
| P1 | ADR-006 `contracts@0.2` tagged: item schemas mirror `LedgerRow`, `AttentionItem`, `JourneyThread`, `RemoteConfig` | Loop Platform Team |
| P2 | ADR-011: subscription, resource group, naming convention, Container Apps environment and VNet (for the private endpoint), the orchestrator's user-assigned managed identity | Cloud & AI Team |
| P3 | ADR-008: managed identity exists so role assignments can be made | Identity / Cloud & AI Team |
| P4 | ADR-015 inputs: retention period, residency (region), whether CMK is required | Security |
| P5 | ADR-011 language decision: which framework checkpoint store package is used (fixes the `checkpoints` container's expectations) | Orchestrator team |

### Steps

1. Bicep module `cosmos.bicep` in `loop-infra`: account, database with autoscale, every container in item 2 with indexing policy (exclude `/cards/*` and `/evidence/*` from indexing; include the composite index on `ledger`), unique key on nothing (uniqueness is by `id` within partition), vector policy on `registrySkills`, TTL on `journeyRevisions`; role definitions and assignments of item 3; private endpoint; backup; diagnostics. Deploy `dev`.
2. `loop-orchestrator/src/Data/`: one repository per container behind an interface; the cursor codec (item 5) with unit tests including tamper rejection; the conditional-replace helpers (item 4).
3. Append-only test: with the orchestrator's identity, attempt `ReplaceItem` and `DeleteItem` on `ledger` and assert `403`. This test runs in CI against `dev` and is a release gate.
4. Change-feed publisher (item 6) with the leases container; integration test: insert a `ledger` row, assert exactly one `ledger.appended` with the row's `eventId` reaches a test Web PubSub group (ADR-010), then restart the processor and assert the replay carries the same id.
5. Expiry sweep as a hosted service; test with a 1-minute `expiresAt`.
6. `GET /ledger` against 10,000 generated rows (reuse `contracts/fixtures/ledger.ts` `generateLedgerRows`): page through with the cursor while inserting rows; assert no duplicates or gaps.
7. Cross-device test: two concurrent decisions on one item with different keys → one `200`, one `409`; same key twice → two `200`.
8. Restore drill on `dev`: point-in-time restore to a new account, verify row counts.
9. Nightly export job skeleton (item 8) writing to a WORM container in `dev`; policy values come from ADR-015.
10. Deploy `pilot` with the same Bicep and a parameter file.

### Acceptance

- The conformance suite (ADR-006) passes for `/ledger`, `/attention`, `/attention/{id}/decide`, `/journey/{id}` against the `dev` orchestrator.
- The append-only test (step 3) is green and enforced in CI.
- Publisher restart produces no duplicate visible events in a connected dock (dedupe absorbs the replay) and no missing events.
- A journey paused in `input-required` resumes after the orchestrator is redeployed (proves `checkpoints` with ADR-011).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Azure SQL Database with ledger tables | Cryptographic tamper-evidence is attractive for the audit trail, but cards, evidence and Attention items are documents; no first-party Agent Framework checkpoint store; relational modelling and migrations for every card change. Kept as the candidate if Security requires tamper-evidence beyond RBAC plus the WORM export. |
| Azure Database for PostgreSQL | Good JSONB support, but the same checkpoint-store and operational objections as SQL; adds a second data technology once Cosmos is chosen for checkpoints. |
| Two databases: Cosmos for runtime state, SQL for the Ledger | Two backup, RBAC and network stories for a pilot; the change-feed publication path would need a second implementation. Revisit at GA if audit requirements demand it. |
| Azure Table Storage | No rich queries, no vector index, no change-feed processor with leases. |
| Azure AI Search for the routing corpus | A third service for a corpus of tens of skills. Cosmos vector search covers pilot scale; AI Search is the scale-out path if agents exceed a few thousand skills or need hybrid text ranking. |
| Serverless capacity mode | Cheaper at pilot volume, but vector indexing and some throughput behaviours differ by capacity mode and the difference is not worth verifying now; autoscale with a low ceiling is predictable. Revisit for `dev` cost. |
| Publish directly after each write (no change feed) | Needs an outbox to guarantee "announced only if recorded" and a retry loop on publish failure; the change feed is that outbox, built in, with ordering per partition. |
| Cosmos continuation tokens as the Ledger cursor | Leak query shape, are not stable across filter changes, and are long. Keyset cursors are small and signed. |
| Per-viewer Ledger projection (`ledgerByUser`) | Faster reads at scale, but doubles writes and adds a rebuild path. Not needed at pilot volume; the design leaves room to add it without changing `GET /ledger`. |

## Consequences

**Positive**

- One database technology, one RBAC model, one network path, one backup story; the framework's own checkpoint store lives beside Loop's data.
- Append-only is a property of the identity, not of code review.
- Event publication is derived from stored state, so the dock's dedupe contract (`eventId` stable across replay) holds by construction.

**Negative and mitigations**

- Cross-partition query for `GET /ledger` (`ARRAY_CONTAINS` on `visibleTo`). Mitigation: acceptable RU cost at pilot volume; the per-viewer projection is a documented upgrade.
- The .NET Cosmos checkpoint package is preview at the time of writing. Mitigation: pin the version; the container is framework-owned so a package change does not touch Loop's schema.
- RBAC-enforced append-only is not cryptographic tamper-evidence. Mitigation: continuous backup plus the WORM export give an independent copy; SQL ledger tables remain the fallback.

**Follow-ups**

- ADR-015 fixes retention, export cadence and residency; the Bicep parameters take those values.
- Measure RU consumption during the ADR-011 soak; raise the autoscale ceiling or add the projection if `GET /ledger` dominates.

## References

- Cosmos DB RBAC data actions and custom roles: https://learn.microsoft.com/azure/cosmos-db/how-to-setup-rbac
- Change feed processor: https://learn.microsoft.com/azure/cosmos-db/nosql/change-feed-processor
- Optimistic concurrency (ETag): https://learn.microsoft.com/azure/cosmos-db/nosql/database-transactions-optimistic-concurrency
- Vector search: https://learn.microsoft.com/azure/cosmos-db/nosql/vector-search
- Continuous backup and point-in-time restore: https://learn.microsoft.com/azure/cosmos-db/continuous-backup-restore-introduction
- Agent Framework checkpoints: https://learn.microsoft.com/agent-framework/workflows/checkpoints
- `Microsoft.Agents.AI.CosmosNoSql` (`CosmosCheckpointStore`): https://www.nuget.org/packages/Microsoft.Agents.AI.CosmosNoSql/
- Immutable Blob Storage (WORM): https://learn.microsoft.com/azure/storage/blobs/immutable-storage-overview
