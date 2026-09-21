import { z } from 'zod';
import { Connectivity, DockState, SystemTheme } from '@contracts/schemas/dock';
import { IPC_EVENT_SCHEMAS } from '@contracts/schemas/events';
import { Session } from '@contracts/schemas/session';
import { Settings } from '@contracts/schemas/settings';
import { log } from '@/lib/log';
import type { AdapterEventName, AdapterEvents, Unsubscribe } from './adapter';

const SCHEMAS = {
  ...IPC_EVENT_SCHEMAS,
  dock_state_changed: DockState,
  theme_changed: z.object({ system: SystemTheme }),
  session_changed: Session,
  connectivity_changed: Connectivity,
  presentation_changed: z.object({ presenting: z.boolean() }),
  settings_requested: z.object({}),
  settings_changed: Settings,
} as const satisfies Record<AdapterEventName, z.ZodType>;

/** Validate an inbound event payload; returns null (and logs) when it is malformed. */
export function validateEvent<E extends AdapterEventName>(name: E, raw: unknown): AdapterEvents[E] | null {
  const schema = SCHEMAS[name] as unknown as z.ZodType<AdapterEvents[E]>;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const obj = (raw ?? {}) as Record<string, unknown>;
  log.warn(`dropped malformed ${name} event`, {
    eventId: typeof obj.eventId === 'string' ? obj.eventId : undefined,
    issues: z.prettifyError(parsed.error),
  });
  return null;
}

type Handler<E extends AdapterEventName> = (payload: AdapterEvents[E]) => void;

/** Small typed emitter shared by both adapters. Validates on the way in. */
export class EventHub {
  private handlers = new Map<AdapterEventName, Set<Handler<AdapterEventName>>>();

  on<E extends AdapterEventName>(event: E, handler: Handler<E>): Unsubscribe {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<AdapterEventName>);
    this.handlers.set(event, set);
    return () => {
      set.delete(handler as Handler<AdapterEventName>);
    };
  }

  /** Emit an already-typed payload (produced locally). */
  emit<E extends AdapterEventName>(event: E, payload: AdapterEvents[E]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of Array.from(set)) {
      try {
        (h as Handler<E>)(payload);
      } catch (err) {
        log.error(`handler for ${event} threw`, { err: String(err) });
      }
    }
  }

  /** Validate then emit an inbound payload from the wire or IPC. */
  emitRaw<E extends AdapterEventName>(event: E, raw: unknown): void {
    const payload = validateEvent(event, raw);
    if (payload) this.emit(event, payload);
  }
}
