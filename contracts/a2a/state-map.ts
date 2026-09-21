import type { A2AState } from '../schemas/events';
import type { JourneyStatus } from '../schemas/journey';

/**
 * How the dock presents an A2A task state (docs/.cursor/rules/contracts.mdc).
 *
 * `progress`   handoff chip + skeleton
 * `attention`  an Attention item / inline choice or confirmation
 * `cards`      cards from artifacts
 * `failure`    a `summary` card with `tone: 'failure'`
 */
export type UiTaskState = 'progress' | 'attention' | 'cards' | 'failure';

export const A2A_TO_UI: Record<A2AState, UiTaskState> = {
  submitted: 'progress',
  working: 'progress',
  'input-required': 'attention',
  'auth-required': 'attention',
  completed: 'cards',
  failed: 'failure',
  rejected: 'failure',
  canceled: 'failure',
};

export function mapA2AState(state: A2AState): UiTaskState {
  return A2A_TO_UI[state];
}

export const A2A_TO_JOURNEY: Record<A2AState, JourneyStatus> = {
  submitted: 'received',
  working: 'running',
  'input-required': 'waiting_on_user',
  'auth-required': 'waiting_on_user',
  completed: 'completed',
  failed: 'failed',
  rejected: 'failed',
  canceled: 'cancelled',
};

export function isTerminal(state: A2AState): boolean {
  return state === 'completed' || state === 'failed' || state === 'rejected' || state === 'canceled';
}

/** Copy shown on the failure summary when the orchestrator gives no message. */
export const FAILURE_COPY: Record<Extract<A2AState, 'failed' | 'rejected' | 'canceled'>, string> = {
  failed: 'The agent could not complete this.',
  rejected: 'The agent declined this ask.',
  canceled: 'Cancelled.',
};
