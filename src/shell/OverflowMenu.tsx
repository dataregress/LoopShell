import { MoreHorizontal } from 'lucide-react';
import { useAdapter } from '@/adapters/AdapterProvider';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import { Menu, MenuContent, MenuItem, MenuPortal, MenuSeparator, MenuTrigger } from '@/ui/Menu';

/** Header ⋯ menu: Settings, About, Sign out. */
export function OverflowMenu() {
  const adapter = useAdapter();
  const displayName = useSessionStore((s) => s.session.displayName);
  const openSettings = useUiStore((s) => s.setSettingsOpen);
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={t('More')}
          className="inline-flex size-8 items-center justify-center rounded-control text-fg-muted hover:bg-surface-sunken hover:text-fg data-[state=open]:bg-surface-sunken"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </MenuTrigger>
      <MenuPortal>
        <MenuContent align="end">
          <MenuItem onSelect={() => openSettings(true)}>{t('Settings…')}</MenuItem>
          <MenuItem onSelect={() => openSettings(true)}>{t('About Loop')}</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => void adapter.authSignOut()}>
            {displayName ? t('Sign out {name}', { name: displayName }) : t('Sign out')}
          </MenuItem>
        </MenuContent>
      </MenuPortal>
    </Menu>
  );
}
