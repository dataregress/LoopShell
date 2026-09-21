import type { LedgerFilters } from '@contracts/schemas/ledger';

/** Query keys (docs/technology.md §5.5). */
export const keys = {
  attention: (userId: string) => ['attention', userId] as const,
  ledgerRoot: (userId: string) => ['ledger', userId] as const,
  ledger: (userId: string, filters: LedgerFilters) => ['ledger', userId, filters] as const,
  journey: (journeyId: string) => ['journey', journeyId] as const,
};
