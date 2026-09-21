import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useMotionPresets } from './motion';

export interface CountBadgeProps {
  count: number;
  /** 18 px on the pill, 16 px in the mode switcher. */
  size?: 'sm' | 'md';
  className?: string;
}

export function formatCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Attention count. Hidden at 0; `scaleIn` when the count changes. */
export function CountBadge({ count, size = 'md', className }: CountBadgeProps) {
  const m = useMotionPresets();
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {count > 0 && (
        <motion.span
          key={formatCount(count)}
          variants={m.scaleIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          aria-hidden
          className={cn(
            'inline-flex items-center justify-center rounded-pill bg-attention font-semibold text-primary-fg tabular',
            size === 'md' ? 'h-[18px] min-w-[18px] px-1 text-[11px]' : 'h-4 min-w-4 px-1 text-[10px]',
            className,
          )}
        >
          {formatCount(count)}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
