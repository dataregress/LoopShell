import { motion } from 'motion/react';
import { ChevronLeft, MoreHorizontal, Pin, PinOff } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Mode } from '@contracts/schemas/dock';
import { t } from '@/lib/i18n';
import { IconButton } from '@/ui/IconButton';
import { Menu, MenuContent, MenuItem, MenuPortal, MenuSeparator, MenuTrigger } from '@/ui/Menu';
import { useMotionPresets } from '@/ui/motion';
import { usePanelContainer } from '@/ui/panel-container';

export interface PanelChromeProps {
  mode: Mode;
  pinned: boolean;
  onPinToggle: () => void;
  onAbout: () => void;
  onSignOut: () => void;
  /** Shown as a back chevron when a detail view is open. */
  onBack?: (() => void) | null;
  children: ReactNode;
  footer?: ReactNode;
  statusStrip?: ReactNode;
}

const MODE_LABEL: Record<Mode, string> = { ask: 'Ask', attention: 'Attention', recent: 'Recent' };

/**
 * Header (44 px) · body · mode footer · status strip. Fixed size; content
 * scrolls inside. Modes are chosen on the pill (docs/ui-ux.md §2.1), so the
 * header only names the current one. Settings is reached from the tray.
 */
export function PanelChrome({
  mode,
  pinned,
  onPinToggle,
  onAbout,
  onSignOut,
  onBack,
  children,
  footer,
  statusStrip,
}: PanelChromeProps) {
  const m = useMotionPresets();
  const container = usePanelContainer();
  return (
    <motion.div
      variants={m.staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col"
    >
      <motion.header
        variants={m.fadeUp}
        className="flex h-11 shrink-0 items-center gap-1 border-b border-border ps-3 pe-1.5"
      >
        {onBack ? (
          <IconButton label={t('Back')} size="sm" className="-ms-1.5" onClick={onBack}>
            <ChevronLeft className="size-4" aria-hidden />
          </IconButton>
        ) : null}
        <h1 id="panel-title" className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
          {t(MODE_LABEL[mode])}
        </h1>
        <IconButton
          label={pinned ? t('Unpin panel') : t('Pin panel')}
          size="sm"
          active={pinned}
          onClick={onPinToggle}
        >
          {pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
        </IconButton>
        <Menu modal={false}>
          <MenuTrigger asChild>
            <IconButton label={t('More')} size="sm">
              <MoreHorizontal className="size-4" aria-hidden />
            </IconButton>
          </MenuTrigger>
          <MenuPortal container={container ?? undefined}>
            <MenuContent align="end">
              <MenuItem onSelect={onAbout}>{t('About Loop')}</MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={onSignOut}>{t('Sign out')}</MenuItem>
            </MenuContent>
          </MenuPortal>
        </Menu>
      </motion.header>

      <motion.main
        variants={m.fadeUp}
        id="panel-body"
        aria-labelledby="panel-title"
        tabIndex={-1}
        className="relative min-h-0 flex-1"
      >
        {children}
      </motion.main>

      {footer && (
        <motion.footer variants={m.fadeUp} className="shrink-0">
          {footer}
        </motion.footer>
      )}
      {statusStrip}
    </motion.div>
  );
}
