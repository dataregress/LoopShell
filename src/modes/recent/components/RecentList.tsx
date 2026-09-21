import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, MessageSquareText } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { LedgerFilters } from '@contracts/schemas/ledger';
import { useLedgerInfinite } from '@/hooks/useLedger';
import { t } from '@/lib/i18n';
import { hasActiveFilters, useLedgerStore } from '@/stores/ledger';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorCard } from '@/ui/ErrorCard';
import { RowSkeletons } from '@/ui/Skeleton';
import { RECENT_STEP, ROW_HEIGHT, buildDisplayRows, takeJourneys } from '../display';
import { JourneyGroup } from './JourneyGroup';
import { LedgerRow } from './LedgerRow';

export interface RecentListProps {
  filters: LedgerFilters;
  onOpenJourney: (journeyId: string) => void;
  onAsk: () => void;
  focusRequest: number;
}

/**
 * Virtualised Ledger (TanStack Virtual). Shows the latest `RECENT_INITIAL`
 * journeys; a quiet "More" at the bottom right reveals `RECENT_STEP` more and
 * pulls the next page (`nextCursor`) when the loaded rows run out.
 */
export function RecentList({ filters, onOpenJourney, onAsk, focusRequest }: RecentListProps) {
  const query = useLedgerInfinite(filters);
  const expanded = useLedgerStore((s) => s.expanded);
  const visibleJourneys = useLedgerStore((s) => s.visibleJourneys);
  const toggleJourney = useLedgerStore((s) => s.toggleJourney);
  const clearFilters = useLedgerStore((s) => s.clearFilters);
  const showMore = useLedgerStore((s) => s.showMore);
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.rows) ?? [], [query.data]);
  const { rows: display, total: loadedJourneys } = useMemo(
    () => takeJourneys(buildDisplayRows(rows, expanded), visibleJourneys),
    [rows, expanded, visibleJourneys],
  );
  const hasMore = loadedJourneys > visibleJourneys || query.hasNextPage;

  const virtualizer = useVirtualizer({
    count: display.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => ROW_HEIGHT[display[i]?.kind ?? 'event'],
    overscan: 12,
    getItemKey: (i) => display[i]?.key ?? i,
  });

  // "More" asked for journeys we have not loaded yet: fetch the next page.
  useEffect(() => {
    if (visibleJourneys > loadedJourneys && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [visibleJourneys, loadedJourneys, query]);

  useEffect(() => {
    if (focusRequest > 0) scroller.current?.querySelector<HTMLElement>('button')?.focus();
  }, [focusRequest]);

  if (query.isLoading) return <RowSkeletons rows={8} height="h-9" />;
  if (query.error) {
    return (
      <div className="p-3">
        <ErrorCard error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (rows.length === 0) {
    return hasActiveFilters(filters) ? (
      <EmptyState
        icon={<MessageSquareText />}
        message={t('Nothing matches these filters.')}
        action={
          <Button size="sm" onClick={clearFilters}>
            {t('Clear')}
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<MessageSquareText />}
        message={t('Nothing yet. Ask Loop something.')}
        action={
          <Button size="sm" variant="ghost" onClick={onAsk}>
            {t('Ask')}
          </Button>
        }
      />
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={scroller} role="grid" aria-label={t('Recent')} className="h-full overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {items.map((v) => {
          const d = display[v.index];
          if (!d) return null;
          return (
            <div
              key={v.key}
              data-index={v.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: v.size,
                transform: `translateY(${v.start}px)`,
              }}
            >
              {d.kind === 'day' ? (
                <div className="flex h-7 items-center px-4 text-xs font-medium text-fg-muted">{d.label}</div>
              ) : d.kind === 'journey' ? (
                <JourneyGroup
                  newest={d.newest}
                  count={d.count}
                  expanded={d.expanded}
                  onToggle={() => toggleJourney(d.journeyId, d.defaultExpanded)}
                  onOpen={onOpenJourney}
                />
              ) : (
                <LedgerRow row={d.row} onOpen={onOpenJourney} />
              )}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div className="flex justify-end px-3 py-1.5">
          <button
            type="button"
            onClick={showMore}
            disabled={query.isFetchingNextPage}
            title={t('Show {n} more', { n: RECENT_STEP })}
            className="inline-flex h-6 items-center gap-0.5 rounded-control ps-2 pe-1.5 text-xs font-medium text-fg-subtle transition-colors duration-[120ms] hover:bg-surface-sunken hover:text-fg disabled:opacity-50"
          >
            {query.isFetchingNextPage ? t('Loading…') : t('More')}
            <ChevronDown className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
