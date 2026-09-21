import { z } from 'zod';
import { AttentionDecideResult, AttentionItem } from '@contracts/schemas/attention';
import type { AttentionDecision } from '@contracts/schemas/attention';
import type { DockState, Mode } from '@contracts/schemas/dock';
import { WIRE_TO_IPC, WireEvent } from '@contracts/schemas/events';
import { AskSubmitResult } from '@contracts/schemas/ipc';
import type { AskSubmitRequest, IpcError } from '@contracts/schemas/ipc';
import { JourneyThread } from '@contracts/schemas/journey';
import { LedgerPage } from '@contracts/schemas/ledger';
import type { LedgerQuery } from '@contracts/schemas/ledger';
import { Session } from '@contracts/schemas/session';
import { DEFAULT_SETTINGS, MonitorInfo, Settings } from '@contracts/schemas/settings';
import { MOCK_BASE_URL } from '@/lib/env';
import { PILL_H } from '@/lib/geometry';
import { log } from '@/lib/log';
import { INITIAL_DOCK_STATE } from '@/stores/dock';
import type { DockHideRequest, DockShowRequest, LoopAdapter } from './adapter';
import { EventHub } from './events';

/** Dev knobs exposed by the mock orchestrator (`/dev/knobs`). */
export const MockKnobs = z.object({
  latencyMs: z.number().int().min(0),
  failNextAsk: z.boolean(),
  conflictNextDecision: z.boolean(),
  dropRealtime: z.boolean(),
});
export type MockKnobs = z.infer<typeof MockKnobs>;

/**
 * Browser adapter. Talks to tools/mock-orchestrator over HTTP and a WebSocket
 * that speaks Web PubSub reliable-subprotocol frames, and simulates the shell
 * (dock state, pill position, session) locally.
 *
 * This is the only file in src/ allowed to use fetch/WebSocket, and only to
 * the local mock; the dock itself never does (docs/technology.md §7).
 */
export class MockAdapter implements LoopAdapter {
  readonly kind = 'mock' as const;
  private hub = new EventHub();
  private dock: DockState = { ...INITIAL_DOCK_STATE };
  private session: Session = { state: 'signed_out' };
  private settings: Settings = { ...DEFAULT_SETTINGS };
  /** Pill top edge in logical px within the harness viewport. */
  private pillY = Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.4);
  private pillListeners = new Set<(y: number) => void>();
  private ws: WebSocket | null = null;
  private wsAttempt = 0;
  private wsTimer: ReturnType<typeof setTimeout> | null = null;
  private seenEventIds: string[] = [];
  private online = true;
  private storageKey = 'loop-mock-adapter';

  constructor(private baseUrl: string = MOCK_BASE_URL) {
    this.restoreLocal();
    void this.connectRealtime();
    window.addEventListener('online', () => void this.connectRealtime(true));
    // Shell policy the Rust side owns: an Attention item arriving while the
    // panel is hidden opens Attention, unless paused (docs/ui-ux.md §3.3).
    this.hub.on('attention_new', () => {
      if (!this.dock.open && !this.dock.paused && this.session.state === 'signed_in') {
        this.setDock({ open: true, mode: 'attention', active: false });
      }
    });
  }

  // ---- HTTP helpers -------------------------------------------------------

  private async http<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    schema?: z.ZodType<T>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      this.setConnectivity('offline');
      throw <IpcError>{ code: 'offline', message: 'Mock orchestrator is not reachable.', retryable: true };
    }
    if (!res.ok) {
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        /* ignore */
      }
      const maybe = payload as Partial<IpcError> | null;
      throw <IpcError>{
        code:
          maybe?.code ??
          (res.status === 409 ? 'conflict' : res.status === 401 ? 'unauthenticated' : 'internal'),
        message: maybe?.message ?? `${res.status} ${res.statusText}`,
        retryable: maybe?.retryable ?? res.status >= 500,
        correlationId: res.headers.get('x-correlation-id') ?? undefined,
      };
    }
    const json: unknown = res.status === 204 ? undefined : await res.json();
    if (!schema) return json as T;
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      log.warn(`invalid response from ${path}`, { issues: z.prettifyError(parsed.error) });
      throw <IpcError>{
        code: 'invalid',
        message: 'Orchestrator returned an invalid payload.',
        retryable: false,
      };
    }
    return parsed.data;
  }

  // ---- Realtime (Web PubSub reliable subprotocol frames) -----------------

  private async connectRealtime(immediate = false): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))
      return;
    if (this.wsTimer) {
      clearTimeout(this.wsTimer);
      this.wsTimer = null;
    }
    let url: string;
    try {
      const negotiated = await this.http('GET', '/negotiate', undefined, z.object({ url: z.string() }));
      url = negotiated.url;
    } catch {
      this.scheduleReconnect(immediate);
      return;
    }
    const ws = new WebSocket(url, 'json.reliable.webpubsub.azure.v1');
    this.ws = ws;
    ws.onopen = () => {
      this.wsAttempt = 0;
      this.setConnectivity('online');
      ws.send(
        JSON.stringify({ type: 'joinGroup', group: `user:${this.session.userId ?? 'anonymous'}`, ackId: 1 }),
      );
    };
    ws.onmessage = (ev) => this.onFrame(String(ev.data));
    ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect(immediate = false): void {
    this.setConnectivity(this.wsAttempt >= 3 ? 'offline' : 'reconnecting');
    const base = immediate ? 0 : Math.min(30_000, 500 * 2 ** this.wsAttempt);
    const jitter = Math.random() * 250;
    this.wsAttempt += 1;
    this.wsTimer = setTimeout(() => void this.connectRealtime(), base + jitter);
  }

  private onFrame(text: string): void {
    let frame: { type?: string; sequenceId?: number; data?: unknown };
    try {
      frame = JSON.parse(text) as typeof frame;
    } catch {
      return;
    }
    if (frame.type !== 'message') return;
    if (typeof frame.sequenceId === 'number') {
      this.ws?.send(JSON.stringify({ type: 'sequenceAck', sequenceId: frame.sequenceId }));
    }
    const wire = WireEvent.safeParse(frame.data);
    if (!wire.success) {
      log.warn('dropped malformed wire event', { issues: z.prettifyError(wire.error) });
      return;
    }
    // Dedupe by eventId (ring buffer of 1,000), mirroring realtime/dedupe.rs.
    if (this.seenEventIds.includes(wire.data.eventId)) return;
    this.seenEventIds.push(wire.data.eventId);
    if (this.seenEventIds.length > 1000) this.seenEventIds.shift();

    // IPC payloads carry the envelope's eventId (contracts/schemas/events.ts),
    // exactly as the Rust realtime module re-emits them.
    const ipcName = WIRE_TO_IPC[wire.data.type];
    const payload =
      typeof wire.data.payload === 'object' && wire.data.payload !== null
        ? { eventId: wire.data.eventId, ...(wire.data.payload as Record<string, unknown>) }
        : wire.data.payload;
    this.hub.emitRaw(ipcName, payload);
  }

  private setConnectivity(state: 'online' | 'reconnecting' | 'offline'): void {
    const wasOnline = this.online;
    this.online = state === 'online';
    if (state === 'online' && wasOnline && this.wsAttempt === 0) return;
    this.hub.emit('connectivity_changed', { state, sinceEpochMs: Date.now() });
  }

  // ---- Local shell simulation ---------------------------------------------

  private restoreLocal(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { pillY?: number; mode?: Mode; pinned?: boolean; settings?: unknown };
      if (typeof saved.pillY === 'number') this.pillY = saved.pillY;
      if (saved.mode) this.dock.mode = saved.mode;
      if (typeof saved.pinned === 'boolean') this.dock.pinned = saved.pinned;
      const parsedSettings = Settings.safeParse(saved.settings);
      if (parsedSettings.success) this.settings = parsedSettings.data;
    } catch {
      /* ignore */
    }
  }

  private persistLocal(): void {
    // Dev-only convenience; the real shell persists in Rust (never localStorage for Loop data).
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({
        pillY: this.pillY,
        mode: this.dock.mode,
        pinned: this.dock.pinned,
        settings: this.settings,
      }),
    );
  }

  private setDock(patch: Partial<DockState>): DockState {
    this.dock = { ...this.dock, ...patch };
    this.hub.emit('dock_state_changed', this.dock);
    this.persistLocal();
    return this.dock;
  }

  // ---- LoopAdapter --------------------------------------------------------

  async dockGetState(): Promise<DockState> {
    return this.dock;
  }
  async dockShow(req: DockShowRequest): Promise<DockState> {
    return this.setDock({ open: true, mode: req.mode ?? this.dock.mode, active: false });
  }
  async dockHide(_req: DockHideRequest): Promise<DockState> {
    return this.setDock({ open: false, active: false });
  }
  async dockPin(pinned: boolean): Promise<DockState> {
    return this.setDock({ pinned });
  }
  async dockSetMode(mode: Mode): Promise<DockState> {
    return this.setDock({ mode });
  }
  async dockActivate(): Promise<void> {
    this.setDock({ active: true });
  }
  async anchorSetY(yLogical: number, commit: boolean): Promise<{ yLogical: number }> {
    const max = Math.max(0, window.innerHeight - PILL_H);
    this.pillY = Math.round(Math.max(0, Math.min(max, yLogical)));
    for (const l of this.pillListeners) l(this.pillY);
    if (commit) this.persistLocal();
    return { yLogical: this.pillY };
  }
  /** Mock-only: the harness reads and follows the pill's y. */
  getPillY(): number {
    return this.pillY;
  }
  onPillY(listener: (y: number) => void): () => void {
    this.pillListeners.add(listener);
    return () => this.pillListeners.delete(listener);
  }
  async anchorHide(): Promise<void> {
    this.setDock({ pillVisible: false });
  }
  async anchorShow(): Promise<void> {
    this.setDock({ pillVisible: true });
  }
  async anchorMenuPopup(): Promise<void> {
    /* The harness renders a Radix menu instead. */
  }
  async anchorSetExpanded(_expanded: boolean): Promise<void> {
    /* The harness sizes the fake anchor window itself. */
  }
  async dockOpenSettings(): Promise<void> {
    this.setDock({ open: true, active: true });
    this.hub.emit('settings_requested', {});
  }
  async pauseSet(untilEpochMs: number | null): Promise<void> {
    this.setDock({ paused: untilEpochMs !== null, pausedUntilEpochMs: untilEpochMs });
  }
  async appQuit(): Promise<void> {
    log.info('Quit requested (no-op in the browser)');
  }

  async authSignIn(): Promise<Session> {
    this.session = { state: 'signing_in' };
    this.hub.emit('session_changed', this.session);
    await new Promise((r) => setTimeout(r, 900));
    this.session = await this.http('GET', '/session', undefined, Session);
    this.hub.emit('session_changed', this.session);
    void this.connectRealtime(true);
    return this.session;
  }
  async authSignOut(): Promise<void> {
    this.session = { state: 'signed_out', reason: 'user' };
    this.hub.emit('session_changed', this.session);
  }
  async authGetSession(): Promise<Session> {
    if (this.session.state === 'signed_out' && !this.session.reason) {
      // First load in the browser: the mock user is already signed in.
      try {
        this.session = await this.http('GET', '/session', undefined, Session);
      } catch {
        this.session = { state: 'signed_out', reason: 'error' };
      }
    }
    return this.session;
  }

  async askSubmit(req: AskSubmitRequest): Promise<AskSubmitResult> {
    return this.http('POST', '/ask', req, AskSubmitResult);
  }
  async askCancel(taskId: string): Promise<void> {
    await this.http('POST', `/ask/${encodeURIComponent(taskId)}/cancel`);
  }
  async attentionList(): Promise<AttentionItem[]> {
    return this.http('GET', '/attention', undefined, z.array(AttentionItem));
  }
  async attentionDecide(decision: AttentionDecision): Promise<AttentionDecideResult> {
    return this.http('POST', `/attention/${decision.attentionId}/decide`, decision, AttentionDecideResult);
  }
  async ledgerQuery(query: LedgerQuery): Promise<LedgerPage> {
    const params = new URLSearchParams();
    if (query.filters.platforms.length) params.set('platform', query.filters.platforms.join(','));
    if (query.filters.statuses.length) params.set('status', query.filters.statuses.join(','));
    if (query.filters.scope !== 'all') params.set('scope', query.filters.scope);
    if (query.cursor) params.set('cursor', query.cursor);
    params.set('limit', String(query.limit ?? 100));
    return this.http('GET', `/ledger?${params.toString()}`, undefined, LedgerPage);
  }
  async journeyGet(journeyId: string): Promise<JourneyThread> {
    return this.http('GET', `/journey/${journeyId}`, undefined, JourneyThread);
  }

  async settingsGet(): Promise<Settings> {
    return this.settings;
  }
  async settingsSet(settings: Settings): Promise<Settings> {
    this.settings = settings;
    this.persistLocal();
    this.hub.emit('settings_changed', this.settings);
    return this.settings;
  }
  async monitorsList(): Promise<MonitorInfo[]> {
    return z.array(MonitorInfo).parse([
      { name: 'Built-in display', primary: true, scaleFactor: window.devicePixelRatio || 1 },
      { name: 'DELL U2723QE', primary: false, scaleFactor: 1.5 },
    ]);
  }
  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  async telemetryEvent(name: string, props?: Record<string, unknown>): Promise<void> {
    log.debug(`telemetry ${name}`, props);
  }

  // ---- Dev-only (browser harness) ----------------------------------------

  devGetKnobs(): Promise<MockKnobs> {
    return this.http('GET', '/dev/knobs', undefined, MockKnobs);
  }
  devSetKnobs(patch: Partial<MockKnobs>): Promise<MockKnobs> {
    return this.http('POST', '/dev/knobs', patch, MockKnobs);
  }
  async devTrigger(scenario: string): Promise<void> {
    await this.http('POST', `/dev/trigger/${encodeURIComponent(scenario)}`);
  }

  on: LoopAdapter['on'] = (event, handler) => this.hub.on(event, handler);
}
