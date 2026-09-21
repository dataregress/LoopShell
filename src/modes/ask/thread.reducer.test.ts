import { describe, expect, it } from 'vitest';
import { confirmationIncident, recordIncident } from '@contracts/fixtures/cards';
import { JOURNEY } from '@contracts/fixtures/ids';
import type { TaskStateEvent } from '@contracts/schemas/events';
import { INITIAL_THREAD, threadReducer } from './thread.reducer';
import type { ThreadState } from './thread.reducer';

let n = 0;
const newId = () => `c1000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const now = () => '2026-09-18T10:00:00.000Z';

function ev(partial: Partial<TaskStateEvent>): TaskStateEvent {
  return {
    eventId: newId(),
    journeyId: JOURNEY.incident,
    taskId: 't-1',
    state: 'working',
    ...partial,
  };
}

function start(): ThreadState {
  let s = threadReducer(INITIAL_THREAD, { type: 'submit', text: 'Raise a P2', clientRequestId: 'req-1', at: now() });
  s = threadReducer(s, { type: 'accepted', clientRequestId: 'req-1', journeyId: JOURNEY.incident, taskId: 't-1' });
  return s;
}

describe('threadReducer', () => {
  it('shows the ask and a progress skeleton after submit', () => {
    const s = start();
    expect(s.status).toBe('working');
    expect(s.items.map((i) => i.kind)).toEqual(['ask', 'progress']);
  });

  it('adds a handoff chip once when the agent is known', () => {
    let s = start();
    s = threadReducer(s, { type: 'task_state', event: ev({ state: 'working', agentId: 'servicenow-itsm' }), cards: [], newId, now });
    s = threadReducer(s, { type: 'task_state', event: ev({ state: 'working', agentId: 'servicenow-itsm' }), cards: [], newId, now });
    expect(s.items.map((i) => i.kind)).toEqual(['ask', 'handoff', 'progress']);
    expect(s.agentId).toBe('servicenow-itsm');
  });

  it('replaces progress with cards and tracks pending proposals', () => {
    let s = start();
    s = threadReducer(s, { type: 'task_state', event: ev({ state: 'working', agentId: 'servicenow-itsm' }), cards: [], newId, now });
    s = threadReducer(s, {
      type: 'task_state',
      event: ev({ state: 'input-required', agentId: 'servicenow-itsm' }),
      cards: [confirmationIncident],
      newId,
      now,
    });
    expect(s.status).toBe('waiting');
    expect(s.items.map((i) => i.kind)).toEqual(['ask', 'handoff', 'card']);
    expect(s.pendingAttentionIds).toEqual([confirmationIncident.attentionId]);
  });

  it('marks a decided proposal and resumes progress, then completes', () => {
    let s = start();
    s = threadReducer(s, {
      type: 'task_state',
      event: ev({ state: 'input-required', agentId: 'servicenow-itsm' }),
      cards: [confirmationIncident],
      newId,
      now,
    });
    s = threadReducer(s, { type: 'decided', attentionId: confirmationIncident.attentionId, optionId: 'create' });
    expect(s.pendingAttentionIds).toEqual([]);
    const card = s.items.find((i) => i.kind === 'card');
    expect(card?.kind === 'card' && card.card.type === 'confirmation' && card.card.decidedOptionId).toBe('create');
    expect(s.items.at(-1)?.kind).toBe('progress');
    s = threadReducer(s, { type: 'task_state', event: ev({ state: 'completed' }), cards: [recordIncident], newId, now });
    expect(s.status).toBe('done');
    expect(s.items.at(-1)).toMatchObject({ kind: 'card', card: { type: 'record' } });
  });

  it('synthesises a failure summary when the orchestrator sends none', () => {
    let s = start();
    s = threadReducer(s, { type: 'task_state', event: ev({ state: 'failed', message: 'Gateway timeout' }), cards: [], newId, now });
    expect(s.status).toBe('failed');
    const last = s.items.at(-1);
    expect(last?.kind === 'card' && last.card.type === 'summary' && last.card.tone).toBe('failure');
  });

  it('ignores events for other journeys', () => {
    const s = start();
    const next = threadReducer(s, {
      type: 'task_state',
      event: ev({ journeyId: JOURNEY.track, state: 'completed' }),
      cards: [recordIncident],
      newId,
      now,
    });
    expect(next).toBe(s);
  });

  it('new_ask clears the view', () => {
    expect(threadReducer(start(), { type: 'new_ask' })).toEqual(INITIAL_THREAD);
  });
});
