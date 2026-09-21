import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { LedgerFilters, LedgerRow } from '@contracts/schemas/ledger';
import { useAdapter } from '@/adapters/AdapterProvider';
import { selectUserId, useSessionStore } from '@/stores/session';
import { keys } from './queryKeys';

export const LEDGER_PAGE = 100;

export function useLedgerInfinite(filters: LedgerFilters) {
  const adapter = useAdapter();
  const userId = useSessionStore(selectUserId);
  const signedIn = useSessionStore((s) => s.session.state === 'signed_in');
  return useInfiniteQuery({
    queryKey: keys.ledger(userId, filters),
    queryFn: ({ pageParam }) => adapter.ledgerQuery({ filters, cursor: pageParam, limit: LEDGER_PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: signedIn,
    staleTime: 30_000,
  });
}

export function useJourney(journeyId: string | null) {
  const adapter = useAdapter();
  return useQuery({
    queryKey: keys.journey(journeyId ?? ''),
    queryFn: () => adapter.journeyGet(journeyId as string),
    enabled: journeyId !== null,
    staleTime: 10_000,
  });
}

/** Whether a realtime row belongs in a cached query with these filters. */
export function rowMatchesFilters(row: LedgerRow, filters: LedgerFilters, userId: string): boolean {
  if (filters.platforms.length > 0 && !filters.platforms.includes(row.platform)) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(row.eventType)) return false;
  if (filters.scope === 'mine' && row.actor.userId !== userId) return false;
  if (filters.scope === 'routed' && !row.routedToUser) return false;
  return true;
}
