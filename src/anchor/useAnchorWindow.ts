import { useEffect, useState } from 'react';
import { useAdapter } from '@/adapters/AdapterProvider';
import { ANCHOR_COLLAPSE_MS } from '@/lib/geometry';

export interface AnchorChrome {
  /** Width target for the pill outline: 56 (pill) or 20 (tab). Motion eases between them. */
  wide: boolean;
  /** Which chrome is mounted: the mode toolbar (true) or the edge tab (false). */
  expanded: boolean;
}

/**
 * Sequences the tab ↔ pill reveal with the native anchor window (ADR-005).
 * The window stays at the pill size; Rust only opens or closes the window
 * region that clips it to the tab. Expand: region opens, then the chrome
 * slides out. Collapse: the chrome slides in, then the region closes and the
 * tab chrome swaps in. No native geometry changes while anything animates.
 */
export function useAnchorWindow(intent: boolean): AnchorChrome {
  const adapter = useAdapter();
  /** Rust has confirmed the whole window is showing, so the chrome may grow past the tab. */
  const [regionOpen, setRegionOpen] = useState(intent);
  const [expanded, setExpanded] = useState(intent);

  useEffect(() => {
    if (intent) {
      let cancelled = false;
      void adapter.anchorSetExpanded(true).then(() => {
        if (cancelled) return;
        setRegionOpen(true);
        setExpanded(true);
      });
      return () => {
        cancelled = true;
      };
    }
    const id = window.setTimeout(() => {
      setExpanded(false);
      setRegionOpen(false);
      void adapter.anchorSetExpanded(false);
    }, ANCHOR_COLLAPSE_MS);
    return () => window.clearTimeout(id);
  }, [adapter, intent]);

  return { wide: intent && regionOpen, expanded };
}
