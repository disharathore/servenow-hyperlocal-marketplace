'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { servicesApi, bookingsApi, paymentsApi } from '@/lib/api';
import { Star, MapPin, ArrowLeft, Calendar, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Loader } from '@googlemaps/js-api-loader';

declare global {
  interface Window {
    Razorpay: any;
    google: any;
  }
}

interface Worker {
  id: string;
  name: string;
  category_name: string;
  hourly_rate: number;
  rating: number;
  rating_count: number;
  is_background_verified: boolean;
}

interface Slot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
}

interface BookingResponse {
  id: string;
}

interface RazorpayVerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export default function BookPage() {
  const { workerId } = useParams() as { workerId: string };
  const router = useRouter();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [address, setAddress] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [mapsReady, setMapsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([servicesApi.worker(workerId), servicesApi.slots(workerId)]).then(([wRes, sRes]) => {
      setWorker(wRes.data);
      setSlots(sRes.data);
    });

    const rzpScript = document.createElement('script');
    rzpScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
    rzpScript.async = true;
    document.body.appendChild(rzpScript);

    const mapsLoader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '',
      libraries: ['places'],
      version: 'weekly',
    });
    mapsLoader.load()
      .then(() => setMapsReady(true))
      .catch(() => setError('Unable to load Google Maps. You can still enter address manually.'));

    return () => {
      if (rzpScript.parentNode) document.body.removeChild(rzpScript);
    };
  }, [workerId]);

  useEffect(() => {
    if (!mapsReady || !addressQuery || addressQuery.length < 3 || !window.google?.maps?.places) {
      setSuggestions([]);
      return;
    }
    const service = new window.google.maps.places.AutocompleteService();
    service.getPlacePredictions(
      { input: addressQuery, componentRestrictions: { country: 'in' } },
      (predictions: Array<{ description: string }> | null) => {
        setSuggestions((predictions || []).slice(0, 5).map((x) => x.description));
      }
    );
  }, [addressQuery, mapsReady]);

  const slotsByDate = slots.reduce((acc: Record<string, Slot[]>, slot) => {
    const d = slot.date.split('T')[0];
    if (!acc[d]) acc[d] = [];
    acc[d].push(slot);
    return acc;
  }, {});

  async function handleBook() {
    if (!selectedSlot || !address.trim()) return;
    setError('');
    setLoading(true);
    try {
      const bookingRes = await bookingsApi.create({ worker_id: workerId, slot_id: selectedSlot.id, address, description });
      const booking = bookingRes.data as BookingResponse;
      const orderRes = await paymentsApi.createOrder(booking.id);
      const { order_id, amount, currency, key_id } = orderRes.data;

      const rzp = new window.Razorpay({
        key: key_id,
        amount,
        currency,
        name: 'ServeNow',
        order_id,
        handler: async (response: RazorpayVerifyPayload) => {
          await paymentsApi.verify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            booking_id: booking.id,
          });
          router.push(`/booking/${booking.id}/confirmed`);
        },
        theme: { color: '#2563eb' },
        modal: { ondismiss: () => setLoading(false) },
      });

      rzp.open();
    } catch (err: unknown) {
      const message = typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      setError(message || 'Booking failed. Try again.');
      setLoading(false);
    }
  }

  if (!worker) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <h1 className="font-bold text-gray-900">Book {worker.category_name}</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div className="card p-4 flex gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">{worker.name[0]}</div>
          <div>
            <div className="flex items-center gap-1.5"><p className="font-semibold text-gray-900">{worker.name}</p>{worker.is_background_verified && <CheckCircle size={14} className="text-green-500" />}</div>
            <div className="flex items-center gap-1 mt-1"><Star size={13} className="text-yellow-400 fill-yellow-400" /><span className="text-sm font-medium">{worker.rating || '-'}</span><span className="text-sm text-gray-400">({worker.rating_count}) - ₹{worker.hourly_rate}/hr</span></div>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Calendar size={16} className="text-blue-600" /> Select date and time</h2>
          {Object.keys(slotsByDate).length === 0 ? <p className="text-gray-400 text-sm">No slots available.</p> : (
            <div className="space-y-4">
              {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                <div key={date}>
                  <p className="text-xs font-medium text-gray-500 mb-2">{format(new Date(date), 'EEE, dd MMM yyyy')}</p>
                  <div className="flex flex-wrap gap-2">
                    {dateSlots.map((slot) => (
                      <button key={slot.id} onClick={() => setSelectedSlot(slot)} className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${selectedSlot?.id === slot.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                        {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><MapPin size={16} className="text-blue-600" /> Service address</h2>
          <input className="input" placeholder="Search address (Google Maps)" value={addressQuery} onChange={e => { setAddressQuery(e.target.value); setAddress(e.target.value); }} />
          {!mapsReady && <p className="text-xs text-gray-500 mt-2">Loading address suggestions...</p>}
          {suggestions.length > 0 && (
            <div className="mt-2 rounded-xl border border-gray-200 bg-white overflow-hidden">
              {suggestions.map((item) => (
                <button key={item} type="button" onClick={() => { setAddress(item); setAddressQuery(item); setSuggestions([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                  {item}
                </button>
              ))}
            </div>
          )}
          <textarea className="input resize-none mt-2" rows={3} placeholder="Selected address" value={address} onChange={e => setAddress(e.target.value)} />
        </div>

        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Describe the problem <span className="text-gray-400 font-normal">(optional)</span></h2>
          <textarea className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[80px]" rows={2} placeholder="e.g. Kitchen tap is leaking since morning..." value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div><p className="font-bold text-gray-900 text-lg">₹{worker.hourly_rate}</p><p className="text-xs text-gray-400">per hour</p></div>
          <button className="btn-primary px-8" onClick={handleBook} disabled={!selectedSlot || !address.trim() || loading}>{loading ? 'Processing...' : 'Pay and Book ->'}</button>
        </div>
      </div>
    </div>
  );
}
