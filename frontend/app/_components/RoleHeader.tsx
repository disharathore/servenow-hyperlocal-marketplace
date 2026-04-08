'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { connectSocket } from '@/lib/socket';
import { authApi, notificationsApi } from '@/lib/api';
import { LogOut, Bell, Settings } from 'lucide-react';
import { toast } from 'sonner';

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  read_status: boolean;
  booking_id?: string;
  created_at: string;
}

function formatNotificationTitle(type: string) {
  if (type === 'booking_confirmed') return 'Booking confirmed';
  if (type === 'worker_arriving') return 'Worker arriving';
  return type.replaceAll('_', ' ');
}

export default function RoleHeader() {
  const router = useRouter();
  const { user, refreshToken, clearAuth } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const r = await notificationsApi.list(12);
      const items = Array.isArray(r.data) ? (r.data as NotificationItem[]) : [];
      setNotifications(items);
      setUnreadCount(items.filter((item) => !item.read_status).length);
    } catch {
      // Keep panel resilient even if API fails temporarily.
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    notificationsApi.unreadCount()
      .then((r) => {
        if (mounted) setUnreadCount(Number(r.data?.unread_count || 0));
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!isNotificationsOpen) return;

    const onOutsideClick = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(targetNode)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();
    const onNotification = (payload: NotificationItem) => {
      setUnreadCount((prev) => prev + 1);
      setNotifications((prev) => [payload, ...prev].slice(0, 12));
    };
    const onReadAll = () => setUnreadCount(0);

    socket.on('notification:new', onNotification);
    window.addEventListener('sn-notifications-read-all', onReadAll);

    return () => {
      socket.off('notification:new', onNotification);
      window.removeEventListener('sn-notifications-read-all', onReadAll);
    };
  }, [user]);

  if (!user) return null;

  const toggleNotifications = () => {
    const nextOpen = !isNotificationsOpen;
    setIsNotificationsOpen(nextOpen);
    if (nextOpen) loadNotifications();
  };

  const markAsRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) => prev.map((item) => (
        item.id === id ? { ...item, read_status: true } : item
      )));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      toast.error('Could not mark notification as read.');
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, read_status: true })));
      setUnreadCount(0);
      window.dispatchEvent(new Event('sn-notifications-read-all'));
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Could not update notifications.');
    }
  };

  const handleLogout = async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // Local logout should still proceed even if revocation call fails.
    } finally {
      clearAuth();
      router.push('/login');
    }
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link href={user.role === 'worker' ? '/worker/dashboard' : user.role === 'admin' ? '/admin' : '/'} className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <span className="font-bold text-gray-900">ServeNow</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 capitalize">{user.role}</span>
        </Link>
        <div className="flex items-center gap-4">
          <div ref={panelRef} className="relative">
            <button
              className="relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              onClick={toggleNotifications}
              aria-label="Open notifications"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] leading-[18px] text-center font-semibold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-[340px] max-w-[90vw] rounded-2xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-sm text-gray-900">Notifications</p>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
                    onClick={markAllAsRead}
                    disabled={notifications.length === 0 || unreadCount === 0}
                  >
                    Mark all read
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto p-4 space-y-4">
                  {notificationsLoading && <p className="text-sm text-gray-500 p-2">Loading...</p>}
                  {!notificationsLoading && notifications.length === 0 && (
                    <p className="text-sm text-gray-500 p-2">No notifications yet.</p>
                  )}

                  {!notificationsLoading && notifications.map((item) => (
                    <div key={item.id} className={`rounded-xl border px-4 py-4 transition-colors ${item.read_status ? 'border-gray-100 bg-gray-50' : 'border-blue-100 bg-blue-50/60'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 capitalize">{formatNotificationTitle(item.type)}</p>
                          <p className="text-xs text-gray-600 mt-1">{item.message}</p>
                          <p className="text-[11px] text-gray-400 mt-1">{new Date(item.created_at).toLocaleString('en-IN')}</p>
                        </div>
                        {!item.read_status && (
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
                            onClick={() => markAsRead(item.id)}
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {user.role !== 'admin' && (
            <>
              <button className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors" onClick={() => router.push('/settings')}>
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
