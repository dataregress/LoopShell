import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { AttentionItem } from '@contracts/schemas/attention';
import { useAdapter } from '@/adapters/AdapterProvider';
import { useDockStore } from '@/stores/dock';
import { selectUserId, useSessionStore } from '@/stores/session';
import { keys } from './queryKeys';

export function useAttentionQuery() {
  const adapter = useAdapter();
  const userId = useSessionStore(selectUserId);
  const signedIn = useSessionStore((s) => s.session.state === 'signed_in');
  return useQuery({
    queryKey: keys.attention(userId),
    queryFn: () => adapter.attentionList(),
    enabled: signedIn,
    staleTime: 60_000,
  });
}

export interface VisibleAttention {
  /** Open items, expiring soonest first, then newest. */
  open: AttentionItem[];
  /** Expired within the last 24 h, read-only. */
  expired: AttentionItem[];
  count: number;
}

const DAY_MS = 24 * 60 * 60_000;

export function partitionAttention(items: AttentionItem[], hidden: string[], now = Date.now()): VisibleAttention {
  const open: AttentionItem[] = [];
  const expired: AttentionItem[] = [];
  for (const item of items) {
    if (item.state === 'decided') continue;
    if (hidden.includes(item.attentionId)) continue;
    const isExpired = item.state === 'expired' || Date.parse(item.expiresAt) <= now;
    if (isExpired) {
      if (now - Date.parse(item.expiresAt) < DAY_MS) expired.push(item);
    } else {
      open.push(item);
    }
  }
  open.sort((a, b) => {
    const ea = Date.parse(a.expiresAt);
    const eb = Date.parse(b.expiresAt);
    if (ea !== eb) return ea - eb;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  expired.sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt));
  return { open, expired, count: open.length };
}

/**
 * Attention as the user sees it: proposals shown inline in the open Ask
 * thread are held back until the panel hides (docs/ui-ux.md §3.4).
 */
export function useVisibleAttention(): VisibleAttention & { isLoading: boolean; error: unknown; refetch: () => void } {
  const query = useAttentionQuery();
  const inlinePending = useDockStore((s) => s.inlinePending);
  const partitioned = useMemo(
    () => partitionAttention(query.data ?? [], inlinePending),
    [query.data, inlinePending],
  );
  return { ...partitioned, isLoading: query.isLoading, error: query.error, refetch: () => void query.refetch() };
}

/** The one number on the pill. */
export function useAttentionCount(): number {
  return useVisibleAttention().count;
}
