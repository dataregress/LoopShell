import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import type { LoopAdapter } from './adapter';

const AdapterContext = createContext<LoopAdapter | null>(null);

export function AdapterProvider({ adapter, children }: { adapter: LoopAdapter; children: ReactNode }) {
  return <AdapterContext value={adapter}>{children}</AdapterContext>;
}

/** The only way components reach the shell. */
export function useAdapter(): LoopAdapter {
  const adapter = use(AdapterContext);
  if (!adapter) throw new Error('useAdapter must be used inside <AdapterProvider>');
  return adapter;
}
