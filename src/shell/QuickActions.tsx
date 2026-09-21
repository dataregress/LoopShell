import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useMotionPresets } from '@/ui/motion';

export interface QuickAction {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

/** Up to three 36 px rows under the empty-thread prompt (docs/ui-ux.md §3.4). */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const m = useMotionPresets();
  const shown = actions.slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <motion.ul variants={m.staggerContainer} initial="hidden" animate="visible" className="mt-3 flex flex-col">
      {shown.map((a) => (
        <motion.li key={a.id} variants={m.fadeUp}>
          <button
            type="button"
            onClick={a.onClick}
            className="flex h-9 w-full items-center gap-3 rounded-control px-2 text-start text-base text-fg hover:bg-surface-sunken"
          >
            <span className="text-fg-muted [&>svg]:size-4">{a.icon}</span>
            <span className="truncate">{a.label}</span>
          </button>
        </motion.li>
      ))}
    </motion.ul>
  );
}
