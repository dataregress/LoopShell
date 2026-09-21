import { AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import type { SummaryCard } from '@contracts/schemas/cards';
import { t } from '@/lib/i18n';
import { renderInline } from '@/lib/inline';
import { Button } from '@/ui/Button';
import { CardFrame } from './CardFrame';
import { LinkAction } from './LinkAction';

export interface SummaryProps {
  card: SummaryCard;
  onRetry?: () => void;
}

export function Summary({ card, onRetry }: SummaryProps) {
  const Icon = card.tone === 'failure' ? AlertCircle : card.tone === 'success' ? CheckCircle2 : FileText;
  const footer =
    card.link || (card.tone === 'failure' && card.retryable && onRetry) ? (
      <>
        {card.tone === 'failure' && card.retryable && onRetry && (
          <Button size="sm" variant="primary" onClick={onRetry}>
            {t('Try again')}
          </Button>
        )}
        {card.link && <LinkAction url={card.link.url} label={card.link.label} platform={card.link.platform} />}
      </>
    ) : undefined;

  return (
    <CardFrame title={card.title} icon={<Icon />} agentId={card.agentId} tone={card.tone} footer={footer}>
      <div className="space-y-2">
        {card.paragraphs.map((p, i) => (
          <p key={i} className="text-fg-muted [&_strong]:text-fg">
            {renderInline(p)}
          </p>
        ))}
      </div>
    </CardFrame>
  );
}
