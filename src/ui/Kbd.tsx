import { isMac } from '@/lib/env';

/** Render a shortcut like "Ctrl+Alt+L" as the platform writes it. */
export function formatShortcut(shortcut: string): string {
  if (!isMac()) return shortcut;
  return shortcut
    .split('+')
    .map((k) => {
      const key = k.trim().toLowerCase();
      if (key === 'ctrl' || key === 'control') return '⌃';
      if (key === 'alt' || key === 'option') return '⌥';
      if (key === 'shift') return '⇧';
      if (key === 'cmd' || key === 'meta' || key === 'super') return '⌘';
      return k.trim().toUpperCase();
    })
    .join('');
}

export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-sm border border-border bg-surface-sunken px-1 font-sans text-[10px] text-fg-muted">
      {formatShortcut(children)}
    </kbd>
  );
}
