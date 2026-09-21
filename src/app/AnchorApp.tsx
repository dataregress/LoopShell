import { useCallback, useEffect, useRef, useState } from 'react';
import { Pill } from '@/anchor/Pill';
import { useAnchorWindow } from '@/anchor/useAnchorWindow';
import { useShellEvents } from '@/shell/useShellEvents';
import { useTheme } from '@/shell/useTheme';
import { useDockStore } from '@/stores/dock';

const LEAVE_MS = 200;
/** Ignore pointerenter from WebView2 creating the window under the cursor. */
const ARM_MS = 120;

/** The `anchor` window: edge tab by default, pill on hover (ADR-005). */
export function AnchorApp() {
  useShellEvents();
  useTheme();
  const pillVisible = useDockStore((s) => s.state.pillVisible);
  const dockOpen = useDockStore((s) => s.state.open);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      armed.current = true;
    }, ARM_MS);
    return () => window.clearTimeout(id);
  }, []);

  const held = hover || dragging || dockOpen;
  const chrome = useAnchorWindow(held);

  const clearLeave = () => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const onEnter = () => {
    if (!armed.current) return;
    clearLeave();
    setHover(true);
  };

  const onLeave = () => {
    clearLeave();
    leaveTimer.current = window.setTimeout(() => setHover(false), LEAVE_MS);
  };

  const onDraggingChange = useCallback((next: boolean) => setDragging(next), []);

  if (!pillVisible) return null;
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onPointerEnter={onEnter}
      onPointerMove={onEnter}
      onPointerLeave={onLeave}
    >
      <Pill
        currentTop={() => window.screenY}
        wide={chrome.wide}
        expanded={chrome.expanded}
        onDraggingChange={onDraggingChange}
      />
    </div>
  );
}
