import { isTauri } from '@/lib/env';
import type { LoopAdapter } from './adapter';

let instance: LoopAdapter | null = null;

/**
 * Pick the adapter for this document: `tauri` inside the dock, `mock` in a
 * browser. Lazy-imported so the browser bundle never evaluates Tauri APIs.
 */
export async function createAdapter(): Promise<LoopAdapter> {
  if (instance) return instance;
  if (isTauri()) {
    const { TauriAdapter } = await import('./tauri');
    instance = new TauriAdapter();
  } else {
    const { MockAdapter } = await import('./mock');
    instance = new MockAdapter();
  }
  return instance;
}
