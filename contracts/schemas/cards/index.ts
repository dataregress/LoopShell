import { z } from 'zod';
import { ChoiceCard } from './choice';
import { ConfirmationCard } from './confirmation';
import type { CardType } from './envelope';
import { LinkCard } from './link';
import { RecordCard } from './record';
import { SummaryCard } from './summary';
import { TableCard } from './table';

export { CardEnvelope, CardType } from './envelope';
export { SummaryCard } from './summary';
export { RecordCard } from './record';
export { TableCard, TableColumn } from './table';
export { ChoiceCard } from './choice';
export { ConfirmationCard } from './confirmation';
export { LinkCard } from './link';

/** Any card. Discriminated on `type`; unknown types fail to parse. */
export const Card = z.discriminatedUnion('type', [
  SummaryCard,
  RecordCard,
  TableCard,
  ChoiceCard,
  ConfirmationCard,
  LinkCard,
]);
export type Card = z.infer<typeof Card>;

export type CardOfType<T extends CardType> = Extract<Card, { type: T }>;

export interface CardParseFailure {
  cardId: string | undefined;
  type: string | undefined;
  issues: string;
}

export interface CardParseResult {
  cards: Card[];
  dropped: CardParseFailure[];
}

/**
 * Parse a list of inbound cards leniently: valid cards are kept in order,
 * invalid or unknown-typed cards are dropped and reported so the caller can log.
 * This is the "unknown types are dropped and logged" invariant.
 */
export function parseCards(input: unknown): CardParseResult {
  const result: CardParseResult = { cards: [], dropped: [] };
  if (!Array.isArray(input)) return result;
  for (const raw of input) {
    const parsed = Card.safeParse(raw);
    if (parsed.success) {
      result.cards.push(parsed.data);
    } else {
      const obj = (raw ?? {}) as Record<string, unknown>;
      result.dropped.push({
        cardId: typeof obj.cardId === 'string' ? obj.cardId : undefined,
        type: typeof obj.type === 'string' ? obj.type : undefined,
        issues: z.prettifyError(parsed.error),
      });
    }
  }
  return result;
}
