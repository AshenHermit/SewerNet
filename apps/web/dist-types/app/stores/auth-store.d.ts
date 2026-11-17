import { type MatrixCredentials } from '../../client/accounts';
import type { AuthSession } from '../../lib/matrix-client';
interface AuthState {
    credentials: MatrixCredentials | null;
    setCredentials: (c: MatrixCredentials | null) => void;
    /** Legacy session shape — screens migrate away from it in later tasks. */
    session: AuthSession | null;
    setSession: (session: AuthSession) => void;
    clearSession: () => void;
}
export declare const useAuthStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<AuthState>, "setState" | "persist"> & {
    setState(partial: AuthState | Partial<AuthState> | ((state: AuthState) => AuthState | Partial<AuthState>), replace?: false | undefined): unknown;
    setState(state: AuthState | ((state: AuthState) => AuthState), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<AuthState, unknown, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void>;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: AuthState) => void) => () => void;
        onFinishHydration: (fn: (state: AuthState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<AuthState, unknown, unknown>>;
    };
}>;
export {};
//# sourceMappingURL=auth-store.d.ts.map