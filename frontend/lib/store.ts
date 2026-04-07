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
  worker_profile_id?: string;
  pincode?: string | null;
  city?: string | null;
  locality?: string | null;
  lat?: number | null;
  lng?: number | null;
}
interface AuthStore { user: User|null; token: string|null; setAuth: (u: User, t: string) => void; clearAuth: () => void; updateUser: (u: Partial<User>) => void; }
export const useAuthStore = create<AuthStore>()(persist((set) => ({
  user: null, token: null,
  setAuth: (user, token) => { localStorage.setItem('sn_token', token); set({ user, token }); },
  clearAuth: () => {
    localStorage.removeItem('sn_token');
    disconnectSocket();
    set({ user: null, token: null });
  },
  updateUser: (updates) => set(s => ({ user: s.user ? { ...s.user, ...updates } : null })),
}), { name: 'sn_auth', partialize: s => ({ user: s.user, token: s.token }) }));
