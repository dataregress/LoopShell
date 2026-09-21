import { create } from 'zustand';

interface ComposerStore {
  draft: string;
  setDraft: (draft: string) => void;
  clear: () => void;
}

export const useComposerStore = create<ComposerStore>((set) => ({
  draft: '',
  setDraft: (draft) => set({ draft }),
  clear: () => set({ draft: '' }),
}));
