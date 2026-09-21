import * as RadixToast from '@radix-ui/react-toast';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useToastStore } from '@/stores/toasts';
import { useMotionPresets } from './motion';

/** In-panel toasts: one visible at a time, 4 s, `role="status"` (docs/ui-ux.md §3.10). */
export function Toaster() {
  const queue = useToastStore((s) => s.queue);
  const dismiss = useToastStore((s) => s.dismiss);
  const m = useMotionPresets();
  const current = queue[0];

  return (
    <RadixToast.Provider duration={4000} swipeDirection="down">
      <AnimatePresence>
        {current && (
          <RadixToast.Root
            key={current.id}
            asChild
            forceMount
            open
            onOpenChange={(open) => {
              if (!open) dismiss(current.id);
            }}
          >
            <motion.div
              variants={m.scaleIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              role="status"
              className={cn(
                'pointer-events-auto flex items-center gap-3 rounded-card border border-border bg-surface-raised px-3 py-2 text-sm text-fg shadow-panel',
                current.tone === 'success' && 'border-success/40',
                current.tone === 'danger' && 'border-danger/40',
              )}
            >
              <RadixToast.Description className="flex-1">{current.message}</RadixToast.Description>
              {current.action && (
                <RadixToast.Action altText={current.action.label} asChild>
                  <button
                    type="button"
                    onClick={current.action.onClick}
                    className="text-xs font-medium text-info hover:underline"
                  >
                    {current.action.label}
                  </button>
                </RadixToast.Action>
              )}
            </motion.div>
          </RadixToast.Root>
        )}
      </AnimatePresence>
      <RadixToast.Viewport className="pointer-events-none absolute inset-x-3 bottom-[76px] z-50 flex flex-col items-stretch" />
    </RadixToast.Provider>
  );
}
