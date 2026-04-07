'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { bookingsApi } from '@/lib/api';

export default function InvoicePage() {
  const { bookingId } = useParams() as { bookingId: string };
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    bookingsApi.get(bookingId).then((r) => setBooking(r.data));
  }, [bookingId]);

  return (
    <AppWrapperLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card p-6">
          <h1 className="text-2xl font-bold text-gray-900">Invoice</h1>
          <p className="text-gray-500 text-sm mt-1">Tax invoice for completed booking</p>

          <div className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Invoice ID</span><span className="font-mono">INV-{(booking?.id || bookingId).slice(0, 8).toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Booking ID</span><span className="font-mono">{booking?.id || bookingId}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Service</span><span>{booking?.category_name || '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Worker</span><span>{booking?.worker_name || '--'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Address</span><span className="text-right max-w-[65%]">{booking?.address || '--'}</span></div>
          </div>

          <div className="mt-6 border-t pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span>Base amount</span><span>₹{booking ? Math.floor(booking.amount / 100) : 0}</span></div>
            <div className="flex justify-between"><span>GST (18%)</span><span>₹{booking ? Math.round((booking.amount / 100) * 0.18) : 0}</span></div>
            <div className="flex justify-between font-bold text-base"><span>Total paid</span><span>₹{booking ? Math.round((booking.amount / 100) * 1.18) : 0}</span></div>
          </div>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
