import { create } from 'zustand';
import { auth, SESSION_EXPIRED_EVENT } from '@/lib/api';

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** True until the first /auth/me call settles, so guards can hold rather than bounce. */
  isLoading: boolean;
  /** Set when a session ends unexpectedly, so the sign-in screen can explain why. */
  endedReason: { message: string; action?: string } | null;
  setUser: (user: User | null) => void;
  clearEndedReason: () => void;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  endedReason: null,

  setUser: (user) => set({ user, isAuthenticated: Boolean(user) }),
  clearEndedReason: () => set({ endedReason: null }),

  logout: async () => {
    try {
      await auth.logout();
    } catch {
      // The cookies are cleared server-side on a best-effort basis; the local
      // session ends either way, so a network failure must not trap the user
      // in a signed-in state.
    }
    set({ user: null, isAuthenticated: false, endedReason: null });
  },

  logoutEverywhere: async () => {
    try {
      await auth.logoutEverywhere();
    } catch {
      // Same reasoning as logout.
    }
    set({ user: null, isAuthenticated: false, endedReason: null });
  },

  checkAuth: async () => {
    try {
      const response = await auth.getMe();
      set({ user: response.data.user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

/**
 * The API layer refreshes expired sessions transparently. It only emits this
 * event once a refresh has actually failed, which means the session is
 * genuinely over. Clearing state here lets the route guards redirect, and
 * carries the server's explanation to the sign-in screen instead of dropping
 * the user there with no reason given.
 */
window.addEventListener(SESSION_EXPIRED_EVENT, (event) => {
  const detail = (event as CustomEvent<{ message: string; action?: string }>).detail;
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    endedReason: detail ?? { message: 'Your session has ended.', action: 'Sign in again to continue.' },
  });
});
