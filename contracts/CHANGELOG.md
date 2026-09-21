# Contracts changelog

One entry per `contracts@MAJOR.MINOR` tag. Minor is additive; major is anything else. The orchestrator team signs off every tag.

## contracts@0.1 (unreleased)

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

Sign-off: pending.
