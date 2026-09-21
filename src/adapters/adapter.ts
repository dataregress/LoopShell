import type { AttentionDecideResult, AttentionDecision, AttentionItem } from '@contracts/schemas/attention';
import type {
  Connectivity,
  DockState,
  HideReason,
  Mode,
  ShowReason,
  SystemTheme,
} from '@contracts/schemas/dock';
import type {
  AttentionNewEvent,
  AttentionRefEvent,
  LedgerAppendedEvent,
  TaskStateEvent,
} from '@contracts/schemas/events';
import type { AskSubmitRequest, AskSubmitResult } from '@contracts/schemas/ipc';
import type { JourneyThread } from '@contracts/schemas/journey';
import type { LedgerPage, LedgerQuery } from '@contracts/schemas/ledger';
import type { Session } from '@contracts/schemas/session';
import type { MonitorInfo, Settings } from '@contracts/schemas/settings';

/** Rust -> UI events (docs/shell-architecture.md §5.2). Payloads are validated before dispatch. */
export interface AdapterEvents {
  dock_state_changed: DockState;
  theme_changed: { system: SystemTheme };
  session_changed: Session;
  connectivity_changed: Connectivity;
  task_state: TaskStateEvent;
  attention_new: AttentionNewEvent;
  attention_resolved: AttentionRefEvent;
  attention_expired: AttentionRefEvent;
  ledger_appended: LedgerAppendedEvent;
  presentation_changed: { presenting: boolean };
  /** The tray asked for Settings; the panel opens its sheet. */
  settings_requested: Record<string, unknown>;
  /** Settings were saved; every window (pill included) mirrors them. */
  settings_changed: Settings;
}

export type AdapterEventName = keyof AdapterEvents;
export type Unsubscribe = () => void;

export interface DockShowRequest {
  mode?: Mode;
  reason: ShowReason;
}

export interface DockHideRequest {
  reason: HideReason;
}

/**
 * One method per IPC command, one subscription per event
 * (docs/shell-architecture.md §5.1). Components only ever see this interface.
 */
export interface LoopAdapter {
  readonly kind: 'tauri' | 'mock';

  // Dock and pill
  dockGetState(): Promise<DockState>;
  dockShow(req: DockShowRequest): Promise<DockState>;
  dockHide(req: DockHideRequest): Promise<DockState>;
  dockPin(pinned: boolean): Promise<DockState>;
  dockSetMode(mode: Mode): Promise<DockState>;
  dockActivate(): Promise<void>;
  anchorSetY(yLogical: number, commit: boolean): Promise<{ yLogical: number }>;
  anchorHide(): Promise<void>;
  anchorShow(): Promise<void>;
  /** Pop the native pill/tray menu at the cursor (Tauri); no-op in the browser. */
  anchorMenuPopup(): Promise<void>;
  /** Ease the anchor window between the edge tab and the expanded pill. */
  anchorSetExpanded(expanded: boolean): Promise<void>;
  /** Show the panel and open the Settings sheet (the tray's "Settings…"). */
  dockOpenSettings(): Promise<void>;
  pauseSet(untilEpochMs: number | null): Promise<void>;
  appQuit(): Promise<void>;

  // Identity
  authSignIn(): Promise<Session>;
  authSignOut(): Promise<void>;
  authGetSession(): Promise<Session>;

  // Journeys
  askSubmit(req: AskSubmitRequest): Promise<AskSubmitResult>;
  askCancel(taskId: string): Promise<void>;
  attentionList(): Promise<AttentionItem[]>;
  attentionDecide(decision: AttentionDecision): Promise<AttentionDecideResult>;
  ledgerQuery(query: LedgerQuery): Promise<LedgerPage>;
  journeyGet(journeyId: string): Promise<JourneyThread>;

  // Settings and misc
  settingsGet(): Promise<Settings>;
  settingsSet(settings: Settings): Promise<Settings>;
  monitorsList(): Promise<MonitorInfo[]>;
  openExternal(url: string): Promise<void>;
  telemetryEvent(name: string, props?: Record<string, unknown>): Promise<void>;

  on<E extends AdapterEventName>(event: E, handler: (payload: AdapterEvents[E]) => void): Unsubscribe;
}
