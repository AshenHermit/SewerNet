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

interface AuthState {
  credentials: MatrixCredentials | null;
  setCredentials: (c: MatrixCredentials | null) => void;
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
      setCredentials: (credentials) => set({ credentials }),
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
        };
      },
    },
  ),
);
