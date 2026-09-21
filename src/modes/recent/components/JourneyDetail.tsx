import { motion } from 'motion/react';
import { useJourney } from '@/hooks/useLedger';
import { CardRenderer } from '@/cards';
import { formatFullDateTime } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { HandoffChip } from '@/modes/ask/components/HandoffChip';
import { UserBubble } from '@/modes/ask/components/UserBubble';
import { Button } from '@/ui/Button';
import { ErrorCard } from '@/ui/ErrorCard';
import { useMotionPresets } from '@/ui/motion';
import { CardSkeleton } from '@/ui/Skeleton';

export interface JourneyDetailProps {
  journeyId: string;
  onContinueInAsk: (journeyId: string) => void;
}

const STATUS_COPY: Record<string, string> = {
  received: 'Received',
  routed: 'Routed',
  running: 'Running',
  waiting_on_user: 'Waiting on you',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/** Read-only Ask thread with the decisions taken and links to the systems of record. */
export function JourneyDetail({ journeyId, onContinueInAsk }: JourneyDetailProps) {
  const m = useMotionPresets();
  const query = useJourney(journeyId);
  if (query.isLoading) {
    return (
      <div className="p-3">
        <CardSkeleton />
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="p-3">
        <ErrorCard error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  const j = query.data;
  const isOpen = j.status === 'waiting_on_user' || j.status === 'running' || j.status === 'routed' || j.status === 'received';

  return (
    <motion.div
      variants={m.staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col gap-2 overflow-y-auto px-3 py-3"
    >
      <motion.div variants={m.fadeUp} className="mb-1 flex items-center justify-between px-1 text-xs text-fg-muted">
        <span>{t(STATUS_COPY[j.status] ?? j.status)}</span>
        <time dateTime={j.updatedAt}>{formatFullDateTime(j.updatedAt)}</time>
      </motion.div>
      <motion.div variants={m.fadeUp}>
        <UserBubble text={j.ask} at={j.createdAt} />
      </motion.div>
      {j.agentId && (
        <motion.div variants={m.fadeUp}>
          <HandoffChip agentId={j.agentId} />
        </motion.div>
      )}
      {j.cards.map((card) => (
        <motion.div key={card.cardId} variants={m.fadeUp}>
          <CardRenderer card={card} />
        </motion.div>
      ))}
      {j.decisions.length > 0 && (
        <motion.section variants={m.fadeUp} className="mt-1">
          <h3 className="mb-1 px-1 text-xs text-fg-muted">{t('Decisions')}</h3>
          <ul className="divide-y divide-border rounded-control border border-border">
            {j.decisions.map((d) => (
              <li key={`${d.attentionId}-${d.decidedAt}`} className="px-3 py-2 text-sm">
                <div className="text-fg">{d.optionLabel}</div>
                <div className="text-xs text-fg-muted">
                  {d.by.displayName} · <time dateTime={d.decidedAt}>{formatFullDateTime(d.decidedAt)}</time>
                </div>
                {d.freeText && <div className="mt-0.5 text-fg-muted">“{d.freeText}”</div>}
              </li>
            ))}
          </ul>
        </motion.section>
      )}
      {j.message && (
        <motion.p variants={m.fadeUp} className="px-1 text-sm text-fg-muted">
          {j.message}
        </motion.p>
      )}
      {isOpen && (
        <motion.div variants={m.fadeUp} className="mt-2">
          <Button size="sm" variant="primary" onClick={() => onContinueInAsk(j.journeyId)}>
            {t('Continue in Ask')}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
