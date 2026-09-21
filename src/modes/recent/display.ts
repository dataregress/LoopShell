import type { LedgerRow } from '@contracts/schemas/ledger';
import { dayKey, formatDayLabel } from '@/lib/dates';

export type DisplayRow =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'journey';
      key: string;
      journeyId: string;
      newest: LedgerRow;
      count: number;
      expanded: boolean;
      defaultExpanded: boolean;
    }
  | { kind: 'event'; key: string; row: LedgerRow };

export const ROW_HEIGHT = { day: 28, journey: 36, event: 36 } as const;
export const DEFAULT_EXPANDED_JOURNEYS = 3;
/** Recent shows this many journeys first; "More" reveals `RECENT_STEP` more (docs/ui-ux.md §3.6). */
export const RECENT_INITIAL = 10;
export const RECENT_STEP = 5;

/**
 * Flatten Ledger rows (newest first) into day separators, journey headers and
 * event rows. A journey is placed at the time of its newest event; the latest
 * three journeys are expanded by default (docs/ui-ux.md §3.6).
 */
export function buildDisplayRows(
  rows: LedgerRow[],
  expanded: Record<string, boolean>,
  now = new Date(),
): DisplayRow[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const g = groups.get(r.journeyId);
    if (g) g.push(r);
    else groups.set(r.journeyId, [r]);
  }
  const out: DisplayRow[] = [];
  let lastDay: string | null = null;
  let index = 0;
  for (const [journeyId, events] of groups) {
    const newest = events[0]!;
    const day = dayKey(newest.occurredAt);
    if (day !== lastDay) {
      out.push({ kind: 'day', key: `day-${day}`, label: formatDayLabel(newest.occurredAt, now) });
      lastDay = day;
    }
    const defaultExpanded = index < DEFAULT_EXPANDED_JOURNEYS;
    const isExpanded = expanded[journeyId] ?? defaultExpanded;
    out.push({
      kind: 'journey',
      key: `j-${journeyId}`,
      journeyId,
      newest,
      count: events.length,
      expanded: isExpanded,
      defaultExpanded,
    });
    if (isExpanded) {
      for (const row of events) out.push({ kind: 'event', key: `e-${row.eventId}`, row });
    }
    index += 1;
  }
  return out;
}

/**
 * Keep the first `max` journeys (with their events) and only the day
 * separators that still introduce something. `total` is how many journeys
 * the full list had, so the caller knows whether there is more to reveal.
 */
export function takeJourneys(rows: DisplayRow[], max: number): { rows: DisplayRow[]; total: number } {
  const out: DisplayRow[] = [];
  let total = 0;
  let cut = false;
  for (const r of rows) {
    if (r.kind === 'journey') {
      total += 1;
      if (total > max) cut = true;
    }
    if (!cut) out.push(r);
  }
  if (out.at(-1)?.kind === 'day') out.pop();
  return { rows: out, total };
}
