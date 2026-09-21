import { describe, expect, it } from 'vitest';
import { LEDGER_ROWS } from '@contracts/fixtures/ledger';
import { buildDisplayRows, takeJourneys } from './display';

describe('buildDisplayRows', () => {
  it('groups by journey, expands the latest three, and inserts day separators', () => {
    const rows = buildDisplayRows(LEDGER_ROWS, {});
    const journeys = rows.filter((r) => r.kind === 'journey');
    expect(journeys.length).toBeGreaterThanOrEqual(4);
    expect(journeys.slice(0, 3).every((j) => j.kind === 'journey' && j.expanded)).toBe(true);
    expect(journeys.slice(3).every((j) => j.kind === 'journey' && !j.expanded)).toBe(true);
    expect(rows[0]?.kind).toBe('day');
    const days = rows.filter((r) => r.kind === 'day').map((r) => (r.kind === 'day' ? r.label : ''));
    expect(days[0]).toBe('Today');
    expect(new Set(days).size).toBe(days.length);
  });

  it('honours explicit expand/collapse', () => {
    const first = buildDisplayRows(LEDGER_ROWS, {}).find((r) => r.kind === 'journey');
    if (first?.kind !== 'journey') throw new Error('no journey');
    const collapsed = buildDisplayRows(LEDGER_ROWS, { [first.journeyId]: false });
    const header = collapsed.find((r) => r.kind === 'journey' && r.journeyId === first.journeyId);
    expect(header?.kind === 'journey' && header.expanded).toBe(false);
    const events = collapsed.filter((r) => r.kind === 'event' && r.row.journeyId === first.journeyId);
    expect(events).toHaveLength(0);
  });
});

describe('takeJourneys', () => {
  const all = buildDisplayRows(LEDGER_ROWS, {});
  const totalJourneys = all.filter((r) => r.kind === 'journey').length;

  it('keeps the first N journeys with their events and reports the total', () => {
    const { rows, total } = takeJourneys(all, 2);
    expect(total).toBe(totalJourneys);
    const journeys = rows.filter((r) => r.kind === 'journey');
    expect(journeys).toHaveLength(2);
    const keptIds = new Set(journeys.map((j) => (j.kind === 'journey' ? j.journeyId : '')));
    for (const r of rows) {
      if (r.kind === 'event') expect(keptIds.has(r.row.journeyId)).toBe(true);
    }
  });

  it('never ends on a day separator with nothing under it', () => {
    for (let n = 1; n <= totalJourneys; n += 1) {
      expect(takeJourneys(all, n).rows.at(-1)?.kind).not.toBe('day');
    }
  });

  it('returns everything when the limit is not reached', () => {
    const { rows } = takeJourneys(all, totalJourneys + 5);
    expect(rows).toEqual(all);
  });
});
