import { motion } from 'motion/react';
import { useId } from 'react';
import type { AttentionItem } from '@contracts/schemas/attention';
import { AgentChip, CardRenderer, EvidenceList } from '@/cards';
import { cn } from '@/lib/cn';
import { formatFullDateTime, formatTtl } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { useNow } from '@/hooks/useNow';
import { Chip } from '@/ui/Chip';
import { useMotionPresets } from '@/ui/motion';

export interface AttentionDetailProps {
  item: AttentionItem;
  evidenceId?: string;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Who and what · evidence · optional record · TTL. The decision bar is the footer. */
export function AttentionDetail({ item, evidenceId }: AttentionDetailProps) {
  const m = useMotionPresets();
  const now = useNow(1000);
  const ttl = formatTtl(item.expiresAt, now);
  const fallbackId = useId();
  const evId = evidenceId ?? fallbackId;

  return (
    <motion.div
      variants={m.staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4"
    >
      <motion.section variants={m.fadeUp} className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-xs font-semibold text-fg-muted"
        >
          {initials(item.requester.displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg text-fg">{item.title}</h2>
          <p className="text-sm text-fg-muted">
            {item.requester.displayName}
            {item.department ? ` · ${item.department}` : item.requester.department ? ` · ${item.requester.department}` : ''}
          </p>
          <p className="mt-1 text-base text-fg">{item.subject}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <AgentChip agentId={item.agentId} />
            <Chip>{item.platform}</Chip>
          </div>
        </div>
      </motion.section>

      {item.evidence.length > 0 && (
        <motion.section variants={m.fadeUp}>
          <h3 className="mb-1.5 text-xs text-fg-muted">{t('Checked')}</h3>
          <EvidenceList id={evId} items={item.evidence} />
        </motion.section>
      )}

      {item.record && (
        <motion.section variants={m.fadeUp}>
          <CardRenderer card={item.record} />
        </motion.section>
      )}

      <motion.p
        variants={m.fadeUp}
        className={cn('text-xs tabular', ttl.expired ? 'text-fg-muted' : ttl.urgent ? 'text-warning' : 'text-fg-subtle')}
      >
        {ttl.expired ? (
          <>
            {t('Expired')} · <time dateTime={item.expiresAt}>{formatFullDateTime(item.expiresAt)}</time>
          </>
        ) : (
          t('Expires in {ttl}', { ttl: ttl.label })
        )}
      </motion.p>
    </motion.div>
  );
}
