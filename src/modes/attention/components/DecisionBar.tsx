import type { AttentionItem } from '@contracts/schemas/attention';
import { OptionGroup } from '@/cards';
import { useNow } from '@/hooks/useNow';
import { t } from '@/lib/i18n';
import { useAttentionStore } from '@/stores/attention';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';

export interface DecisionBarProps {
  item: AttentionItem;
  onDecide: (optionId: string, note?: string) => void;
  pendingOptionId: string | null;
  disabled: boolean;
  evidenceId?: string;
}

/**
 * 2-3 option buttons (primary = recommended), free-text reply sent with any
 * option, and a secondary Reject (docs/ui-ux.md §3.5). `auth` items show one action.
 */
export function DecisionBar({ item, onDecide, pendingOptionId, disabled, evidenceId }: DecisionBarProps) {
  const note = useAttentionStore((s) => s.notes[item.attentionId] ?? '');
  const setNote = useAttentionStore((s) => s.setNote);
  const now = useNow(1000);
  const readOnly = disabled || item.state !== 'open' || Date.parse(item.expiresAt) <= now;

  if (item.kind === 'auth') {
    const only = item.options[0];
    return (
      <div className="border-t border-border p-3">
        <Button
          variant="primary"
          block
          disabled={readOnly}
          loading={pendingOptionId === only?.optionId}
          onClick={() => only && onDecide(only.optionId)}
        >
          {only?.label ?? t('Sign in')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      {item.allowFreeText && (
        <Input
          aria-label={t('Add a note or ask for more…')}
          placeholder={t('Add a note or ask for more…')}
          value={note}
          disabled={readOnly}
          onChange={(e) => setNote(item.attentionId, e.target.value)}
        />
      )}
      <OptionGroup
        label={t('Decision')}
        describedBy={evidenceId}
        options={item.options}
        layout="row"
        disabled={readOnly}
        pendingOptionId={pendingOptionId}
        onSelect={(optionId) => onDecide(optionId, note.trim() || undefined)}
      />
      <div>
        <Button
          size="sm"
          variant="ghost"
          disabled={readOnly}
          loading={pendingOptionId === 'reject'}
          onClick={() => onDecide('reject', note.trim() || undefined)}
        >
          {t('Reject')}
        </Button>
      </div>
    </div>
  );
}
