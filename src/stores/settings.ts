import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@contracts/schemas/settings';
import type { MonitorInfo, Settings } from '@contracts/schemas/settings';

interface SettingsStore {
  settings: Settings;
  monitors: MonitorInfo[];
  loaded: boolean;
  setSettings: (settings: Settings) => void;
  setMonitors: (monitors: MonitorInfo[]) => void;
}

/** Mirror of the Rust-owned settings; the source of truth is `settings_get`. */
export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  monitors: [],
  loaded: false,
  setSettings: (settings) => set({ settings, loaded: true }),
  setMonitors: (monitors) => set({ monitors }),
}));
