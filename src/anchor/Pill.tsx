import { AnimatePresence, motion } from 'motion/react';
import { Bell, History, MessageSquare, Play } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import type { Mode } from '@contracts/schemas/dock';
import { useAdapter } from '@/adapters/AdapterProvider';
import { useAttentionCount } from '@/hooks/useAttention';
import { cn } from '@/lib/cn';
import { PILL_W, TAB_W } from '@/lib/geometry';
import { formatUntil } from '@/lib/dates';
import { t, tNeedYou } from '@/lib/i18n';
import { useDockStore } from '@/stores/dock';
import { useSettingsStore } from '@/stores/settings';
import { CountBadge } from '@/ui/Badge';
import { formatShortcut } from '@/ui/Kbd';
import { LoopMark } from '@/ui/LoopMark';
import { durations, useMotionPresets } from '@/ui/motion';
import { usePillDrag } from './usePillDrag';

export interface PillProps {
  /** Current top edge of the *expanded* pill, in the coordinate space of `screenY`. */
  currentTop: () => number;
  /** Outline width target: the 56 px pill (true) or the 20 px tab; eases between them (ADR-005). */
  wide: boolean;
  /** Chrome mounted inside the outline: mode toolbar (true) or edge tab (docs/ui-ux.md §2). */
  expanded: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  className?: string;
}

/** Icon-only mode buttons; the title lives in the tooltip (docs/ui-ux.md §2.1). */
const MODES: { value: Mode; label: string; Icon: LucideIcon }[] = [
  { value: 'ask', label: 'Ask', Icon: MessageSquare },
  { value: 'attention', label: 'Attention', Icon: Bell },
  { value: 'recent', label: 'Recent', Icon: History },
];

/** The mode button under a pointer-down target, if any. */
function modeOf(target: EventTarget | null): Mode | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-pill-mode]');
  const mode = el?.dataset.pillMode;
  return MODES.some((m) => m.value === mode) ? (mode as Mode) : null;
}

/**
 * Edge tab by default; hover (or an open panel) expands it into the mode
 * toolbar (docs/ui-ux.md §2, ADR-005). The outline is pinned to the screen
 * edge inside the fixed-size anchor window and slides 20 ↔ 56; both chromes
 * ride its inboard edge so the reveal reads as a drawer. Nothing here takes
 * keyboard focus.
 */
export function Pill({ currentTop, wide, expanded, onDraggingChange, className }: PillProps) {
  const adapter = useAdapter();
  const m = useMotionPresets();
  const dock = useDockStore((s) => s.state);
  const connectivity = useDockStore((s) => s.connectivity);
  const shortcut = useSettingsStore((s) => s.settings.shortcutOpen);
  const edge = useSettingsStore((s) => s.settings.edge);
  const count = useAttentionCount();

  const { dragging, pressed, handlers } = usePillDrag({
    currentTop,
    onMove: (y) => void adapter.anchorSetY(y, false),
    onCommit: (y) => void adapter.anchorSetY(y, true),
    onClick: (target) => {
      const mode = modeOf(target);
      if (!mode) {
        if (dock.open) void adapter.dockHide({ reason: 'pill' });
        else void adapter.dockShow({ reason: 'pill' });
      } else if (!dock.open) {
        void adapter.dockShow({ mode, reason: 'pill' });
      } else if (dock.mode === mode) {
        void adapter.dockHide({ reason: 'pill' });
      } else {
        void adapter.dockSetMode(mode);
      }
    },
  });

  useEffect(() => {
    onDraggingChange?.(dragging);
  }, [dragging, onDraggingChange]);

  const markTooltip = [
    `Loop · ${formatShortcut(shortcut)}`,
    dock.paused && dock.pausedUntilEpochMs
      ? t('Paused until {time}', { time: formatUntil(dock.pausedUntilEpochMs) })
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const markLabel =
    count > 0
      ? count === 1
        ? t('Loop. 1 item needs your attention')
        : t('Loop. {n} items need your attention', { n: count })
      : t('Loop');

  // Chrome rides the edge that moves (away from the screen), so the slide reads as a drawer.
  const inboard = edge === 'left' ? 'right-0' : 'left-0';

  return (
    <motion.div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={markLabel}
      aria-expanded={expanded}
      title={markTooltip}
      {...handlers}
      // Never move keyboard focus into the pill (docs/ui-ux.md §2.3).
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onAuxClick={(e) => e.preventDefault()}
      initial={false}
      animate={{
        width: wide ? PILL_W : TAB_W,
        scale: pressed && !dragging ? 0.98 : 1,
        opacity: dock.paused ? 0.6 : 1,
      }}
      transition={
        m.reduced
          ? { duration: 0 }
          : { width: wide ? m.expand : m.collapse, scale: m.spring, opacity: { duration: durations.fast } }
      }
      style={{
        touchAction: 'none',
        transformOrigin: edge === 'right' ? '100% 50%' : '0% 50%',
      }}
      className={cn(
        'absolute inset-y-0 cursor-pointer overflow-hidden border border-border bg-surface-raised select-none',
        edge === 'left' ? 'left-0 rounded-e-card' : 'right-0 rounded-s-card',
        className,
      )}
      data-open={dock.open || undefined}
      data-expanded={expanded || undefined}
      data-dragging={dragging || undefined}
    >
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="toolbar"
            variants={m.fadeFast}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ width: PILL_W }}
            className={cn('absolute inset-y-0 flex flex-col items-center justify-center', inboard)}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label={markLabel}
              aria-pressed={dock.open}
              title={markTooltip}
              className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-control"
            >
              <LoopMark size={28} filled={dock.open} />
            </button>
            <span aria-hidden className="my-1 h-px w-4 bg-border" />
            <div className="flex flex-col items-center gap-0.5">
              {MODES.map(({ value, label, Icon }) => {
                const active = dock.open && dock.mode === value;
                const withCount = value === 'attention' && count > 0;
                const title = withCount ? `${t(label)} · ${tNeedYou(count)}` : t(label);
                return (
                  <button
                    key={value}
                    type="button"
                    tabIndex={-1}
                    data-pill-mode={value}
                    aria-label={withCount ? `${t(label)}. ${tNeedYou(count)}` : t(label)}
                    aria-pressed={active}
                    title={title}
                    className={cn(
                      'relative inline-flex size-9 cursor-pointer items-center justify-center rounded-control transition-colors duration-[120ms]',
                      active ? 'text-primary' : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="pill-mode-active"
                        transition={m.spring}
                        aria-hidden
                        className="absolute inset-0 rounded-control bg-surface-sunken"
                      />
                    )}
                    <Icon className="relative size-[18px]" strokeWidth={1.75} aria-hidden />
                    {value === 'attention' && (
                      <span aria-hidden className="absolute -top-0.5 -end-0.5 flex">
                        <CountBadge count={count} size="sm" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {connectivity.state !== 'online' && (
              <span
                aria-hidden
                title={connectivity.state === 'offline' ? t('Offline') : t('Reconnecting…')}
                className={cn(
                  'absolute bottom-1 size-1.5 rounded-pill',
                  connectivity.state === 'offline' ? 'bg-danger' : 'bg-fg-subtle',
                )}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="tab"
            variants={m.fadeFast}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ width: TAB_W }}
            className={cn('absolute inset-y-0', inboard)}
          >
            <div className="flex w-full flex-col items-center gap-1.5 pt-4">
              <LoopMark size={12} filled={dock.open} />
              {count > 0 && (
                <span aria-hidden className="attention-pulse size-1.5 rounded-pill bg-attention" />
              )}
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <Play
                className={cn('size-2 fill-fg-subtle text-fg-subtle', edge === 'right' && '-scale-x-100')}
                strokeWidth={0}
              />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
