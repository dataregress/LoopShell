import { ChevronDown, ChevronRight } from 'lucide-react';
import type { LedgerRow } from '@contracts/schemas/ledger';
import { AgentChip } from '@/cards';
import { formatFullDateTime, formatRowTime } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { StatusGlyph } from './StatusGlyph';

export interface JourneyGroupProps {
  newest: LedgerRow;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (journeyId: string) => void;
}

/** Journey header row: bold label, agent chip, overall status. →/← expand, Enter opens. */
export function JourneyGroup({ newest, count, expanded, onToggle, onOpen }: JourneyGroupProps) {
  const agentId = newest.agentId === 'loop-orchestrator' ? null : newest.agentId;
  return (
    <div
      role="row"
      className="flex h-9 w-full items-center gap-1.5 ps-2 pe-4 hairline-b hover:bg-surface-sunken"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && !expanded) onToggle();
        if (e.key === 'ArrowLeft' && expanded) onToggle();
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? t('Collapse') : t('Expand')}
        onClick={onToggle}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:text-fg"
      >
        {expanded ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => onOpen(newest.journeyId)}
        className="flex min-w-0 flex-1 items-center gap-2 text-start"
      >
        <time
          dateTime={newest.occurredAt}
          title={formatFullDateTime(newest.occurredAt)}
          className="w-11 shrink-0 text-xs text-fg-subtle tabular"
        >
          {formatRowTime(newest.occurredAt)}
        </time>
        <StatusGlyph type={newest.eventType} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg" title={newest.object.label}>
          {newest.object.label}
        </span>
        {agentId && <AgentChip agentId={agentId} className="shrink-0" />}
        {!expanded && count > 1 && <span className="shrink-0 text-xs text-fg-subtle tabular">{count}</span>}
      </button>
    </div>
  );
}
