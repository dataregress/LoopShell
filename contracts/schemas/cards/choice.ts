import { z } from 'zod';
import { DecisionOption, Uuid } from '../common';
import { CardEnvelope } from './envelope';

/**
 * Disambiguation or a decision with options. The orchestrator returns one
 * instead of guessing between overlapping agents. Selecting an option is an
 * Attention decision (`attentionId`) that continues the same journey.
 */
export const ChoiceCard = CardEnvelope.extend({
  type: z.literal('choice'),
  attentionId: Uuid,
  prompt: z.string().min(1),
  options: z.array(DecisionOption).min(2).max(3),
  /** Set once the user has chosen; the card collapses to a chip. */
  chosenOptionId: z.string().optional(),
}).loose();
export type ChoiceCard = z.infer<typeof ChoiceCard>;
