import { Check, ListChecks } from 'lucide-react';
import { useId } from 'react';
import type { ChoiceCard } from '@contracts/schemas/cards';
import { t } from '@/lib/i18n';
import { Chip } from '@/ui/Chip';
import { CardFrame } from './CardFrame';
import { OptionGroup } from './OptionGroup';

export interface ChoiceProps {
  card: ChoiceCard;
  onDecide?: (attentionId: string, optionId: string) => void;
  pendingOptionId?: string | null;
  disabled?: boolean;
}

/** Disambiguation. Collapses to a one-line "Chose: ServiceNow" chip once decided. */
export function Choice({ card, onDecide, pendingOptionId = null, disabled = false }: ChoiceProps) {
  const promptId = useId();
  if (card.chosenOptionId) {
    const chosen = card.options.find((o) => o.optionId === card.chosenOptionId);
    return (
      <div className="flex justify-start">
        <Chip tone="info" icon={<Check className="size-3.5" aria-hidden />}>
          {t('Chose: {option}', { option: chosen?.label ?? card.chosenOptionId })}
        </Chip>
      </div>
    );
  }
  return (
    <CardFrame title={t('Which route?')} icon={<ListChecks />} agentId={card.agentId}>
      <p id={promptId} className="mb-3 text-fg-muted">
        {card.prompt}
      </p>
      <OptionGroup
        label={t('Options')}
        describedBy={promptId}
        options={card.options}
        showDescriptions
        primaryOptionId={card.options.find((o) => o.recommended)?.optionId ?? '__none__'}
        disabled={disabled || !onDecide}
        pendingOptionId={pendingOptionId}
        onSelect={(optionId) => onDecide?.(card.attentionId, optionId)}
      />
    </CardFrame>
  );
}
