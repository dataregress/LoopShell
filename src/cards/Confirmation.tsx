import { Check, Hourglass, ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import type { ConfirmationCard } from '@contracts/schemas/cards';
import { formatTtl } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { renderInline } from '@/lib/inline';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Input } from '@/ui/Input';
import { CardFrame } from './CardFrame';
import { EvidenceList } from './EvidenceList';
import { OptionGroup } from './OptionGroup';

export interface ConfirmationProps {
  card: ConfirmationCard;
  onDecide?: (attentionId: string, optionId: string, freeText?: string) => void;
  pendingOptionId?: string | null;
  disabled?: boolean;
}

/** Proposal for an action. Nothing executes until the user decides. */
export function Confirmation({ card, onDecide, pendingOptionId = null, disabled = false }: ConfirmationProps) {
  const evidenceId = useId();
  const [note, setNote] = useState('');
  const ttl = card.expiresAt ? formatTtl(card.expiresAt) : null;
  const decided = card.decidedOptionId !== undefined;
  const expired = !decided && (ttl?.expired ?? false);
  const readOnly = decided || expired || disabled || !onDecide;
  const decidedLabel = card.options.find((o) => o.optionId === card.decidedOptionId)?.label ?? card.decidedOptionId;

  return (
    <CardFrame
      title={card.title}
      icon={<ShieldCheck />}
      agentId={card.agentId}
      footer={
        decided ? (
          <Chip tone="success" icon={<Check className="size-3.5" aria-hidden />}>
            {decidedLabel === 'reject' ? t('Rejected') : t('Confirmed: {option}', { option: decidedLabel ?? '' })}
          </Chip>
        ) : expired ? (
          <Chip tone="neutral" icon={<Hourglass className="size-3.5" aria-hidden />}>
            {t('Expired')}
          </Chip>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {card.allowFreeText && (
              <Input
                aria-label={t('Add a note or ask for more…')}
                placeholder={t('Add a note or ask for more…')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={readOnly}
              />
            )}
            <OptionGroup
              label={t('Decision')}
              describedBy={evidenceId}
              options={card.options}
              layout="row"
              disabled={readOnly}
              pendingOptionId={pendingOptionId}
              onSelect={(optionId) => onDecide?.(card.attentionId, optionId, note.trim() || undefined)}
            />
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                variant="ghost"
                disabled={readOnly}
                loading={pendingOptionId === 'reject'}
                onClick={() => onDecide?.(card.attentionId, 'reject', note.trim() || undefined)}
              >
                {t('Reject')}
              </Button>
              {ttl && !ttl.expired && (
                <span className={ttl.urgent ? 'text-xs text-warning tabular' : 'text-xs text-fg-subtle tabular'}>
                  {t('Expires in {ttl}', { ttl: ttl.label })}
                </span>
              )}
            </div>
          </div>
        )
      }
    >
      <p className="text-fg">{renderInline(card.proposal)}</p>
      <h4 className="mt-3 mb-1 text-xs text-fg-muted">{t('What will happen')}</h4>
      <ul className="list-disc space-y-0.5 ps-5 text-sm text-fg">
        {card.willHappen.map((w, i) => (
          <li key={i}>{renderInline(w)}</li>
        ))}
      </ul>
      {card.evidence.length > 0 && (
        <>
          <h4 className="mt-3 mb-1 text-xs text-fg-muted">{t('Checked')}</h4>
          <EvidenceList id={evidenceId} items={card.evidence} />
        </>
      )}
    </CardFrame>
  );
}
