import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CardRenderer } from '@/cards';
import { cn } from '@/lib/cn';
import { t } from '@/lib/i18n';
import type { ThreadItem, ThreadState } from '@/modes/ask/thread.reducer';
import { useMotionPresets } from '@/ui/motion';
import { HandoffChip } from './HandoffChip';
import { ProgressCard } from './ProgressCard';
import { UserBubble } from './UserBubble';

export interface AskThreadProps {
  thread: ThreadState;
  onDecide: (attentionId: string, optionId: string, freeText?: string) => void;
  pendingDecision: { attentionId: string; optionId: string } | null;
  decisionsDisabled: boolean;
  onRetry: () => void;
  onNewAsk: () => void;
}

function ThreadRow({
  item,
  onDecide,
  pendingDecision,
  decisionsDisabled,
  onRetry,
}: { item: ThreadItem } & Omit<AskThreadProps, 'thread' | 'onNewAsk'>) {
  switch (item.kind) {
    case 'ask':
      return <UserBubble text={item.text} at={item.at} />;
    case 'handoff':
      return <HandoffChip agentId={item.agentId} />;
    case 'progress':
      return <ProgressCard agentId={item.agentId} />;
    case 'card': {
      const attentionId =
        item.card.type === 'choice' || item.card.type === 'confirmation' ? item.card.attentionId : null;
      return (
        <CardRenderer
          card={item.card}
          onDecide={onDecide}
          pendingOptionId={attentionId && pendingDecision?.attentionId === attentionId ? pendingDecision.optionId : null}
          decisionsDisabled={decisionsDisabled}
          onRetry={onRetry}
        />
      );
    }
    case 'system':
      return (
        <p className={cn('px-1 text-sm', item.tone === 'failure' ? 'text-danger' : 'text-fg-muted')}>{item.text}</p>
      );
    default:
      return null;
  }
}

/** Newest at the bottom; auto-scrolls unless the user has scrolled up. */
export function AskThread({ thread, onDecide, pendingDecision, decisionsDisabled, onRetry, onNewAsk }: AskThreadProps) {
  const m = useMotionPresets();
  const scroller = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const count = thread.items.length;

  useEffect(() => {
    if (!pinnedToBottom) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, pinnedToBottom, thread.status]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  }

  return (
    <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-3">
      <div className="mb-2 flex justify-center">
        <button type="button" onClick={onNewAsk} className="text-xs font-medium text-info hover:underline">
          {t('New ask')}
        </button>
      </div>
      <motion.ol variants={m.staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {thread.items.map((item) => (
            <motion.li key={item.id} variants={m.fadeUp} initial="hidden" animate="visible" exit="exit" layout={!m.reduced}>
              <ThreadRow
                item={item}
                onDecide={onDecide}
                pendingDecision={pendingDecision}
                decisionsDisabled={decisionsDisabled}
                onRetry={onRetry}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ol>
    </div>
  );
}
