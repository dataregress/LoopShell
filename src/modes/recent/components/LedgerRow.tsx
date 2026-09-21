import type { LedgerRow as LedgerRowT } from '@contracts/schemas/ledger';
import { formatFullDateTime, formatRowTime } from '@/lib/dates';
import { Chip } from '@/ui/Chip';
import { StatusGlyph } from './StatusGlyph';

export interface LedgerRowProps {
  row: LedgerRowT;
  onOpen: (journeyId: string) => void;
}

/** 36 px dense row: time · glyph · summary · platform chip. Never editable. */
export function LedgerRow({ row, onOpen }: LedgerRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row.journeyId)}
      className="flex h-9 w-full items-center gap-2.5 ps-7 pe-4 text-start hairline-b hover:bg-surface-sunken"
    >
      <time
        dateTime={row.occurredAt}
        title={formatFullDateTime(row.occurredAt)}
        className="w-11 shrink-0 text-xs text-fg-subtle tabular"
      >
        {formatRowTime(row.occurredAt)}
      </time>
      <StatusGlyph type={row.eventType} />
      <span className="min-w-0 flex-1 truncate text-sm text-fg" title={row.summary}>
        {row.summary}
      </span>
      {row.platform !== 'Loop' && <Chip className="shrink-0">{row.platform}</Chip>}
    </button>
  );
}
