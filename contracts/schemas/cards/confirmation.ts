import { z } from 'zod';
import { DecisionOption, Evidence, IsoDateTime, Uuid } from '../common';
import { CardEnvelope } from './envelope';

/**
 * A proposal for an action. Nothing executes until the user decides.
 * The decision is relayed with `attention_decide` using `attentionId`; if the
 * panel hides while the proposal is unanswered it appears in Attention.
 */
export const ConfirmationCard = CardEnvelope.extend({
  type: z.literal('confirmation'),
  attentionId: Uuid,
  title: z.string().min(1),
  proposal: z.string().min(1),
  willHappen: z.array(z.string().min(1)).min(1).max(6),
  evidence: z.array(Evidence).max(8).default([]),
  options: z.array(DecisionOption).min(2).max(3),
  allowFreeText: z.boolean().default(true),
  expiresAt: IsoDateTime.optional(),
  /** Set once decided; the card renders read-only with the outcome. */
  decidedOptionId: z.string().optional(),
}).loose();
export type ConfirmationCard = z.infer<typeof ConfirmationCard>;
