# Contracts changelog

One entry per `contracts@MAJOR.MINOR` tag. Minor is additive; major is anything else. The owner signs every tag (ADR-006), in the role "owner, signing for the orchestrator" until a separate orchestrator team is named.

## contracts@0.1

Initial schemas, mirroring `docs/design-brief.md` §3.3 and `docs/shell-architecture.md` §5:

- Card envelope and six card types: `summary`, `record`, `table`, `choice`, `confirmation`, `link`. `choice` and `confirmation` carry an `attentionId`; deciding them is an Attention decision.
- `AttentionItem` (`confirm` / `choose` / `provide` / `auth`), `AttentionDecision` (strict, idempotent).
- Ledger row, filters, cursor page.
- `JourneyThread` read model for reopening a journey from Recent.
- `Session`, `DockState`, `Connectivity`, `Settings`.
- Realtime events (`task_state`, `attention_new`, `attention_resolved`, `attention_expired`, `ledger_appended`) and the wire-to-IPC name map.
- `IpcError` model.
- A2A state map.

- `anchor_set_expanded` command (edge tab ↔ pill, ADR-005).

Sign-off: Waqas Ahmed, 21 September 2026 — owner, signing for the orchestrator.
