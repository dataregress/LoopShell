import { create } from 'zustand';
import type { Connectivity, DockState, Mode } from '@contracts/schemas/dock';

export const INITIAL_DOCK_STATE: DockState = {
  open: false,
  mode: 'ask',
  pinned: false,
  active: false,
  paused: false,
  pausedUntilEpochMs: null,
  pillVisible: true,
};

interface DockStore {
  /** Shell-owned state, mirrored from `dock_state_changed`. */
  state: DockState;
  connectivity: Connectivity;
  presenting: boolean;
  /**
   * Attention ids currently shown inline in the open Ask thread (pending
   * `choice` / `confirmation` cards). While the panel is open they are not
   * listed in Attention or counted on the pill; when the panel hides they are
   * released and "move to Attention" (docs/ui-ux.md §3.4).
   */
  inlinePending: string[];
  /** Ids released on the last hide, to toast "Moved to Attention" on next open. */
  movedToAttention: string[];
  /** Attention item to select when the panel opens because an item arrived. */
  popAttentionId: string | null;

  setState: (state: DockState) => void;
  patchState: (patch: Partial<DockState>) => void;
  setConnectivity: (c: Connectivity) => void;
  setPresenting: (presenting: boolean) => void;
  setMode: (mode: Mode) => void;
  holdInline: (attentionId: string) => void;
  releaseInline: (attentionId: string) => void;
  releaseAllInline: () => void;
  consumeMoved: () => string[];
  setPopAttentionId: (id: string | null) => void;
}

export const useDockStore = create<DockStore>((set, get) => ({
  state: INITIAL_DOCK_STATE,
  connectivity: { state: 'online', sinceEpochMs: Date.now() },
  presenting: false,
  inlinePending: [],
  movedToAttention: [],
  popAttentionId: null,

  setState: (state) => set({ state }),
  patchState: (patch) => set((s) => ({ state: { ...s.state, ...patch } })),
  setConnectivity: (connectivity) => set({ connectivity }),
  setPresenting: (presenting) => set({ presenting }),
  setMode: (mode) => set((s) => ({ state: { ...s.state, mode } })),
  holdInline: (id) => set((s) => (s.inlinePending.includes(id) ? s : { inlinePending: [...s.inlinePending, id] })),
  releaseInline: (id) => set((s) => ({ inlinePending: s.inlinePending.filter((x) => x !== id) })),
  releaseAllInline: () => {
    const pending = get().inlinePending;
    if (pending.length === 0) return;
    set((s) => ({ inlinePending: [], movedToAttention: [...s.movedToAttention, ...pending] }));
  },
  consumeMoved: () => {
    const moved = get().movedToAttention;
    if (moved.length > 0) set({ movedToAttention: [] });
    return moved;
  },
  setPopAttentionId: (popAttentionId) => set({ popAttentionId }),
}));

export const selectIsOffline = (s: DockStore): boolean => s.connectivity.state === 'offline';
