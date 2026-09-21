import { create } from 'zustand';
import type { LedgerEventType, LedgerFilters, LedgerScope } from '@contracts/schemas/ledger';
import { RECENT_INITIAL, RECENT_STEP } from '@/modes/recent/display';

export const EMPTY_FILTERS: LedgerFilters = { platforms: [], statuses: [], scope: 'all' };

interface LedgerStore {
  filters: LedgerFilters;
  /** journeyId -> expanded. Absent = default (latest 3 expanded). */
  expanded: Record<string, boolean>;
  /** Journey open in detail view. */
  detailJourneyId: string | null;
  /** How many journeys Recent shows; resets whenever the filters change. */
  visibleJourneys: number;
  togglePlatform: (platform: string) => void;
  toggleStatus: (status: LedgerEventType) => void;
  setScope: (scope: LedgerScope) => void;
  clearFilters: () => void;
  toggleJourney: (journeyId: string, defaultExpanded: boolean) => void;
  openDetail: (journeyId: string | null) => void;
  showMore: () => void;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export const useLedgerStore = create<LedgerStore>((set) => ({
  filters: EMPTY_FILTERS,
  expanded: {},
  detailJourneyId: null,
  visibleJourneys: RECENT_INITIAL,
  togglePlatform: (p) =>
    set((s) => ({
      filters: { ...s.filters, platforms: toggle(s.filters.platforms, p) },
      visibleJourneys: RECENT_INITIAL,
    })),
  toggleStatus: (st) =>
    set((s) => ({
      filters: { ...s.filters, statuses: toggle(s.filters.statuses, st) },
      visibleJourneys: RECENT_INITIAL,
    })),
  setScope: (scope) => set((s) => ({ filters: { ...s.filters, scope }, visibleJourneys: RECENT_INITIAL })),
  clearFilters: () => set({ filters: EMPTY_FILTERS, visibleJourneys: RECENT_INITIAL }),
  showMore: () => set((s) => ({ visibleJourneys: s.visibleJourneys + RECENT_STEP })),
  toggleJourney: (journeyId, defaultExpanded) =>
    set((s) => ({ expanded: { ...s.expanded, [journeyId]: !(s.expanded[journeyId] ?? defaultExpanded) } })),
  openDetail: (detailJourneyId) => set({ detailJourneyId }),
}));

export const hasActiveFilters = (f: LedgerFilters): boolean =>
  f.platforms.length > 0 || f.statuses.length > 0 || f.scope !== 'all';
