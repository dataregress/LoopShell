import { createContext, use } from 'react';
import type { ReactNode } from 'react';

const PanelContainerContext = createContext<HTMLElement | null>(null);

/** Provides the panel root so portals (sheets, toasts) render inside the panel window. */
export function PanelContainerProvider({ container, children }: { container: HTMLElement | null; children: ReactNode }) {
  return <PanelContainerContext value={container}>{children}</PanelContainerContext>;
}

export function usePanelContainer(): HTMLElement | null {
  return use(PanelContainerContext);
}
