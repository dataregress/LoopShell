import { z } from 'zod';

export const Mode = z.enum(['ask', 'attention', 'recent']);
export type Mode = z.infer<typeof Mode>;

/** Shell-owned dock state, mirrored to the UI by `dock_state_changed`. */
export const DockState = z.object({
  open: z.boolean(),
  mode: Mode,
  pinned: z.boolean(),
  /** Panel has keyboard focus (Passive -> Active). */
  active: z.boolean(),
  paused: z.boolean(),
  pausedUntilEpochMs: z.number().nullable(),
  pillVisible: z.boolean(),
});
export type DockState = z.infer<typeof DockState>;

export const ShowReason = z.enum(['pill', 'hotkey', 'tray', 'attention', 'toast']);
export type ShowReason = z.infer<typeof ShowReason>;

export const HideReason = z.enum(['esc', 'outside', 'grace', 'ui', 'lock', 'pill']);
export type HideReason = z.infer<typeof HideReason>;

export const ConnectivityState = z.enum(['online', 'reconnecting', 'offline']);
export type ConnectivityState = z.infer<typeof ConnectivityState>;

export const Connectivity = z.object({
  state: ConnectivityState,
  sinceEpochMs: z.number(),
});
export type Connectivity = z.infer<typeof Connectivity>;

export const SystemTheme = z.enum(['light', 'dark']);
export type SystemTheme = z.infer<typeof SystemTheme>;
