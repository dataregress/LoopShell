import { create } from 'zustand';
import { newId } from '@/lib/ids';

export interface ToastItem {
  id: string;
  message: string;
  tone?: 'neutral' | 'success' | 'danger';
  /** Optional single action, e.g. "Resume". */
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  /** At most one visible; the rest wait in order (docs/ui-ux.md §3.10). */
  queue: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  queue: [],
  push: (toast) => set((s) => ({ queue: [...s.queue, { id: newId(), ...toast }] })),
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((t) => t.id !== id) })),
}));

export function toast(message: string, opts?: Omit<ToastItem, 'id' | 'message'>): void {
  useToastStore.getState().push({ message, ...opts });
}
