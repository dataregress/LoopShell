import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoopAdapter } from '@/adapters/adapter';
import type { MockAdapter } from '@/adapters/mock';
import { Pill } from '@/anchor/Pill';
import { useAnchorWindow } from '@/anchor/useAnchorWindow';
import { placePanel, placePill } from '@/lib/geometry';
import { isMac } from '@/lib/env';
import { t } from '@/lib/i18n';
import { Panel } from '@/shell/Panel';
import { useTheme } from '@/shell/useTheme';
import { useDockStore } from '@/stores/dock';
import { useSettingsStore } from '@/stores/settings';
import { formatShortcut } from '@/ui/Kbd';
import { LoopMark } from '@/ui/LoopMark';
import { DevKnobs } from './DevKnobs';

const GRACE_MS = 400;

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function usePillY(mock: MockAdapter): number {
  const [y, setY] = useState(() => mock.getPillY());
  useEffect(() => mock.onPillY(setY), [mock]);
  return y;
}

/** Match a shortcut like "Ctrl+Alt+L" against a keydown. */
function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase());
  const key = parts[parts.length - 1] ?? '';
  const want = {
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    alt: parts.includes('alt') || parts.includes('option'),
    shift: parts.includes('shift'),
    meta: parts.includes('super') || parts.includes('cmd') || parts.includes('meta'),
  };
  // On macOS the docs write ⌃⌥L, which is Ctrl+Alt+L: same modifiers.
  return (
    e.ctrlKey === want.ctrl &&
    e.altKey === want.alt &&
    e.shiftKey === want.shift &&
    e.metaKey === want.meta &&
    (e.code.toLowerCase() === `key${key}` || e.key.toLowerCase() === key)
  );
}

/**
 * Browser harness: a desktop-like backdrop with the pill on the right edge and
 * the panel placed exactly as the shell would place it. Simulates the shell
 * policies that live in Rust (hotkey cycle, click-outside, grace timer).
 */
export function Harness({ adapter }: { adapter: LoopAdapter }) {
  useTheme();
  const mock = adapter as MockAdapter;
  const viewport = useViewport();
  const pillY = usePillY(mock);
  const dock = useDockStore((s) => s.state);
  const shortcutOpen = useSettingsStore((s) => s.settings.shortcutOpen);
  const shortcutPin = useSettingsStore((s) => s.settings.shortcutPin);
  const [anchorHover, setAnchorHover] = useState(false);
  const [anchorDragging, setAnchorDragging] = useState(false);
  const leaveAnchor = useRef<ReturnType<typeof setTimeout> | null>(null);

  const work = { x: 0, y: 0, w: viewport.w, h: viewport.h };
  const pill = placePill(work, pillY);
  const panel = placePanel(work, pill);
  const held = anchorHover || anchorDragging || dock.open;
  const chrome = useAnchorWindow(held);

  // Hotkeys (Rust owns these in the dock).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (matchesShortcut(e, shortcutOpen)) {
        e.preventDefault();
        if (!dock.open) void adapter.dockShow({ mode: 'ask', reason: 'hotkey' });
        else if (!dock.active) void adapter.dockActivate();
        else void adapter.dockHide({ reason: 'esc' });
      } else if (matchesShortcut(e, shortcutPin) && dock.open) {
        e.preventDefault();
        void adapter.dockPin(!dock.pinned);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adapter, dock.open, dock.active, dock.pinned, shortcutOpen, shortcutPin]);

  // Grace timer: pointer leaves both windows while unpinned and Passive.
  const over = useRef({ panel: false, pill: false });
  const grace = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evaluateGrace = useCallback(() => {
    if (grace.current) clearTimeout(grace.current);
    grace.current = null;
    const state = useDockStore.getState().state;
    if (!state.open || state.pinned || state.active) return;
    if (over.current.panel || over.current.pill) return;
    grace.current = setTimeout(() => {
      const s = useDockStore.getState().state;
      if (s.open && !s.pinned && !s.active && !over.current.panel && !over.current.pill) {
        useDockStore.getState().patchState({ open: false });
      }
    }, GRACE_MS);
  }, []);
  const enterPanel = useCallback(() => {
    over.current.panel = true;
    if (grace.current) clearTimeout(grace.current);
  }, []);
  const enterPill = useCallback(() => {
    over.current.pill = true;
    if (grace.current) clearTimeout(grace.current);
  }, []);
  const leavePanel = useCallback(() => {
    over.current.panel = false;
    evaluateGrace();
  }, [evaluateGrace]);
  const leavePill = useCallback(() => {
    over.current.pill = false;
    evaluateGrace();
  }, [evaluateGrace]);

  // Click outside both windows hides unless pinned; also drops Active.
  function onBackdropPointerDown() {
    const s = useDockStore.getState().state;
    if (s.open && !s.pinned) useDockStore.getState().patchState({ open: false });
    else if (s.open && s.active) useDockStore.getState().patchState({ active: false });
  }

  const themeIsDark = document.documentElement.dataset.theme === 'dark';

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: themeIsDark
          ? 'radial-gradient(1200px 800px at 30% 20%, #16303a 0%, #0a1519 60%, #06100f 100%)'
          : 'radial-gradient(1200px 800px at 30% 20%, #e9eef0 0%, #d7dfe2 60%, #c9d3d7 100%)',
      }}
      onPointerDown={onBackdropPointerDown}
    >
      {/* A stand-in for the user's application. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 text-center opacity-60">
        <LoopMark size={40} />
        <p className="text-lg text-fg">Loop Dock · browser harness</p>
        <p className="text-sm text-fg-muted">
          {formatShortcut(shortcutOpen)} {t('opens Ask')} · {formatShortcut(shortcutPin)} {t('pins')} · Esc{' '}
          {t('hides')} · {isMac() ? '⌘' : 'Ctrl'}+1/2/3 {t('switch modes')}
        </p>
      </div>

      {/* Panel window. */}
      <div
        className="absolute"
        style={{
          left: panel.x,
          top: panel.y,
          width: panel.w,
          height: panel.h,
          pointerEvents: dock.open ? 'auto' : 'none',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerEnter={enterPanel}
        onPointerLeave={leavePanel}
      >
        <Panel />
      </div>

      {/* Anchor window: fixed at the pill rect like the HWND; only the pill chrome takes pointer events, like the window region. */}
      {dock.pillVisible ? (
        <div
          className="pointer-events-none absolute overflow-hidden"
          style={{ left: pill.x, top: pill.y, width: pill.w, height: pill.h }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={() => {
            enterPill();
            if (leaveAnchor.current) clearTimeout(leaveAnchor.current);
            setAnchorHover(true);
          }}
          onPointerLeave={() => {
            leavePill();
            if (leaveAnchor.current) clearTimeout(leaveAnchor.current);
            leaveAnchor.current = setTimeout(() => setAnchorHover(false), 200);
          }}
        >
          <Pill
            currentTop={() => pillY}
            wide={chrome.wide}
            expanded={chrome.expanded}
            onDraggingChange={setAnchorDragging}
            className="pointer-events-auto"
          />
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void adapter.anchorShow()}
          className="absolute right-3 bottom-3 h-7 rounded-control border border-border bg-surface-raised px-2 py-1 text-xs text-fg-muted shadow-pill"
        >
          {t('Show pill')}
        </button>
      )}

      <DevKnobs mock={mock} />
    </div>
  );
}
