import type { Card } from '@contracts/schemas/cards';
import { log } from '@/lib/log';
import { Choice } from './Choice';
import { Confirmation } from './Confirmation';
import { Link } from './Link';
import { Record } from './Record';
import { Summary } from './Summary';
import { Table } from './Table';

export interface CardRendererProps {
  card: Card;
  /** Decide an inline `choice` / `confirmation`. Absent = read-only. */
  onDecide?: (attentionId: string, optionId: string, freeText?: string) => void;
  pendingOptionId?: string | null;
  decisionsDisabled?: boolean;
  onRetry?: () => void;
}

/** Switches on `card.type`. The default branch logs and renders nothing. */
export function CardRenderer({ card, onDecide, pendingOptionId, decisionsDisabled, onRetry }: CardRendererProps) {
  switch (card.type) {
    case 'summary':
      return <Summary card={card} onRetry={onRetry} />;
    case 'record':
      return <Record card={card} />;
    case 'table':
      return <Table card={card} />;
    case 'choice':
      return (
        <Choice
          card={card}
          onDecide={onDecide ? (a, o) => onDecide(a, o) : undefined}
          pendingOptionId={pendingOptionId}
          disabled={decisionsDisabled}
        />
      );
    case 'confirmation':
      return (
        <Confirmation
          card={card}
          onDecide={onDecide}
          pendingOptionId={pendingOptionId}
          disabled={decisionsDisabled}
        />
      );
    case 'link':
      return <Link card={card} />;
    default: {
      const unknown = card as { type?: string; cardId?: string };
      log.warn('unknown card type dropped', { type: unknown.type, cardId: unknown.cardId });
      return null;
    }
  }
}
