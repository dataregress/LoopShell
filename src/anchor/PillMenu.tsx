import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { useAdapter } from '@/adapters/AdapterProvider';
import { formatUntil } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { useDockStore } from '@/stores/dock';
import { useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { formatShortcut } from '@/ui/Kbd';
import { MenuContent, MenuItem, MenuSeparator } from '@/ui/Menu';

export const PAUSE_MS = 60 * 60_000;

export interface PillMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screen point to anchor to (the right-click position). */
  anchor: { x: number; y: number } | null;
}

/**
 * The pill context menu (docs/ui-ux.md §2.4), rendered with Radix in the
 * browser harness. In the dock the same items are a native menu popped by
 * Rust (`anchor_menu_popup`), because the pill window is only 56 px wide.
 * Settings is deliberately absent: it is reached from the tray icon only.
 */
export function PillMenu({ open, onOpenChange, anchor }: PillMenuProps) {
  const adapter = useAdapter();
  const dock = useDockStore((s) => s.state);
  const session = useSessionStore((s) => s.session);
  const shortcutPin = useSettingsStore((s) => s.settings.shortcutPin);

  return (
    <Dropdown.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dropdown.Trigger asChild>
        <span
          aria-hidden
          style={{ position: 'fixed', left: anchor?.x ?? 0, top: anchor?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }}
        />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <MenuContent side="left" align="start" sideOffset={4}>
          <MenuItem shortcut={formatShortcut(shortcutPin)} onSelect={() => void adapter.dockPin(!dock.pinned)}>
            {dock.pinned ? t('Unpin panel') : t('Pin panel')}
          </MenuItem>
          {dock.paused && dock.pausedUntilEpochMs ? (
            <MenuItem onSelect={() => void adapter.pauseSet(null)}>
              {t('Resume (paused until {time})', { time: formatUntil(dock.pausedUntilEpochMs) })}
            </MenuItem>
          ) : (
            <MenuItem onSelect={() => void adapter.pauseSet(Date.now() + PAUSE_MS)}>{t('Pause for 1 hour')}</MenuItem>
          )}
          <MenuItem onSelect={() => void adapter.anchorHide()}>{t('Hide pill')}</MenuItem>
          {session.state === 'signed_in' && (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => void adapter.authSignOut()}>
                {t('Sign out {name}', { name: session.displayName ?? '' })}
              </MenuItem>
            </>
          )}
          <MenuSeparator />
          <MenuItem danger onSelect={() => void adapter.appQuit()}>
            {t('Quit Loop')}
          </MenuItem>
        </MenuContent>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
