import { z } from 'zod';
import { AgentId, IsoDateTime, Uuid } from '../common';

/** The six card types. Closed set; see docs/design-brief.md §3.3. */
export const CardType = z.enum(['summary', 'record', 'table', 'choice', 'confirmation', 'link']);
export type CardType = z.infer<typeof CardType>;

/** Fields every card carries. Per-type payloads extend this envelope. */
export const CardEnvelope = z.object({
  cardId: Uuid,
  agentId: AgentId,
  journeyId: Uuid,
  taskId: z.string().optional(),
  createdAt: IsoDateTime,
  type: CardType,
});
export type CardEnvelope = z.infer<typeof CardEnvelope>;
