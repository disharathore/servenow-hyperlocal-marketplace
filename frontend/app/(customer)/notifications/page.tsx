'use client';
import { useEffect, useState } from 'react';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { connectSocket } from '@/lib/socket';
import { notificationsApi } from '@/lib/api';

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  read_status: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let mounted = true;
    notificationsApi.list()
      .then((r) => {
        if (mounted) setItems(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => undefined);

    notificationsApi.markAllRead()
      .then(() => window.dispatchEvent(new Event('sn-notifications-read-all')))
      .catch(() => undefined);

    const socket = connectSocket();
    const onNotification = (n: NotificationItem) => {
      setItems((prev) => [n, ...prev]);
    };

    socket.on('notification:new', onNotification);

    return () => {
      mounted = false;
      socket.off('notification:new', onNotification);
    };
  }, []);

  const clearAll = () => {
    setItems([]);
    notificationsApi.markAllRead().catch(() => undefined);
    window.dispatchEvent(new Event('sn-notifications-read-all'));
  };

  return (
    <AppWrapperLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <button type="button" onClick={clearAll} disabled={items.length === 0} className="text-sm text-red-600 disabled:text-gray-300">
            Clear all
          </button>
        </div>
        <div className="space-y-3">
          {items.length === 0 && <div className="card p-6 text-sm text-gray-500">No notifications yet.</div>}
          {items.map((n) => (
            <div key={n.id} className="card p-4">
              <p className="font-semibold text-gray-900 capitalize">{n.type.replaceAll('_', ' ')}</p>
              <p className="text-sm text-gray-600 mt-1">{n.message}</p>
              <p className="text-xs text-gray-400 mt-2">{new Date(n.created_at).toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
      </div>
    </AppWrapperLayout>
  );
}
