import type { Card } from '@contracts/schemas/cards';
import type { TaskStateEvent } from '@contracts/schemas/events';
import type { JourneyThread } from '@contracts/schemas/journey';
import { FAILURE_COPY, isTerminal, mapA2AState } from '@contracts/a2a/state-map';

export type ThreadItem =
  | { kind: 'ask'; id: string; text: string; at: string }
  | { kind: 'handoff'; id: string; agentId: string }
  | { kind: 'progress'; id: string; agentId: string | null }
  | { kind: 'card'; id: string; card: Card }
  | { kind: 'system'; id: string; text: string; tone: 'neutral' | 'failure' };

export type ThreadStatus = 'idle' | 'submitting' | 'working' | 'waiting' | 'done' | 'failed';

export interface ThreadState {
  journeyId: string | null;
  taskId: string | null;
  agentId: string | null;
  status: ThreadStatus;
  items: ThreadItem[];
  pendingClientRequestId: string | null;
  lastAskText: string | null;
  /** Attention ids of pending inline choice/confirmation cards. */
  pendingAttentionIds: string[];
}

export const INITIAL_THREAD: ThreadState = {
  journeyId: null,
  taskId: null,
  agentId: null,
  status: 'idle',
  items: [],
  pendingClientRequestId: null,
  lastAskText: null,
  pendingAttentionIds: [],
};

export type ThreadAction =
  | { type: 'submit'; text: string; clientRequestId: string; at: string }
  | { type: 'accepted'; clientRequestId: string; journeyId: string; taskId: string }
  | { type: 'submit_failed'; clientRequestId: string; message: string }
  | { type: 'task_state'; event: TaskStateEvent; cards: Card[]; newId: () => string; now: () => string }
  | { type: 'decided'; attentionId: string; optionId: string }
  | { type: 'cancelled' }
  | { type: 'new_ask' }
  | { type: 'restore'; journey: JourneyThread; newId: () => string };

const PROGRESS_ID = 'progress';

function withoutProgress(items: ThreadItem[]): ThreadItem[] {
  return items.filter((i) => i.kind !== 'progress');
}

function ensureProgress(items: ThreadItem[], agentId: string | null): ThreadItem[] {
  const existing = items.find((i) => i.kind === 'progress');
  if (existing) {
    if (existing.kind === 'progress' && existing.agentId === agentId) return items;
    return items.map((i) => (i.kind === 'progress' ? { ...i, agentId } : i));
  }
  return [...items, { kind: 'progress', id: PROGRESS_ID, agentId }];
}

function cardsIn(items: ThreadItem[]): Card[] {
  return items.flatMap((i) => (i.kind === 'card' ? [i.card] : []));
}

function pendingIdsFrom(cards: Card[]): string[] {
  const ids: string[] = [];
  for (const c of cards) {
    if (c.type === 'choice' && !c.chosenOptionId) ids.push(c.attentionId);
    if (c.type === 'confirmation' && c.decidedOptionId === undefined) ids.push(c.attentionId);
  }
  return ids;
}

/**
 * Pure reducer for the Ask thread. Driven by composer actions and `task_state`
 * events; the store applies it and components render `items`.
 */
export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case 'submit': {
      const items = withoutProgress(state.items);
      return {
        ...state,
        status: 'submitting',
        pendingClientRequestId: action.clientRequestId,
        lastAskText: action.text,
        items: [
          ...items,
          { kind: 'ask', id: action.clientRequestId, text: action.text, at: action.at },
          { kind: 'progress', id: PROGRESS_ID, agentId: state.agentId },
        ],
      };
    }
    case 'accepted': {
      if (action.clientRequestId !== state.pendingClientRequestId) return state;
      return {
        ...state,
        status: 'working',
        journeyId: action.journeyId,
        taskId: action.taskId,
        pendingClientRequestId: null,
      };
    }
    case 'submit_failed': {
      if (action.clientRequestId !== state.pendingClientRequestId) return state;
      return {
        ...state,
        status: 'failed',
        pendingClientRequestId: null,
        items: [
          ...withoutProgress(state.items),
          { kind: 'system', id: `${action.clientRequestId}-err`, text: action.message, tone: 'failure' },
        ],
      };
    }
    case 'task_state': {
      const { event, cards } = action;
      if (state.journeyId && event.journeyId !== state.journeyId) return state;
      if (!state.journeyId && state.status !== 'working') return state;
      const ui = mapA2AState(event.state);
      let items = state.items;
      let agentId = state.agentId;

      if (event.agentId && event.agentId !== agentId) {
        agentId = event.agentId;
        const alreadyHandedOff = items.some((i) => i.kind === 'handoff' && i.agentId === event.agentId);
        if (!alreadyHandedOff) {
          items = [...withoutProgress(items), { kind: 'handoff', id: `handoff-${event.agentId}-${event.eventId}`, agentId: event.agentId }];
        }
      }

      if (ui === 'progress') {
        return { ...state, agentId, taskId: event.taskId, status: 'working', items: ensureProgress(items, agentId) };
      }

      items = withoutProgress(items);
      const cardItems: ThreadItem[] = cards.map((card) => ({ kind: 'card', id: card.cardId, card }));

      if (ui === 'failure' && cards.length === 0) {
        const state3 = event.state as 'failed' | 'rejected' | 'canceled';
        cardItems.push({
          kind: 'card',
          id: action.newId(),
          card: {
            cardId: action.newId(),
            agentId: agentId ?? 'loop-orchestrator',
            journeyId: event.journeyId,
            taskId: event.taskId,
            createdAt: action.now(),
            type: 'summary',
            title: FAILURE_COPY[state3],
            paragraphs: [event.message ?? FAILURE_COPY[state3]],
            tone: 'failure',
            retryable: event.state === 'failed',
          },
        });
      } else if (cards.length === 0 && event.message) {
        cardItems.push({ kind: 'system', id: `${event.eventId}-msg`, text: event.message, tone: 'neutral' });
      }

      const nextItems = [...items, ...cardItems];
      return {
        ...state,
        agentId,
        taskId: event.taskId,
        status: ui === 'attention' ? 'waiting' : ui === 'failure' ? 'failed' : isTerminal(event.state) ? 'done' : 'working',
        items: nextItems,
        pendingAttentionIds: pendingIdsFrom(cardsIn(nextItems)),
      };
    }
    case 'decided': {
      const items = state.items.map((i): ThreadItem => {
        if (i.kind !== 'card') return i;
        if (i.card.type === 'choice' && i.card.attentionId === action.attentionId) {
          return { ...i, card: { ...i.card, chosenOptionId: action.optionId } };
        }
        if (i.card.type === 'confirmation' && i.card.attentionId === action.attentionId) {
          return { ...i, card: { ...i.card, decidedOptionId: action.optionId } };
        }
        return i;
      });
      return {
        ...state,
        status: 'working',
        items: ensureProgress(items, state.agentId),
        pendingAttentionIds: pendingIdsFrom(cardsIn(items)),
      };
    }
    case 'cancelled': {
      return {
        ...state,
        status: 'done',
        items: [...withoutProgress(state.items), { kind: 'system', id: `cancel-${Date.now()}`, text: 'Cancelled.', tone: 'neutral' }],
        pendingAttentionIds: [],
      };
    }
    case 'new_ask':
      return INITIAL_THREAD;
    case 'restore': {
      const j = action.journey;
      const items: ThreadItem[] = [{ kind: 'ask', id: action.newId(), text: j.ask, at: j.createdAt }];
      if (j.agentId) items.push({ kind: 'handoff', id: action.newId(), agentId: j.agentId });
      for (const card of j.cards) items.push({ kind: 'card', id: card.cardId, card });
      const open = j.status === 'waiting_on_user' || j.status === 'running' || j.status === 'routed' || j.status === 'received';
      return {
        journeyId: j.journeyId,
        taskId: null,
        agentId: j.agentId ?? null,
        status: j.status === 'waiting_on_user' ? 'waiting' : open ? 'working' : j.status === 'failed' ? 'failed' : 'done',
        items,
        pendingClientRequestId: null,
        lastAskText: j.ask,
        pendingAttentionIds: pendingIdsFrom(j.cards),
      };
    }
    default:
      return state;
  }
}
