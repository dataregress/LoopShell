import { z } from 'zod';
import { AgentId, IsoDateTime, LinkRef, Person, Platform, Uuid } from './common';

/** Only the orchestrator emits `confirmed`. */
export const LedgerEventType = z.enum(['proposed', 'confirmed', 'executed', 'failed', 'cancelled', 'expired']);
export type LedgerEventType = z.infer<typeof LedgerEventType>;

export const LedgerObject = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1),
  link: LinkRef.optional(),
});
export type LedgerObject = z.infer<typeof LedgerObject>;

/** One immutable row of the user's Ledger. */
export const LedgerRow = z.object({
  eventId: Uuid,
  eventType: LedgerEventType,
  occurredAt: IsoDateTime,
  journeyId: Uuid,
  agentId: AgentId,
  platform: Platform,
  action: z.string().min(1),
  object: LedgerObject,
  summary: z.string().min(1),
  actor: Person,
  /** Set when this row was routed to the user rather than started by them. */
  routedToUser: z.boolean().optional(),
});
export type LedgerRow = z.infer<typeof LedgerRow>;

export const LedgerScope = z.enum(['all', 'mine', 'routed']);
export type LedgerScope = z.infer<typeof LedgerScope>;

export const LedgerFilters = z.object({
  platforms: z.array(Platform).default([]),
  statuses: z.array(LedgerEventType).default([]),
  scope: LedgerScope.default('all'),
});
export type LedgerFilters = z.infer<typeof LedgerFilters>;

export const LedgerQuery = z.object({
  filters: LedgerFilters,
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
export type LedgerQuery = z.infer<typeof LedgerQuery>;

export const LedgerPage = z.object({
  rows: z.array(LedgerRow),
  nextCursor: z.string().optional(),
});
export type LedgerPage = z.infer<typeof LedgerPage>;
