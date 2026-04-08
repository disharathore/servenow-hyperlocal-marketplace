'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';

interface ConfirmedBooking {
  id: string;
  amount: number;
  category_name: string;
  worker_name: string;
  scheduled_at: string;
  address: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
}

export default function BookingConfirmedPage() {
  const { bookingId } = useParams() as { bookingId: string };
  const [booking, setBooking] = useState<ConfirmedBooking | null>(null);

  const statusMessage =
    booking?.status === 'pending'
      ? 'Waiting for worker to accept (usually < 15 mins)'
      : booking?.status === 'accepted'
        ? 'Worker has accepted your booking. You can track live now.'
        : booking?.status === 'cancelled'
          ? 'Booking was cancelled'
          : booking?.status === 'in_progress'
            ? 'Worker is on the way. Live tracking is available.'
            : booking?.status === 'completed'
              ? 'Job completed successfully.'
              : booking?.status === 'disputed'
                ? 'This booking is under dispute review.'
                : 'We are preparing your booking details.';

  const canTrack = booking?.status === 'accepted' || booking?.status === 'in_progress';
  const showTrackButton = booking?.status !== 'cancelled';

  useEffect(() => {
    bookingsApi.get(bookingId).then((r) => setBooking(r.data));
  }, [bookingId]);

  return (
    <AppWrapperLayout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card p-6 text-center">
          <div className="success-check mb-4" aria-hidden="true">
            <svg viewBox="0 0 52 52">
              <circle className="success-check-circle" cx="26" cy="26" r="24" fill="none" />
              <path className="success-check-mark" fill="none" d="M14 27l8 8 16-16" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Booking Confirmed</h1>
          <p className="text-gray-500 mt-2">Your payment was successful and the job is now assigned.</p>

          <div className={`mt-4 rounded-xl p-3 text-sm font-medium ${booking?.status === 'cancelled' ? 'bg-red-50 text-red-700' : booking?.status === 'accepted' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
            {statusMessage}
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4 text-left space-y-2">
            <p className="text-xs text-blue-700 font-semibold">Booking Details</p>
            <p className="font-mono text-sm text-gray-900 mt-1">{booking?.id || bookingId}</p>
            <p className="text-sm text-gray-600">Service: {booking?.category_name || '--'}</p>
            <p className="text-sm text-gray-600">Worker: {booking?.worker_name || 'Assigned worker'}</p>
            <p className="text-sm text-gray-600">Scheduled: {booking?.scheduled_at ? new Date(booking.scheduled_at).toLocaleString('en-IN', { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' }) : '--'}</p>
            <p className="text-sm text-gray-600">Address: {booking?.address || '--'}</p>
            <p className="text-sm font-semibold text-gray-800">Amount paid: ₹{booking ? (booking.amount / 100).toFixed(2) : '--'}</p>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {showTrackButton ? (
              canTrack ? (
                <Link href={`/track/${bookingId}`} className="btn-primary text-center">Track Live</Link>
              ) : (
                <span
                  title="Tracking available once worker accepts"
                  aria-disabled="true"
                  className="text-center rounded-xl px-4 py-3 text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed"
                >
                  Track Live
                </span>
              )
            ) : (
              <span className="text-center rounded-xl px-4 py-3 text-sm font-medium bg-red-50 text-red-600">
                Tracking unavailable
              </span>
            )}
            <Link href={`/invoice/${bookingId}`} className="btn-secondary text-center">View Invoice</Link>
          </div>

          <p className="mt-5 text-sm text-gray-500">
            Need help? <a href="mailto:support@servenow.in" className="text-blue-600 hover:text-blue-700 underline">Contact Support</a>
          </p>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
