import { z } from 'zod';
import { AttentionItem } from './attention';
import { AgentId, Uuid } from './common';
import { LedgerRow } from './ledger';

/** A2A task states as reported by the orchestrator (see a2a/state-map.ts). */
export const A2AState = z.enum([
  'submitted',
  'working',
  'input-required',
  'auth-required',
  'completed',
  'failed',
  'rejected',
  'canceled',
]);
export type A2AState = z.infer<typeof A2AState>;

/**
 * `task_state` payload. `cards` is deliberately `unknown[]` here: the UI parses
 * each card individually with `parseCards` so one unknown card type never
 * rejects the whole event.
 */
export const TaskStateEvent = z.object({
  eventId: Uuid,
  journeyId: Uuid,
  taskId: z.string(),
  state: A2AState,
  agentId: AgentId.optional(),
  cards: z.array(z.unknown()).optional(),
  message: z.string().optional(),
});
export type TaskStateEvent = z.infer<typeof TaskStateEvent>;

export const AttentionRefEvent = z.object({
  eventId: Uuid,
  attentionId: Uuid,
});
export type AttentionRefEvent = z.infer<typeof AttentionRefEvent>;

export const AttentionNewEvent = z.object({
  eventId: Uuid,
  item: AttentionItem,
});
export type AttentionNewEvent = z.infer<typeof AttentionNewEvent>;

export const LedgerAppendedEvent = z.object({
  eventId: Uuid,
  row: LedgerRow,
});
export type LedgerAppendedEvent = z.infer<typeof LedgerAppendedEvent>;

/**
 * Wire event names on Web PubSub and their IPC names
 * (docs/shell-architecture.md §5.2). The mock speaks the wire names.
 */
export const WireEventName = z.enum([
  'attention.created',
  'attention.resolved',
  'attention.expired',
  'journey.updated',
  'ledger.appended',
]);
export type WireEventName = z.infer<typeof WireEventName>;

export const IpcEventName = z.enum([
  'attention_new',
  'attention_resolved',
  'attention_expired',
  'task_state',
  'ledger_appended',
]);
export type IpcEventName = z.infer<typeof IpcEventName>;

export const WIRE_TO_IPC: Record<WireEventName, IpcEventName> = {
  'attention.created': 'attention_new',
  'attention.resolved': 'attention_resolved',
  'attention.expired': 'attention_expired',
  'journey.updated': 'task_state',
  'ledger.appended': 'ledger_appended',
};

/** Envelope inside a Web PubSub `message` frame's `data`. */
export const WireEvent = z.object({
  eventId: Uuid,
  type: WireEventName,
  payload: z.unknown(),
});
export type WireEvent = z.infer<typeof WireEvent>;

export const IPC_EVENT_SCHEMAS = {
  attention_new: AttentionNewEvent,
  attention_resolved: AttentionRefEvent,
  attention_expired: AttentionRefEvent,
  task_state: TaskStateEvent,
  ledger_appended: LedgerAppendedEvent,
} as const;
