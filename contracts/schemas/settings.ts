import { z } from 'zod';

export const ThemePreference = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreference>;

export const MotionPreference = z.enum(['system', 'reduced']);
export type MotionPreference = z.infer<typeof MotionPreference>;

export const Edge = z.enum(['right', 'left']);
export type Edge = z.infer<typeof Edge>;

/** User settings, owned by Rust (`settings/`), edited from the Settings sheet. */
export const Settings = z.object({
  shortcutOpen: z.string().min(1),
  shortcutPin: z.string().min(1),
  /** Monitor name; null = primary. */
  display: z.string().nullable(),
  edge: Edge,
  pillVisible: z.boolean(),
  autostart: z.boolean(),
  pinByDefault: z.boolean(),
  excludeFromCapture: z.boolean(),
  theme: ThemePreference,
  motion: MotionPreference,
  vibrancy: z.boolean(),
});
export type Settings = z.infer<typeof Settings>;

export const MonitorInfo = z.object({
  name: z.string(),
  primary: z.boolean(),
  scaleFactor: z.number(),
});
export type MonitorInfo = z.infer<typeof MonitorInfo>;

export const DEFAULT_SETTINGS: Settings = {
  shortcutOpen: 'Ctrl+Alt+L',
  shortcutPin: 'Ctrl+Alt+P',
  display: null,
  edge: 'right',
  pillVisible: true,
  autostart: true,
  pinByDefault: false,
  excludeFromCapture: true,
  theme: 'system',
  motion: 'system',
  vibrancy: true,
};
