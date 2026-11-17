import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  getActiveAccount,
  getActiveUserId,
  removeAccount,
  setActiveAccount,
  upsertAccount,
  type MatrixCredentials,
} from '../../client/accounts';
import {
  authSessionToCredentials,
  credentialsToAuthSession,
} from '../../lib/legacy-session';
import type { AuthSession } from '../../lib/matrix-client';

interface AuthState {
  credentials: MatrixCredentials | null;
  setCredentials: (c: MatrixCredentials | null) => void;
  /** Legacy session shape — screens migrate away from it in later tasks. */
  session: AuthSession | null;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
}

/** Custom persist storage: the accounts map is the single source of truth. */
const accountsStorage: StateStorage = {
  getItem: () => {
    const active = getActiveAccount();
    return active
      ? JSON.stringify({ state: { credentials: active }, version: 1 })
      : null;
  },
  setItem: (_name, value: string) => {
    const parsed = JSON.parse(value) as { state: { credentials: MatrixCredentials | null } };
    const credentials = parsed.state.credentials;
    if (credentials) {
      upsertAccount(credentials);
      setActiveAccount(credentials.userId);
    } else {
      const activeId = getActiveUserId();
      if (activeId) removeAccount(activeId);
    }
  },
  removeItem: () => {
    const activeId = getActiveUserId();
    if (activeId) removeAccount(activeId);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      credentials: null,
      setCredentials: (c) =>
        set({
          credentials: c,
          session: c ? credentialsToAuthSession(c) : null,
        }),
      session: null,
      setSession: (session) =>
        set({
          session,
          credentials: authSessionToCredentials(session),
        }),
      clearSession: () => set({ credentials: null, session: null }),
    }),
    {
      name: 'sewernet:auth-v2',
      version: 1,
      storage: createJSONStorage(() => accountsStorage),
      partialize: (state) => ({ credentials: state.credentials }),
      merge: (persisted, current) => {
        const credentials =
          (persisted as { credentials: MatrixCredentials | null } | undefined)
            ?.credentials ?? null;
        return {
          ...current,
          credentials,
          session: credentials ? credentialsToAuthSession(credentials) : null,
        };
      },
    },
  ),
);
