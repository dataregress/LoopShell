import { z } from 'zod';
import { Card } from './cards';
import { AgentId, IsoDateTime, Person, Uuid } from './common';

/** Journey lifecycle (docs/design-brief.md §3.1). */
export const JourneyStatus = z.enum([
  'received',
  'routed',
  'running',
  'waiting_on_user',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);
export type JourneyStatus = z.infer<typeof JourneyStatus>;

export const JourneyDecision = z.object({
  attentionId: Uuid,
  optionId: z.string(),
  optionLabel: z.string(),
  freeText: z.string().optional(),
  decidedAt: IsoDateTime,
  by: Person,
});
export type JourneyDecision = z.infer<typeof JourneyDecision>;

/** Read model for `journey_get`: enough to render a read-only Ask thread. */
export const JourneyThread = z.object({
  journeyId: Uuid,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  status: JourneyStatus,
  ask: z.string().min(1),
  agentId: AgentId.optional(),
  cards: z.array(Card).default([]),
  decisions: z.array(JourneyDecision).default([]),
  message: z.string().optional(),
});
export type JourneyThread = z.infer<typeof JourneyThread>;
