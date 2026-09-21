import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../../fixtures/cards';
import { ATTENTION_ITEMS, signInAgain } from '../../fixtures/attention';
import { JOURNEYS } from '../../fixtures/journeys';
import { LEDGER_ROWS, generateLedgerRows } from '../../fixtures/ledger';
import { AttentionDecision, AttentionItem } from '../attention';
import { Card, parseCards } from '../cards';
import { JourneyThread } from '../journey';
import { LedgerRow } from '../ledger';
import { DEFAULT_SETTINGS, Settings } from '../settings';

describe('card fixtures', () => {
  for (const [name, card] of Object.entries(ALL_CARDS)) {
    it(`${name} parses`, () => {
      const result = Card.safeParse(card);
      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
    });
  }

  it('parseCards keeps valid cards and drops unknown types with a reason', () => {
    const unknown = { ...ALL_CARDS.summaryNeutral, cardId: 'c1000000-0000-4000-8000-0000000000ff', type: 'chart' };
    const malformed = { type: 'record', cardId: 'not-a-uuid' };
    const result = parseCards([ALL_CARDS.summaryNeutral, unknown, malformed, ALL_CARDS.recordIncident]);
    expect(result.cards.map((c) => c.cardId)).toEqual([
      ALL_CARDS.summaryNeutral.cardId,
      ALL_CARDS.recordIncident.cardId,
    ]);
    expect(result.dropped).toHaveLength(2);
    expect(result.dropped[0]?.type).toBe('chart');
    expect(result.dropped[1]?.cardId).toBe('not-a-uuid');
  });

  it('parseCards tolerates non-array input', () => {
    expect(parseCards(undefined).cards).toEqual([]);
    expect(parseCards(null).cards).toEqual([]);
  });

  it('cards accept unknown extra fields (forward compatibility)', () => {
    const withExtra = { ...ALL_CARDS.linkServiceNow, futureField: 1 };
    expect(Card.safeParse(withExtra).success).toBe(true);
  });
});

describe('attention fixtures', () => {
  for (const item of [...ATTENTION_ITEMS, signInAgain]) {
    it(`${item.title} parses`, () => {
      const result = AttentionItem.safeParse(item);
      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
    });
  }

  it('decisions are strict', () => {
    const ok = AttentionDecision.safeParse({
      attentionId: ATTENTION_ITEMS[0]!.attentionId,
      decision: 'approve',
      decidedAt: new Date().toISOString(),
      idempotencyKey: 'b1000000-0000-4000-8000-0000000000aa',
    });
    expect(ok.success).toBe(true);
    const extra = AttentionDecision.safeParse({
      attentionId: ATTENTION_ITEMS[0]!.attentionId,
      decision: 'approve',
      decidedAt: new Date().toISOString(),
      idempotencyKey: 'b1000000-0000-4000-8000-0000000000aa',
      surprise: true,
    });
    expect(extra.success).toBe(false);
  });
});

describe('ledger fixtures', () => {
  it('curated rows parse', () => {
    for (const r of LEDGER_ROWS) {
      const result = LedgerRow.safeParse(r);
      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
    }
  });

  it('generated rows parse and are deterministic', () => {
    const a = generateLedgerRows(500, 7);
    const b = generateLedgerRows(500, 7);
    expect(a.map((r) => r.summary)).toEqual(b.map((r) => r.summary));
    for (const r of a.slice(0, 50)) expect(LedgerRow.safeParse(r).success).toBe(true);
    // newest first
    for (let i = 1; i < a.length; i += 1) {
      expect(Date.parse(a[i - 1]!.occurredAt)).toBeGreaterThanOrEqual(Date.parse(a[i]!.occurredAt));
    }
  });
});

describe('journeys and settings', () => {
  it('journey threads parse', () => {
    for (const j of JOURNEYS) expect(JourneyThread.safeParse(j).success).toBe(true);
  });
  it('default settings parse', () => {
    expect(Settings.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });
});
