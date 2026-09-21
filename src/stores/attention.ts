import { create } from 'zustand';

interface AttentionStore {
  /** Item open in detail view; null shows the list. */
  selectedId: string | null;
  /** Free-text note typed in the decision bar, per item. */
  notes: Record<string, string>;
  expiredExpanded: boolean;
  select: (id: string | null) => void;
  setNote: (id: string, note: string) => void;
  clearNote: (id: string) => void;
  toggleExpired: () => void;
}

export const useAttentionStore = create<AttentionStore>((set) => ({
  selectedId: null,
  notes: {},
  expiredExpanded: false,
  select: (selectedId) => set({ selectedId }),
  setNote: (id, note) => set((s) => ({ notes: { ...s.notes, [id]: note } })),
  clearNote: (id) =>
    set((s) => {
      const notes = { ...s.notes };
      delete notes[id];
      return { notes };
    }),
  toggleExpired: () => set((s) => ({ expiredExpanded: !s.expiredExpanded })),
}));
