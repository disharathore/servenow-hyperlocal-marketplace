'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { LogOut, Bell, Settings } from 'lucide-react';

export default function RoleHeader() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  if (!user) return null;

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href={user.role === 'worker' ? '/worker/dashboard' : user.role === 'admin' ? '/admin' : '/'} className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <span className="font-bold text-gray-900">ServeNow</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 capitalize">{user.role}</span>
        </Link>
        <div className="flex items-center gap-4">
          {user.role !== 'admin' && (
            <>
              <button className="relative p-2 text-gray-400 hover:text-gray-600" onClick={() => router.push('/notifications')}>
                <Bell size={20} />
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600" onClick={() => router.push('/settings')}>
                <Settings size={20} />
              </button>
            </>
          )}
          <button onClick={() => router.push('/profile')} className="text-sm text-gray-600 hover:text-blue-600 font-medium">
            Profile
          </button>
          {user.role === 'customer' && (
            <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-600 hover:text-blue-600 font-medium">
              My Bookings
            </button>
          )}
          {user.role === 'worker' && (
            <button onClick={() => router.push('/worker/earnings')} className="text-sm text-gray-600 hover:text-blue-600 font-medium">
              Earnings
            </button>
          )}
          <button onClick={handleLogout} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
