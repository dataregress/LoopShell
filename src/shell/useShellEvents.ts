import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import type { AttentionItem } from '@contracts/schemas/attention';
import type { LedgerFilters, LedgerPage } from '@contracts/schemas/ledger';
import { parseCards } from '@contracts/schemas/cards';
import { useAdapter } from '@/adapters/AdapterProvider';
import { useAdapterEvent } from '@/adapters/useAdapterEvent';
import { keys } from '@/hooks/queryKeys';
import { rowMatchesFilters } from '@/hooks/useLedger';
import { newId, nowIso } from '@/lib/ids';
import { t } from '@/lib/i18n';
import { log } from '@/lib/log';
import { useAskStore } from '@/stores/ask';
import { useAttentionStore } from '@/stores/attention';
import { useDockStore } from '@/stores/dock';
import { selectUserId, useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { useThemeStore } from '@/stores/theme';
import { toast } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';

/**
 * Wires every Rust -> UI event into stores and the query cache, and performs
 * the initial reads. Mounted once by the panel root (and, for the subset it
 * needs, by the anchor root).
 */
export function useShellEvents(): void {
  const adapter = useAdapter();
  const qc = useQueryClient();
  const userId = useSessionStore(selectUserId);

  // ---- Initial reads ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [dock, session, settings] = await Promise.allSettled([
        adapter.dockGetState(),
        adapter.authGetSession(),
        adapter.settingsGet(),
      ]);
      if (cancelled) return;
      if (dock.status === 'fulfilled') useDockStore.getState().setState(dock.value);
      if (session.status === 'fulfilled') useSessionStore.getState().setSession(session.value);
      else useSessionStore.getState().setSession({ state: 'signed_out', reason: 'error' });
      if (settings.status === 'fulfilled') useSettingsStore.getState().setSettings(settings.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  // ---- Shell state --------------------------------------------------------
  useAdapterEvent(
    'dock_state_changed',
    useCallback((state) => useDockStore.getState().setState(state), []),
  );
  useAdapterEvent(
    'theme_changed',
    useCallback(({ system }) => useThemeStore.getState().setSystem(system), []),
  );
  useAdapterEvent(
    'presentation_changed',
    useCallback(({ presenting }) => useDockStore.getState().setPresenting(presenting), []),
  );
  useAdapterEvent(
    'settings_requested',
    useCallback(() => useUiStore.getState().setSettingsOpen(true), []),
  );
  // Saved from the panel's sheet; the anchor webview has its own store, so
  // without this the pill would keep the old theme until restart.
  useAdapterEvent(
    'settings_changed',
    useCallback((settings) => useSettingsStore.getState().setSettings(settings), []),
  );
  useAdapterEvent(
    'connectivity_changed',
    useCallback(
      (c) => {
        const prev = useDockStore.getState().connectivity;
        useDockStore.getState().setConnectivity(c);
        if (prev.state === 'offline' && c.state === 'online') {
          toast(t('Back online'), { tone: 'success' });
          void qc.invalidateQueries();
        }
      },
      [qc],
    ),
  );
  useAdapterEvent(
    'session_changed',
    useCallback(
      (session) => {
        const prev = useSessionStore.getState().session;
        useSessionStore.getState().setSession(session);
        if (prev.state === 'signed_in' && session.state !== 'signed_in') {
          qc.clear();
          useAskStore.getState().dispatch({ type: 'new_ask' });
          useAttentionStore.getState().select(null);
        }
      },
      [qc],
    ),
  );

  // ---- Journeys -----------------------------------------------------------
  useAdapterEvent(
    'task_state',
    useCallback(
      (event) => {
        const { cards, dropped } = parseCards(event.cards ?? []);
        for (const d of dropped) log.warn('unknown card dropped', { type: d.type, cardId: d.cardId, journeyId: event.journeyId });
        useAskStore.getState().dispatch({ type: 'task_state', event, cards, newId, now: nowIso });
        void qc.invalidateQueries({ queryKey: keys.journey(event.journeyId) });
      },
      [qc],
    ),
  );

  // ---- Attention ----------------------------------------------------------
  useAdapterEvent(
    'attention_new',
    useCallback(
      ({ item }) => {
        qc.setQueryData<AttentionItem[]>(keys.attention(userId), (items) => {
          const rest = (items ?? []).filter((i) => i.attentionId !== item.attentionId);
          return [item, ...rest];
        });
        const dock = useDockStore.getState();
        const heldInline = dock.inlinePending.includes(item.attentionId);
        // Arrived while hidden: the shell opens Attention; we pre-select the item (docs/ui-ux.md §3.3).
        if (!dock.state.open && !heldInline) dock.setPopAttentionId(item.attentionId);
      },
      [qc, userId],
    ),
  );
  const settle = useCallback(
    (kind: 'resolved' | 'expired', attentionId: string) => {
      qc.setQueryData<AttentionItem[]>(keys.attention(userId), (items) =>
        kind === 'resolved'
          ? items?.filter((i) => i.attentionId !== attentionId)
          : items?.map((i) => (i.attentionId === attentionId ? { ...i, state: 'expired' as const } : i)),
      );
      useDockStore.getState().releaseInline(attentionId);
      const attention = useAttentionStore.getState();
      if (attention.selectedId === attentionId && kind === 'resolved') {
        attention.select(null);
        toast(t('Already decided elsewhere'));
      }
    },
    [qc, userId],
  );
  useAdapterEvent(
    'attention_resolved',
    useCallback(({ attentionId }) => settle('resolved', attentionId), [settle]),
  );
  useAdapterEvent(
    'attention_expired',
    useCallback(({ attentionId }) => settle('expired', attentionId), [settle]),
  );

  // ---- Ledger -------------------------------------------------------------
  useAdapterEvent(
    'ledger_appended',
    useCallback(
      ({ row }) => {
        // Filters live in the key; patch each cached page set whose filters match.
        for (const q of qc.getQueryCache().findAll({ queryKey: keys.ledgerRoot(userId) })) {
          const filters = q.queryKey[2] as LedgerFilters | undefined;
          if (!filters || !rowMatchesFilters(row, filters, userId)) continue;
          qc.setQueryData<InfiniteData<LedgerPage, string | undefined>>(q.queryKey, (data) => {
            if (!data || data.pages.length === 0) return data;
            const [first, ...rest] = data.pages;
            if (!first || first.rows.some((r) => r.eventId === row.eventId)) return data;
            return { ...data, pages: [{ ...first, rows: [row, ...first.rows] }, ...rest] };
          });
        }
        void qc.invalidateQueries({ queryKey: keys.journey(row.journeyId) });
      },
      [qc, userId],
    ),
  );
}
