import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export const DRAG_THRESHOLD_PX = 4;
const FRAME_MS = 16;

export interface PillDragHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

export interface UsePillDragOptions {
  /** Called at most every 16 ms with the pill's new top edge in logical px. */
  onMove: (yLogical: number) => void;
  /** Called on release after a drag; persist here. */
  onCommit: (yLogical: number) => void;
  /**
   * Called on release when the pointer never moved past the threshold.
   * `target` is the element under the pointer at press time (pointer capture
   * makes later events report the pill itself), so the pill can tell a mode
   * button from the Loop mark.
   */
  onClick: (target: EventTarget | null) => void;
  /** Where the pill's top edge is now, in the same coordinate space as `screenY`. */
  currentTop: () => number;
}

/**
 * Vertical drag for the pill (docs/shell-architecture.md §2.2): threshold 4 px,
 * throttled moves, commit on release. X is pinned by the shell. The whole pill
 * is the handle, buttons included; a press that does not move is a click.
 */
export function usePillDrag({ onMove, onCommit, onClick, currentTop }: UsePillDragOptions): {
  dragging: boolean;
  pressed: boolean;
  handlers: PillDragHandlers;
} {
  const [dragging, setDragging] = useState(false);
  const [pressed, setPressed] = useState(false);
  const start = useRef<{
    screenY: number;
    top: number;
    pointerId: number;
    target: EventTarget | null;
  } | null>(null);
  const moved = useRef(false);
  const lastSent = useRef(0);
  const lastY = useRef(0);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      start.current = { screenY: e.screenY, top: currentTop(), pointerId: e.pointerId, target: e.target };
      moved.current = false;
      setPressed(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [currentTop],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const delta = e.screenY - s.screenY;
      if (!moved.current && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      if (!moved.current) {
        moved.current = true;
        setDragging(true);
      }
      lastY.current = s.top + delta;
      const now = performance.now();
      if (now - lastSent.current >= FRAME_MS) {
        lastSent.current = now;
        onMove(lastY.current);
      }
    },
    [onMove],
  );

  const finish = useCallback(
    (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const s = start.current;
      if (!s || e.pointerId !== s.pointerId) return;
      start.current = null;
      setPressed(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (moved.current) {
        setDragging(false);
        onCommit(lastY.current);
      } else if (!cancelled) {
        onClick(s.target);
      }
    },
    [onCommit, onClick],
  );

  return {
    dragging,
    pressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => finish(e, false),
      onPointerCancel: (e) => finish(e, true),
    },
  };
}
