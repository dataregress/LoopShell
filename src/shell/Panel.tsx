import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TableCard } from '@contracts/schemas/cards';
import type { HideReason, Mode } from '@contracts/schemas/dock';
import { useAdapter } from '@/adapters/AdapterProvider';
import { TableSheet } from '@/cards';
import { useAttentionCount } from '@/hooks/useAttention';
import { useJourney } from '@/hooks/useLedger';
import { cn } from '@/lib/cn';
import { isMac } from '@/lib/env';
import { t } from '@/lib/i18n';
import { AskFooter, AskMode } from '@/modes/ask';
import { AttentionFooter, AttentionMode } from '@/modes/attention';
import { RecentFooter, RecentMode } from '@/modes/recent';
import { useAskStore } from '@/stores/ask';
import { useAttentionStore } from '@/stores/attention';
import { useDockStore } from '@/stores/dock';
import { useLedgerStore } from '@/stores/ledger';
import { useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { toast } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import { Toaster } from '@/ui/Toaster';
import { useMotionPresets } from '@/ui/motion';
import { PanelContainerProvider } from '@/ui/panel-container';
import { PanelChrome } from './PanelChrome';
import { SettingsSheet } from './SettingsSheet';
import { SignedOut } from './SignedOut';
import { StatusStrip } from './StatusStrip';
import { useShellEvents } from './useShellEvents';
import { useTheme } from './useTheme';

const MODE_ORDER: Mode[] = ['ask', 'attention', 'recent'];

/** True while a Radix layer (sheet, menu) is open; Esc then belongs to it. */
function hasOpenLayer(root: HTMLElement | null): boolean {
  return !!root?.querySelector('[role="dialog"], [role="menu"][data-state="open"]');
}

/** Table cards visible right now (Ask thread + open journey detail), for the "Show all" sheet. */
function useTableCards(): TableCard[] {
  const items = useAskStore((s) => s.thread.items);
  const detailJourneyId = useLedgerStore((s) => s.detailJourneyId);
  const detail = useJourney(detailJourneyId);
  const detailCards = detail.data?.cards;
  return useMemo(() => {
    const out: TableCard[] = [];
    for (const i of items) if (i.kind === 'card' && i.card.type === 'table') out.push(i.card);
    for (const c of detailCards ?? []) if (c.type === 'table') out.push(c);
    return out;
  }, [items, detailCards]);
}

/**
 * The panel window's root. Composes chrome, the active mode, its footer,
 * the status strip, toasts and in-panel sheets. Mounted once; visibility is
 * driven by `dock.open` so the enter animation starts on the first frame.
 */
export function Panel({ className }: { className?: string }) {
  useShellEvents();
  useTheme();
  const adapter = useAdapter();
  const m = useMotionPresets();
  const [root, setRoot] = useState<HTMLElement | null>(null);

  const dock = useDockStore((s) => s.state);
  const setMode = useDockStore((s) => s.setMode);
  const patchState = useDockStore((s) => s.patchState);
  const releaseAllInline = useDockStore((s) => s.releaseAllInline);
  const consumeMoved = useDockStore((s) => s.consumeMoved);
  const session = useSessionStore((s) => s.session);
  const sessionLoaded = useSessionStore((s) => s.loaded);
  const vibrancy = useSettingsStore((s) => s.settings.vibrancy);
  const attentionCount = useAttentionCount();

  const attentionSelectedId = useAttentionStore((s) => s.selectedId);
  const selectAttention = useAttentionStore((s) => s.select);
  const detailJourneyId = useLedgerStore((s) => s.detailJourneyId);
  const openDetail = useLedgerStore((s) => s.openDetail);

  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const [settingsSection, setSettingsSection] = useState<'about' | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [continueJourneyId, setContinueJourneyId] = useState<string | null>(null);
  const tableCards = useTableCards();
  const hideReason = useRef<HideReason>('ui');

  const changeMode = useCallback(
    (mode: Mode) => {
      setMode(mode);
      void adapter.dockSetMode(mode);
    },
    [adapter, setMode],
  );

  /** Start the exit animation; `dock_hide` is sent when it completes (§2.3). */
  const requestHide = useCallback(
    (reason: HideReason) => {
      hideReason.current = reason;
      patchState({ open: false, active: false });
    },
    [patchState],
  );

  // Open/hide transitions: release inline proposals on hide; toast on reopen.
  const prevOpen = useRef(dock.open);
  useEffect(() => {
    if (prevOpen.current && !dock.open) releaseAllInline();
    if (!prevOpen.current && dock.open) {
      const moved = consumeMoved();
      if (moved.length > 0) {
        toast(t('Moved to Attention'), {
          action: { label: t('View'), onClick: () => changeMode('attention') },
        });
      }
    }
    prevOpen.current = dock.open;
  }, [dock.open, releaseAllInline, consumeMoved, changeMode]);

  // Passive -> Active: focus the right thing for the current mode.
  const prevActive = useRef(dock.active);
  useEffect(() => {
    if (!prevActive.current && dock.active) setFocusTick((n) => n + 1);
    prevActive.current = dock.active;
  }, [dock.active]);

  // Esc hides; Ctrl/⌘+1/2/3 switch modes while Active.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (hasOpenLayer(root)) return;
        e.preventDefault();
        requestHide('esc');
        return;
      }
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && e.key >= '1' && e.key <= '3') {
        const mode = MODE_ORDER[Number(e.key) - 1];
        if (mode) {
          e.preventDefault();
          changeMode(mode);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [root, requestHide, changeMode]);

  const signOut = useCallback(() => {
    setSettingsOpen(false);
    void adapter.authSignOut();
  }, [adapter, setSettingsOpen]);

  const onBack =
    dock.mode === 'attention' && attentionSelectedId
      ? () => selectAttention(null)
      : dock.mode === 'recent' && detailJourneyId
        ? () => openDetail(null)
        : null;

  const signedIn = session.state === 'signed_in';

  return (
    <AnimatePresence onExitComplete={() => void adapter.dockHide({ reason: hideReason.current })}>
      {dock.open && (
        <motion.div
          key="panel"
          ref={setRoot}
          variants={m.slideInRight}
          initial="hidden"
          animate="visible"
          exit="exit"
          data-vibrancy={vibrancy ? 'on' : 'off'}
          className={cn(
            'relative flex h-full w-full flex-col overflow-hidden rounded-panel border border-border bg-surface text-fg',
            className,
          )}
          onContextMenu={(e) => {
            const el = e.target;
            if (el instanceof HTMLElement && el.closest('input, textarea, [contenteditable="true"]')) return;
            e.preventDefault();
          }}
        >
          <PanelContainerProvider container={root}>
            {!sessionLoaded ? null : !signedIn ? (
              <SignedOut session={session} />
            ) : (
              <PanelChrome
                mode={dock.mode}
                pinned={dock.pinned}
                onPinToggle={() => void adapter.dockPin(!dock.pinned)}
                onAbout={() => {
                  setSettingsSection('about');
                  setSettingsOpen(true);
                }}
                onSignOut={signOut}
                onBack={onBack}
                footer={
                  dock.mode === 'ask' ? (
                    <AskFooter composerFocusRequest={focusTick} />
                  ) : dock.mode === 'attention' ? (
                    <AttentionFooter />
                  ) : (
                    <RecentFooter />
                  )
                }
                statusStrip={<StatusStrip />}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={dock.mode}
                    variants={m.fadeUp}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="h-full"
                  >
                    {dock.mode === 'ask' && (
                      <AskMode
                        onSwitchMode={changeMode}
                        continueJourneyId={continueJourneyId}
                        onContinued={() => setContinueJourneyId(null)}
                      />
                    )}
                    {dock.mode === 'attention' && <AttentionMode focusRequest={focusTick} />}
                    {dock.mode === 'recent' && (
                      <RecentMode
                        onAsk={() => changeMode('ask')}
                        onContinueInAsk={(journeyId) => {
                          setContinueJourneyId(journeyId);
                          changeMode('ask');
                        }}
                        focusRequest={focusTick}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
                <Toaster />
                <TableSheet cards={tableCards} />
                <SettingsSheet
                  open={settingsOpen}
                  onOpenChange={(open) => {
                    setSettingsOpen(open);
                    // The tray's "Settings…" opens the sheet at the top, not where About left it.
                    if (!open) setSettingsSection(null);
                  }}
                  section={settingsSection}
                  onSignOut={signOut}
                />
              </PanelChrome>
            )}
            <div aria-live="polite" className="sr-only">
              {signedIn && attentionCount > 0
                ? attentionCount === 1
                  ? t('1 item needs your attention')
                  : t('{n} items need your attention', { n: attentionCount })
                : ''}
            </div>
          </PanelContainerProvider>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
