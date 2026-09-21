import { randomUUID } from 'node:crypto';
import { ATTENTION_ITEMS } from '../../../contracts/fixtures/attention';
import { JOURNEYS } from '../../../contracts/fixtures/journeys';
import { LEDGER_ROWS, generateLedgerRows } from '../../../contracts/fixtures/ledger';
import { ME, ME_UPN, TENANT_ID } from '../../../contracts/fixtures/people';
import { agentInfo } from '../../../contracts/registry/agents';
import type { AttentionItem } from '../../../contracts/schemas/attention';
import type { Card } from '../../../contracts/schemas/cards';
import type { A2AState } from '../../../contracts/schemas/events';
import type { JourneyStatus, JourneyThread } from '../../../contracts/schemas/journey';
import type { LedgerFilters, LedgerPage, LedgerRow } from '../../../contracts/schemas/ledger';
import type { Session } from '../../../contracts/schemas/session';
import { A2A_TO_JOURNEY } from '../../../contracts/a2a/state-map';
import type { Realtime } from './realtime';

export interface Knobs {
  latencyMs: number;
  failNextAsk: boolean;
  conflictNextDecision: boolean;
  dropRealtime: boolean;
}

export interface Decision {
  optionId: string;
  freeText?: string;
}

interface Waiter {
  resolve: (d: Decision) => void;
  reject: (err: Error) => void;
}

export interface JourneyRun {
  thread: JourneyThread;
  taskId: string;
  cancelled: boolean;
  timers: Set<ReturnType<typeof setTimeout>>;
}

/** Everything the mock knows. In memory; restart resets. */
export class State {
  readonly user = ME;
  readonly knobs: Knobs = { latencyMs: 600, failNextAsk: false, conflictNextDecision: false, dropRealtime: false };
  readonly journeys = new Map<string, JourneyRun>();
  readonly attention = new Map<string, AttentionItem>();
  readonly waiters = new Map<string, Waiter>();
  readonly seenIdempotency = new Map<string, { attentionId: string; optionId: string }>();
  /** Newest first. */
  ledger: LedgerRow[];

  constructor(readonly realtime: Realtime) {
    for (const j of JOURNEYS) {
      this.journeys.set(j.journeyId, { thread: structuredClone(j), taskId: `t-${j.journeyId.slice(-4)}`, cancelled: false, timers: new Set() });
    }
    for (const a of ATTENTION_ITEMS) this.attention.set(a.attentionId, structuredClone(a));
    this.ledger = [...LEDGER_ROWS, ...generateLedgerRows(10_000)].sort(
      (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
    );
  }

  session(): Session {
    return {
      state: 'signed_in',
      userId: this.user.userId,
      displayName: this.user.displayName,
      upn: ME_UPN,
      tenantId: TENANT_ID,
      expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
    };
  }

  // ---- Journeys -----------------------------------------------------------

  createJourney(text: string, journeyId?: string): JourneyRun {
    const existing = journeyId ? this.journeys.get(journeyId) : undefined;
    const taskId = `t-${randomUUID().slice(0, 8)}`;
    if (existing) {
      existing.taskId = taskId;
      existing.cancelled = false;
      existing.thread.status = 'received';
      existing.thread.updatedAt = new Date().toISOString();
      return existing;
    }
    const now = new Date().toISOString();
    const run: JourneyRun = {
      thread: { journeyId: journeyId ?? randomUUID(), createdAt: now, updatedAt: now, status: 'received', ask: text, cards: [], decisions: [] },
      taskId,
      cancelled: false,
      timers: new Set(),
    };
    this.journeys.set(run.thread.journeyId, run);
    return run;
  }

  /** Emit `journey.updated` and mirror it into the thread read model. */
  task(run: JourneyRun, state: A2AState, opts: { agentId?: string; cards?: Card[]; message?: string } = {}): void {
    if (run.cancelled && state !== 'canceled') return;
    const t = run.thread;
    t.status = A2A_TO_JOURNEY[state] as JourneyStatus;
    t.updatedAt = new Date().toISOString();
    if (opts.agentId) t.agentId = opts.agentId;
    if (opts.message !== undefined) t.message = opts.message;
    for (const card of opts.cards ?? []) {
      const i = t.cards.findIndex((c) => c.cardId === card.cardId);
      if (i >= 0) t.cards[i] = card;
      else t.cards.push(card);
    }
    this.realtime.publish('journey.updated', {
      journeyId: t.journeyId,
      taskId: run.taskId,
      state,
      agentId: opts.agentId ?? t.agentId,
      cards: opts.cards ?? [],
      message: opts.message,
    });
  }

  journey(journeyId: string): JourneyThread | undefined {
    const run = this.journeys.get(journeyId);
    if (run) return run.thread;
    // Synthesize a read-only thread from Ledger rows for fixture journeys.
    const rows = this.ledger.filter((r) => r.journeyId === journeyId);
    if (rows.length === 0) return undefined;
    const newest = rows[0]!;
    const oldest = rows[rows.length - 1]!;
    const status: JourneyStatus =
      newest.eventType === 'executed' || newest.eventType === 'confirmed'
        ? 'completed'
        : newest.eventType === 'proposed'
          ? 'waiting_on_user'
          : newest.eventType === 'failed'
            ? 'failed'
            : newest.eventType === 'expired'
              ? 'expired'
              : 'cancelled';
    return {
      journeyId,
      createdAt: oldest.occurredAt,
      updatedAt: newest.occurredAt,
      status,
      ask: `${oldest.action.replaceAll('_', ' ')} · ${oldest.object.label}`,
      agentId: rows.find((r) => r.agentId !== 'loop-orchestrator')?.agentId,
      cards: [],
      decisions: rows
        .filter((r) => r.eventType === 'confirmed')
        .map((r) => ({ attentionId: randomUUID(), optionId: 'confirm', optionLabel: r.summary, decidedAt: r.occurredAt, by: r.actor })),
      message: newest.summary,
    };
  }

  cancel(taskId: string): boolean {
    for (const run of this.journeys.values()) {
      if (run.taskId !== taskId) continue;
      run.cancelled = true;
      for (const timer of run.timers) clearTimeout(timer);
      run.timers.clear();
      for (const [id, item] of this.attention) {
        if (item.journeyId === run.thread.journeyId && item.state === 'open' && this.waiters.has(id)) {
          item.state = 'decided';
          this.waiters.get(id)?.reject(new Error('cancelled'));
          this.waiters.delete(id);
          this.realtime.publish('attention.resolved', { attentionId: id });
        }
      }
      this.task(run, 'canceled', { message: 'Cancelled.' });
      return true;
    }
    return false;
  }

  // ---- Attention ----------------------------------------------------------

  openAttention(): AttentionItem[] {
    const now = Date.now();
    const out: AttentionItem[] = [];
    for (const item of this.attention.values()) {
      if (item.state === 'decided') continue;
      if (item.state === 'open' && Date.parse(item.expiresAt) <= now) item.state = 'expired';
      out.push(item);
    }
    return out;
  }

  addAttention(item: AttentionItem, options: { pop?: boolean } = {}): AttentionItem {
    this.attention.set(item.attentionId, item);
    if (options.pop !== false) this.realtime.publish('attention.created', { item });
    return item;
  }

  /** Resolve when the user decides; reject on cancel/expiry. */
  awaitDecision(attentionId: string): Promise<Decision> {
    return new Promise((resolve, reject) => {
      this.waiters.set(attentionId, { resolve, reject });
    });
  }

  decide(attentionId: string, decision: string, freeText: string | undefined, idempotencyKey: string): 'accepted' | 'conflict' | 'not_found' {
    const seen = this.seenIdempotency.get(idempotencyKey);
    if (seen) return 'accepted';
    const item = this.attention.get(attentionId);
    if (!item) return 'not_found';
    if (this.knobs.conflictNextDecision) {
      this.knobs.conflictNextDecision = false;
      return 'conflict';
    }
    if (item.state !== 'open' || Date.parse(item.expiresAt) <= Date.now()) return 'conflict';
    item.state = 'decided';
    item.decision = { optionId: decision, decidedAt: new Date().toISOString(), by: this.user };
    this.seenIdempotency.set(idempotencyKey, { attentionId, optionId: decision });
    const run = this.journeys.get(item.journeyId);
    if (run) {
      const label = item.options.find((o) => o.optionId === decision)?.label ?? (decision === 'reject' ? 'Rejected' : decision);
      run.thread.decisions.push({ attentionId, optionId: decision, optionLabel: label, freeText, decidedAt: item.decision.decidedAt, by: this.user });
      for (const c of run.thread.cards) {
        if (c.type === 'choice' && c.attentionId === attentionId) c.chosenOptionId = decision;
        if (c.type === 'confirmation' && c.attentionId === attentionId) c.decidedOptionId = decision;
      }
    }
    this.realtime.publish('attention.resolved', { attentionId });
    const waiter = this.waiters.get(attentionId);
    if (waiter) {
      this.waiters.delete(attentionId);
      waiter.resolve({ optionId: decision, freeText });
    }
    return 'accepted';
  }

  expire(attentionId: string): void {
    const item = this.attention.get(attentionId);
    if (!item || item.state !== 'open') return;
    item.state = 'expired';
    this.realtime.publish('attention.expired', { attentionId });
    const waiter = this.waiters.get(attentionId);
    if (waiter) {
      this.waiters.delete(attentionId);
      waiter.reject(new Error('expired'));
    }
  }

  // ---- Ledger -------------------------------------------------------------

  appendLedger(row: Omit<LedgerRow, 'eventId' | 'occurredAt'> & { occurredAt?: string }): LedgerRow {
    const full: LedgerRow = { eventId: randomUUID(), occurredAt: new Date().toISOString(), ...row };
    this.ledger.unshift(full);
    this.realtime.publish('ledger.appended', { row: full });
    return full;
  }

  queryLedger(filters: LedgerFilters, cursor: string | undefined, limit: number): LedgerPage {
    const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const rows: LedgerRow[] = [];
    let i = start;
    for (; i < this.ledger.length && rows.length < limit; i += 1) {
      const r = this.ledger[i]!;
      if (filters.platforms.length && !filters.platforms.includes(r.platform)) continue;
      if (filters.statuses.length && !filters.statuses.includes(r.eventType)) continue;
      if (filters.scope === 'mine' && r.actor.userId !== this.user.userId) continue;
      if (filters.scope === 'routed' && !r.routedToUser) continue;
      rows.push(r);
    }
    return { rows, nextCursor: i < this.ledger.length ? String(i) : undefined };
  }

  platformOf(agentId: string): string {
    return agentInfo(agentId).platform;
  }
}
