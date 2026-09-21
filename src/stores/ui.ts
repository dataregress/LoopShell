import { create } from 'zustand';

interface UiStore {
  settingsOpen: boolean;
  /** `table` card "Show all" sheet. */
  tableSheetCardId: string | null;
  setSettingsOpen: (open: boolean) => void;
  openTableSheet: (cardId: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  settingsOpen: false,
  tableSheetCardId: null,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  openTableSheet: (tableSheetCardId) => set({ tableSheetCardId }),
}));
