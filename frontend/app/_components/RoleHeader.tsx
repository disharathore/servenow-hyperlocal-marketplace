'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { connectSocket } from '@/lib/socket';
import { LogOut, Bell, Settings } from 'lucide-react';

export default function RoleHeader() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const readCount = () => setUnreadCount(Number(localStorage.getItem('sn_notifications_unread_count') || '0'));
    readCount();
    window.addEventListener('storage', readCount);
    window.addEventListener('sn-notification-count-updated', readCount);
    return () => {
      window.removeEventListener('storage', readCount);
      window.removeEventListener('sn-notification-count-updated', readCount);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();
    const STORAGE_KEY = 'sn_notifications';
    const COUNT_KEY = 'sn_notifications_unread_count';

    const addNotification = (title: string, description: string) => {
      let existing: Array<{ id: string; title: string; description: string; createdAt: string }> = [];
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) existing = parsed;
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      const next = [
        {
          id: crypto.randomUUID(),
          title,
          description,
          createdAt: new Date().toISOString(),
        },
        ...existing,
      ];

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      const unread = Number(localStorage.getItem(COUNT_KEY) || '0') + 1;
      localStorage.setItem(COUNT_KEY, String(unread));
      window.dispatchEvent(new Event('sn-notification-count-updated'));
    };

    const onNewBooking = () => addNotification('New job request', 'A customer requested your service.');
    const onBookingAccepted = () => addNotification('Booking accepted', 'Your worker accepted the booking.');
    const onBookingRejected = () => addNotification('Booking rejected', 'Your booking was declined.');
    const onJobStarted = () => addNotification('Job started', 'Worker has started your job.');
    const onJobCompleted = () => addNotification('Job completed', 'Please leave a rating and review.');
    const onPaymentConfirmed = () => addNotification('Payment success', 'Payment has been confirmed.');

    socket.on('new_booking', onNewBooking);
    socket.on('booking_accepted', onBookingAccepted);
    socket.on('booking_rejected', onBookingRejected);
    socket.on('job_started', onJobStarted);
    socket.on('job_completed', onJobCompleted);
    socket.on('payment_confirmed', onPaymentConfirmed);

    return () => {
      socket.off('new_booking', onNewBooking);
      socket.off('booking_accepted', onBookingAccepted);
      socket.off('booking_rejected', onBookingRejected);
      socket.off('job_started', onJobStarted);
      socket.off('job_completed', onJobCompleted);
      socket.off('payment_confirmed', onPaymentConfirmed);
    };
  }, [user]);

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
                {unreadCount > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />}
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
