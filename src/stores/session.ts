import { create } from 'zustand';
import type { Session } from '@contracts/schemas/session';

interface SessionStore {
  session: Session;
  loaded: boolean;
  setSession: (session: Session) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  session: { state: 'signed_out' },
  loaded: false,
  setSession: (session) => set({ session, loaded: true }),
}));

export const selectUserId = (s: SessionStore): string => s.session.userId ?? 'anonymous';
