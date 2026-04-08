'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingsApi } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { useAuthStore } from '@/lib/store';
import { Loader } from '@googlemaps/js-api-loader';
import { Clock, MapPin, Phone, Star } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STEPS = ['pending','accepted','in_progress','completed'];
const STATUS_LABELS: Record<string,string> = {
  pending: 'Waiting for worker to accept your booking',
  accepted: 'Worker accepted! They will start heading to you soon',
  in_progress: 'Worker is on the way to your location',
  completed: 'Job completed! 🎉',
  cancelled: 'Booking cancelled',
  disputed: 'Dispute raised — under admin review',
};

interface Booking {
  id: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
  lat: number | null;
  lng: number | null;
  worker_lat: number | null;
  worker_lng: number | null;
  worker_name: string;
  worker_phone: string;
  worker_rating: number;
  address: string;
  scheduled_at: string;
}

export default function TrackPage() {
  const { jobId } = useParams() as { jobId: string };
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const workerMarker = useRef<google.maps.Marker | null>(null);
  const destinationMarker = useRef<google.maps.Marker | null>(null);
  const mapInitialised = useRef(false);
  const initialBookingRef = useRef<Booking | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disputing, setDisputing] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'admin') {
      router.push('/admin');
      return;
    }
  }, [user, router]);

  const fetchBooking = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await bookingsApi.get(jobId);
      setBooking(r.data as Booking);
    } catch {
      setError('Unable to load tracking right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || user.role === 'admin') return;
    fetchBooking();
  }, [jobId, user]);

  useEffect(() => {
    if (!initialBookingRef.current && booking) {
      initialBookingRef.current = booking;
    }
  }, [booking]);

  useEffect(() => {
    if (!mapRef.current || mapInitialised.current) return;

    mapInitialised.current = true;
    const loader = new Loader({ apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!, version: 'weekly' });
    loader.load().then(() => {
      const googleMaps = (window as any).google;
      const initialBooking = initialBookingRef.current;
      const center = { lat: initialBooking?.lat || 28.6139, lng: initialBooking?.lng || 77.2090 };
      mapInstance.current = new googleMaps.maps.Map(mapRef.current!, { center, zoom: 15, disableDefaultUI: true, zoomControl: true });
      destinationMarker.current = new googleMaps.maps.Marker({ position: center, map: mapInstance.current, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png', scaledSize: new googleMaps.maps.Size(40,40) }, title: 'Your location' });
    });
  }, []);

  useEffect(() => {
    if (!booking || !mapInstance.current) return;

    const googleMaps = (window as any).google;
    const destination = { lat: booking.lat || 28.6139, lng: booking.lng || 77.2090 };

    if (destinationMarker.current) {
      destinationMarker.current.setPosition(destination);
    } else {
      destinationMarker.current = new googleMaps.maps.Marker({
        position: destination,
        map: mapInstance.current,
        icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png', scaledSize: new googleMaps.maps.Size(40,40) },
        title: 'Your location',
      });
    }

    if (booking.worker_lat && booking.worker_lng) {
      updateWorker(booking.worker_lat, booking.worker_lng);
    } else {
      mapInstance.current.panTo(destination);
      mapInstance.current.setZoom(15);
    }
  }, [booking]);

  function updateWorker(lat: number, lng: number) {
    if (!mapInstance.current) return;
    const googleMaps = (window as any).google;
    const map = mapInstance.current;
    const pos = { lat, lng };
    if (workerMarker.current) { workerMarker.current.setPosition(pos); }
    else { workerMarker.current = new googleMaps.maps.Marker({ position: pos, map, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png', scaledSize: new googleMaps.maps.Size(48,48) }, title: 'Worker' }); }

    const destinationPos = destinationMarker.current?.getPosition();
    if (destinationPos) {
      const b = new googleMaps.maps.LatLngBounds();
      b.extend(pos);
      b.extend(destinationPos);
      map.fitBounds(b, 80);
    }
  }

  async function raiseDispute() {
    if (!booking) return;
    const reason = disputeReason.trim();
    if (reason.length < 10) {
      toast.error('Please enter at least 10 characters.');
      return;
    }
    setDisputing(true);
    try {
      await bookingsApi.dispute(booking.id, reason);
      setBooking((prev) => prev ? { ...prev, status: 'disputed' } : prev);
      setShowDisputeForm(false);
      setDisputeReason('');
      toast.success('Dispute raised. Admin will review this booking.');
    } catch {
      toast.error('Could not raise dispute right now. Please try again.');
    } finally {
      setDisputing(false);
    }
  }

  useEffect(() => {
    if (!user || user.role === 'admin') return;
    const socket = connectSocket();
    socket.emit('track:join', { booking_id: jobId });
    socket.on('worker:location', (data: { lat: number; lng: number }) => updateWorker(data.lat, data.lng));
    socket.on('job_started', () => setBooking((b) => b ? {...b, status:'in_progress'} : b));
    socket.on('job_completed', () => setBooking((b) => b ? {...b, status:'completed'} : b));
    return () => { socket.off('worker:location'); socket.off('job_started'); socket.off('job_completed'); };
  }, [jobId, user]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading tracking…</div></div>;
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full card p-6 text-center">
          <p className="font-semibold text-gray-900">Tracking unavailable</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
          <button className="btn-primary mt-4" onClick={fetchBooking}>Retry</button>
        </div>
      </div>
    );
  }
  if (!booking) return null;
  const stepIndex = STATUS_STEPS.indexOf(booking.status);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div ref={mapRef} className="w-full h-[45vh] bg-gray-200" />
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 relative z-10 p-5 space-y-5 overflow-auto">
        <div className={`rounded-xl p-3 text-sm font-medium ${booking.status==='in_progress'?'bg-amber-50 text-amber-800':booking.status==='completed'?'bg-green-50 text-green-800':booking.status==='cancelled'?'bg-red-50 text-red-800':booking.status==='disputed'?'bg-yellow-50 text-yellow-800':'bg-blue-50 text-blue-800'}`}>{STATUS_LABELS[booking.status]||booking.status}</div>
        {booking.status !== 'cancelled' && booking.status !== 'disputed' && (
          <div className="flex items-center gap-1">
            {STATUS_STEPS.map((_, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i<=stepIndex?'bg-blue-600 text-white':'bg-gray-200 text-gray-400'}`}>{i<stepIndex?'✓':i+1}</div>
                {i<STATUS_STEPS.length-1 && <div className={`h-1 flex-1 mx-1 rounded ${i<stepIndex?'bg-blue-600':'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-lg font-bold text-blue-600">{booking.worker_name[0]}</div>
          <div className="flex-1"><p className="font-semibold text-gray-900">{booking.worker_name}</p><div className="flex items-center gap-1"><Star size={12} className="text-yellow-400 fill-yellow-400" /><span className="text-sm text-gray-500">{booking.worker_rating}</span></div></div>
          <a href={`tel:+91${booking.worker_phone}`} className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><Phone size={18} /></a>
        </div>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex gap-2"><MapPin size={16} className="text-gray-400 flex-shrink-0 mt-0.5" /><span>{booking.address}</span></div>
          <div className="flex gap-2"><Clock size={16} className="text-gray-400 flex-shrink-0 mt-0.5" /><span>{new Date(booking.scheduled_at).toLocaleString('en-IN')}</span></div>
        </div>
        {booking.status === 'completed' && <div className="grid grid-cols-2 gap-2"><a href={`/review/${booking.id}`} className="btn-primary w-full text-center block">⭐ Rate & Review</a><a href={`/invoice/${booking.id}`} className="btn-secondary w-full text-center block">Invoice</a></div>}
        {(booking.status === 'completed' || booking.status === 'in_progress') && !showDisputeForm && (
          <button type="button" onClick={() => setShowDisputeForm(true)} disabled={disputing} className="w-full text-sm text-red-600 border border-red-200 rounded-xl py-2 hover:bg-red-50 disabled:opacity-50">
            Raise a dispute
          </button>
        )}
        {showDisputeForm && booking.status !== 'disputed' && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-3 space-y-2">
            <p className="text-sm font-medium text-red-700">Describe the issue for admin review</p>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Example: Worker marked job complete without resolving leakage issue"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-sm py-2" onClick={() => { setShowDisputeForm(false); setDisputeReason(''); }}>
                Cancel
              </button>
              <button type="button" className="btn-primary text-sm py-2" onClick={raiseDispute} disabled={disputing || disputeReason.trim().length < 10}>
                {disputing ? 'Submitting...' : 'Submit dispute'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
