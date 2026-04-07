import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: 'customer' | 'worker' | 'admin';
  is_verified: boolean;
  worker_profile_id?: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('sn_token', token);
        set({ user, token });
      },
      clearAuth: () => {
        localStorage.removeItem('sn_token');
        set({ user: null, token: null });
      },
      updateUser: (updates) =>
        set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),
    }),
    { name: 'sn_auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
);
