import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { AttentionItem } from '@contracts/schemas/attention';
import { t } from '@/lib/i18n';
import { useAttentionStore } from '@/stores/attention';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorCard } from '@/ui/ErrorCard';
import { useMotionPresets } from '@/ui/motion';
import { RowSkeletons } from '@/ui/Skeleton';
import { AttentionRow } from './AttentionRow';

export interface AttentionListProps {
  open: AttentionItem[];
  expired: AttentionItem[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpen: (id: string) => void;
  /** Focus the first row (keyboard open). */
  focusRequest: number;
}

/** Sorted list with a collapsed "Expired (n)" group. ↑↓ move, Enter opens. */
export function AttentionList({ open, expired, isLoading, error, onRetry, onOpen, focusRequest }: AttentionListProps) {
  const m = useMotionPresets();
  const expandedExpired = useAttentionStore((s) => s.expiredExpanded);
  const toggleExpired = useAttentionStore((s) => s.toggleExpired);
  const [focusIndex, setFocusIndex] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = expandedExpired ? [...open, ...expired] : open;

  useEffect(() => {
    if (focusRequest > 0) refs.current[0]?.focus();
  }, [focusRequest]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? Math.min(visible.length - 1, focusIndex + 1) : Math.max(0, focusIndex - 1);
    setFocusIndex(next);
    refs.current[next]?.focus();
  }

  if (isLoading) return <RowSkeletons rows={4} />;
  if (error) {
    return (
      <div className="p-3">
        <ErrorCard error={error} onRetry={onRetry} />
      </div>
    );
  }
  if (open.length === 0 && expired.length === 0) {
    return <EmptyState icon={<CheckCircle />} message={t('Nothing needs you.')} />;
  }

  return (
    <div role="listbox" aria-label={t('Attention')} onKeyDown={onKeyDown} className="h-full overflow-y-auto">
      <motion.div variants={m.staggerContainer} initial="hidden" animate="visible">
        <AnimatePresence initial={false}>
          {open.map((item, i) => (
            <motion.div key={item.attentionId} variants={m.fadeUp} initial="hidden" animate="visible" exit="exit">
              <AttentionRow
                item={item}
                onOpen={onOpen}
                tabIndex={i === focusIndex ? 0 : -1}
                ref={(el) => {
                  refs.current[i] = el;
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      {expired.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={expandedExpired}
            onClick={toggleExpired}
            className="flex h-9 w-full items-center gap-2 px-4 text-start text-xs text-fg-muted hairline-b hover:bg-surface-sunken"
          >
            {expandedExpired ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
            {t('Expired ({n})', { n: expired.length })}
          </button>
          {expandedExpired &&
            expired.map((item, i) => (
              <AttentionRow
                key={item.attentionId}
                item={item}
                onOpen={onOpen}
                tabIndex={open.length + i === focusIndex ? 0 : -1}
                ref={(el) => {
                  refs.current[open.length + i] = el;
                }}
              />
            ))}
        </>
      )}
    </div>
  );
}
