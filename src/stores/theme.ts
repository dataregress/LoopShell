import { create } from 'zustand';
import type { SystemTheme } from '@contracts/schemas/dock';

interface ThemeStore {
  /** OS theme, from `theme_changed` (Tauri) or `matchMedia` (browser). */
  system: SystemTheme;
  setSystem: (system: SystemTheme) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  system:
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  setSystem: (system) => set({ system }),
}));
