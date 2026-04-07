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

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const socket = connectSocket();
    const add = (title: string, description: string) => {
      setItems((prev) => [{ id: crypto.randomUUID(), title, description, createdAt: new Date().toISOString() }, ...prev]);
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

  return (
    <AppWrapperLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Notifications</h1>
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
