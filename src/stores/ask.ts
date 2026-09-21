import { create } from 'zustand';
import { INITIAL_THREAD, threadReducer } from '@/modes/ask/thread.reducer';
import type { ThreadAction, ThreadState } from '@/modes/ask/thread.reducer';

interface AskStore {
  thread: ThreadState;
  /** Option currently being relayed, for the spinner on the pressed button. */
  pendingDecision: { attentionId: string; optionId: string } | null;
  /** Most recent journey, for the "Continue:" quick action after "New ask". */
  lastJourney: { journeyId: string; ask: string } | null;
  dispatch: (action: ThreadAction) => void;
  setPendingDecision: (p: AskStore['pendingDecision']) => void;
}

/**
 * Holds the Ask thread so `task_state` events are applied even while another
 * mode is showing. The reducer itself is pure (modes/ask/thread.reducer.ts).
 */
export const useAskStore = create<AskStore>((set) => ({
  thread: INITIAL_THREAD,
  pendingDecision: null,
  lastJourney: null,
  dispatch: (action) =>
    set((s) => {
      const thread = threadReducer(s.thread, action);
      let lastJourney = s.lastJourney;
      if (action.type === 'accepted') lastJourney = { journeyId: action.journeyId, ask: thread.lastAskText ?? '' };
      if (action.type === 'restore') lastJourney = { journeyId: action.journey.journeyId, ask: action.journey.ask };
      return { thread, lastJourney };
    }),
  setPendingDecision: (pendingDecision) => set({ pendingDecision }),
}));
