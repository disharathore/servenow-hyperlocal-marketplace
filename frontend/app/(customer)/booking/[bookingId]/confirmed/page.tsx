'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';

export default function BookingConfirmedPage() {
  const { bookingId } = useParams() as { bookingId: string };
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    bookingsApi.get(bookingId).then((r) => setBooking(r.data));
  }, [bookingId]);

  return (
    <AppWrapperLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card p-6 text-center">
          <p className="text-5xl mb-3">✅</p>
          <h1 className="text-2xl font-bold text-gray-900">Booking Confirmed</h1>
          <p className="text-gray-500 mt-2">Your payment was successful and the job is now assigned.</p>
          <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4 text-left">
            <p className="text-xs text-blue-700 font-semibold">Order ID</p>
            <p className="font-mono text-sm text-gray-900 mt-1">{booking?.id || bookingId}</p>
            <p className="text-sm text-gray-600 mt-2">Worker: {booking?.worker_name || 'Assigned worker'}</p>
            <p className="text-sm text-gray-600">Amount: ₹{booking ? Math.floor(booking.amount / 100) : '--'}</p>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href={`/track/${bookingId}`} className="btn-primary text-center">Track Live</Link>
            <Link href={`/invoice/${bookingId}`} className="btn-secondary text-center">View Invoice</Link>
          </div>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
