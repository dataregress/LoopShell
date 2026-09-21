import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';
import { useThemeStore } from '@/stores/theme';

/**
 * Applies `data-theme` / `data-motion` / `data-vibrancy` on <html> from the
 * Settings overrides and the OS theme. Tokens switch in tokens.css.
 */
export function useTheme(): void {
  const theme = useSettingsStore((s) => s.settings.theme);
  const motion = useSettingsStore((s) => s.settings.motion);
  const vibrancy = useSettingsStore((s) => s.settings.vibrancy);
  const system = useThemeStore((s) => s.system);
  const setSystem = useThemeStore((s) => s.setSystem);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setSystem]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = theme === 'system' ? system : theme;
    if (motion === 'reduced') html.dataset.motion = 'reduced';
    else delete html.dataset.motion;
    html.dataset.vibrancy = vibrancy ? 'on' : 'off';
  }, [theme, motion, vibrancy, system]);
}
