import { AnimatePresence, motion } from 'motion/react';
import { useAdapter } from '@/adapters/AdapterProvider';
import { formatUntil } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { useDockStore } from '@/stores/dock';
import { useMotionPresets } from '@/ui/motion';

/** 20 px strip under the footer, only when something needs saying (docs/ui-ux.md §3.2). */
export function StatusStrip() {
  const m = useMotionPresets();
  const adapter = useAdapter();
  const connectivity = useDockStore((s) => s.connectivity);
  const paused = useDockStore((s) => s.state.paused);
  const pausedUntil = useDockStore((s) => s.state.pausedUntilEpochMs);

  let message: string | null = null;
  let action: { label: string; onClick: () => void } | null = null;
  let tone = 'text-fg-muted bg-surface-sunken';
  if (connectivity.state === 'offline') {
    message = t('Offline — decisions paused');
    tone = 'text-danger bg-danger/10';
  } else if (connectivity.state === 'reconnecting') {
    message = t('Reconnecting…');
  } else if (paused && pausedUntil) {
    message = t('Paused until {time}', { time: formatUntil(pausedUntil) });
    action = { label: t('Resume'), onClick: () => void adapter.pauseSet(null) };
  }

  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div
          key={message}
          variants={m.fade}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="status"
          className={`flex h-5 shrink-0 items-center justify-center gap-2 px-3 text-xs ${tone}`}
        >
          <span className="truncate">{message}</span>
          {action && (
            <button type="button" onClick={action.onClick} className="font-medium underline-offset-2 hover:underline">
              {action.label}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
