import { create } from 'zustand';
import {
  getActiveAccount,
  subscribeAccounts,
} from '../../client/accounts';
import type { MatrixCredentials } from '../../client/account-types';

interface AuthState {
  credentials: MatrixCredentials | null;
  setCredentials: (c: MatrixCredentials | null) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  credentials: null,
  setCredentials: (credentials) => set({ credentials }),
}));

// Hydrate from accounts on module load
try {
  const active = getActiveAccount();
  useAuthStore.getState().setCredentials(active);
} catch {
  // Accounts not initialized yet
}

// Subscribe to account changes
subscribeAccounts(() => {
  try {
    const active = getActiveAccount();
    useAuthStore.getState().setCredentials(active);
  } catch {
    // Accounts not initialized yet
  }
});
