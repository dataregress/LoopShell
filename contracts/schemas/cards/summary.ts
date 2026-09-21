import { z } from 'zod';
import { LinkRef, Tone } from '../common';
import { CardEnvelope } from './envelope';

/**
 * Short answer or status. `tone` tints the left rule; `failure` is also used
 * for the A2A `failed` / `rejected` / `canceled` states.
 * Text supports **bold** and `inline code` only.
 */
export const SummaryCard = CardEnvelope.extend({
  type: z.literal('summary'),
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1).max(3),
  tone: Tone.default('neutral'),
  link: LinkRef.optional(),
  /** Present on failure summaries when the ask can be retried. */
  retryable: z.boolean().optional(),
}).loose();
export type SummaryCard = z.infer<typeof SummaryCard>;
