import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { disconnectSocket } from './socket';
interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: 'customer'|'worker'|'admin';
  is_verified: boolean;
  is_demo?: boolean;
  worker_profile_id?: string;
  pincode?: string | null;
  city?: string | null;
  locality?: string | null;
  lat?: number | null;
  lng?: number | null;
}
interface AuthStore {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isDemoMode: boolean;
  setAuth: (u: User, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateUser: (u: Partial<User>) => void;
}
export const useAuthStore = create<AuthStore>()(persist((set) => ({
  user: null,
  token: null,
  refreshToken: null,
  isDemoMode: false,
  setAuth: (user, token, refreshToken) => {
    localStorage.setItem('sn_token', token);
    localStorage.setItem('sn_refresh_token', refreshToken);
    set({ user, token, refreshToken, isDemoMode: user.is_demo ?? false });
  },
  setTokens: (token, refreshToken) => {
    localStorage.setItem('sn_token', token);
    localStorage.setItem('sn_refresh_token', refreshToken);
    set({ token, refreshToken });
  },
  clearAuth: () => {
    localStorage.removeItem('sn_token');
    localStorage.removeItem('sn_refresh_token');
    disconnectSocket();
    set({ user: null, token: null, refreshToken: null, isDemoMode: false });
  },
  updateUser: (updates) => set(s => ({ user: s.user ? { ...s.user, ...updates } : null })),
}), { name: 'sn_auth', partialize: s => ({ user: s.user, token: s.token, refreshToken: s.refreshToken, isDemoMode: s.isDemoMode }) }));
