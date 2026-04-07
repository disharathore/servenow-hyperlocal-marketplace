'use client';
import { useEffect, useState } from 'react';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { connectSocket } from '@/lib/socket';

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  createdAt: string;
}

const STORAGE_KEY = 'sn_notifications';
const COUNT_KEY = 'sn_notifications_unread_count';

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    localStorage.setItem(COUNT_KEY, '0');
    window.dispatchEvent(new Event('sn-notification-count-updated'));

    const socket = connectSocket();
    const add = (title: string, description: string) => {
      setItems((prev) => {
        const next = [{ id: crypto.randomUUID(), title, description, createdAt: new Date().toISOString() }, ...prev];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        const unread = Number(localStorage.getItem(COUNT_KEY) || '0') + 1;
        localStorage.setItem(COUNT_KEY, String(unread));
        window.dispatchEvent(new Event('sn-notification-count-updated'));
        return next;
      });
    };

    socket.on('new_booking', () => add('New job request', 'A customer requested your service.'));
    socket.on('booking_accepted', () => add('Booking accepted', 'Your worker accepted the booking.'));
    socket.on('job_started', () => add('Job started', 'Worker has started your job.'));
    socket.on('job_completed', () => add('Job completed', 'Please leave a rating and review.'));
    socket.on('payment_confirmed', () => add('Payment success', 'Payment has been confirmed.'));

    return () => {
      socket.off('new_booking');
      socket.off('booking_accepted');
      socket.off('job_started');
      socket.off('job_completed');
      socket.off('payment_confirmed');
    };
  }, []);

  const clearAll = () => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(COUNT_KEY, '0');
    window.dispatchEvent(new Event('sn-notification-count-updated'));
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
              <p className="font-semibold text-gray-900">{n.title}</p>
              <p className="text-sm text-gray-600 mt-1">{n.description}</p>
              <p className="text-xs text-gray-400 mt-2">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
      </div>
    </AppWrapperLayout>
  );
}
