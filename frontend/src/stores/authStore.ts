import { create } from 'zustand';
import client from '../api/client';

const TOKEN_KEY = 'novelforge_token';

interface AuthState {
  token: string | null;
  authRequired: boolean | null; // null = unknown (still checking)
  initialized: boolean;
  init: () => Promise<void>;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  setToken: (token: string | null) => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  authRequired: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    try {
      const { data } = await client.get<{ auth_required: boolean }>('/auth/status');
      set({ authRequired: data.auth_required, initialized: true });
    } catch {
      // If the auth status endpoint is unreachable, assume not required so
      // the app remains usable (backend may still be starting up).
      set({ authRequired: false, initialized: true });
    }
  },

  login: async (password: string) => {
    try {
      const { data } = await client.post<{ token: string }>('/auth/login', { password });
      localStorage.setItem(TOKEN_KEY, data.token);
      set({ token: data.token });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null });
  },

  setToken: (token) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    set({ token });
  },

  isAuthenticated: () => {
    const { authRequired, token } = get();
    return !authRequired || !!token;
  },
}));
