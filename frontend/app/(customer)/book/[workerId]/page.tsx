'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { servicesApi, bookingsApi, paymentsApi } from '@/lib/api';
import { ArrowRight, Star, MapPin, ArrowLeft, Calendar, CheckCircle, Clock3, ShieldCheck, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { Loader } from '@googlemaps/js-api-loader';
import { FullPageSkeleton } from '@/app/_components/MarketplaceSkeletons';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

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

interface CalendarDate {
  key: string;
  label: string;
  day: string;
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [address, setAddress] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [mapsReady, setMapsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadWorkerAndSlots = () => {
    setError('');
    setInitialLoading(true);
    Promise.all([servicesApi.worker(workerId), servicesApi.slots(workerId)])
      .then(([wRes, sRes]) => {
        setWorker(wRes.data);
        setSlots(sRes.data);
      })
      .catch(() => {
        setError('Unable to load worker details right now. Please try again.');
      })
      .finally(() => setInitialLoading(false));
  };

  useEffect(() => {
    loadWorkerAndSlots();

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

  const availableDates = Object.keys(slotsByDate).sort();
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    if (!selectedDate && availableDates.length > 0) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  useEffect(() => {
    if (selectedSlot && selectedDate && selectedSlot.date.split('T')[0] !== selectedDate) {
      setSelectedSlot(null);
    }
  }, [selectedDate, selectedSlot]);

  const today = new Date();
  const calendarDates: CalendarDate[] = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    return {
      key,
      day: format(d, 'EEE'),
      label: format(d, 'dd MMM'),
    };
  });

  const timeTemplate = Array.from(
    new Set(
      slots.map((s) => `${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`)
    )
  ).sort();

  const selectedDateSlots = slotsByDate[selectedDate] || [];
  const selectedDateSlotMap = new Map(
    selectedDateSlots.map((s) => [`${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`, s])
  );

  const serviceCost = worker?.hourly_rate || 0;
  const platformFee = Math.floor(serviceCost * 0.08);
  const totalAmount = serviceCost + platformFee;

  async function handleBook() {
    if (!selectedSlot || !address.trim()) return;
    setError('');
    setLoading(true);
    let bookingId: string | null = null;
    try {
      const bookingRes = await bookingsApi.create({ worker_id: workerId, slot_id: selectedSlot.id, address, description });
      const booking = bookingRes.data as BookingResponse;
      bookingId = booking.id;
      const orderRes = await paymentsApi.createOrder(booking.id);
      const { order_id, amount, currency, key_id } = orderRes.data;

      if (key_id === 'demo' || orderRes.data?.demo_mode) {
        await paymentsApi.verify({
          razorpay_order_id: order_id,
          razorpay_payment_id: `demo_payment_${booking.id.slice(0, 12)}`,
          razorpay_signature: 'demo_signature',
          booking_id: booking.id,
        });
        router.push(`/booking/${booking.id}/confirmed`);
        return;
      }

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
        modal: {
          ondismiss: async () => {
            if (bookingId) {
              try { await paymentsApi.releaseLock(bookingId); } catch {}
            }
            setLoading(false);
          },
        },
      });

      rzp.open();
    } catch (err: unknown) {
      if (bookingId) {
        try { await paymentsApi.releaseLock(bookingId); } catch {}
      }
      const message = typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      setError(message || 'Booking failed. Try again.');
      toast.error(message || 'Booking failed. Try again.');
      setLoading(false);
    }
  }

  if (initialLoading) {
    return <FullPageSkeleton />;
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-6 max-w-md w-full text-center">
          <p className="font-semibold text-gray-900">Could not open worker profile</p>
          <p className="text-sm text-gray-500 mt-2">{error || 'Please try again.'}</p>
          <div className="mt-4 flex gap-2 justify-center">
            <button className="btn-secondary" onClick={() => router.back()}>Back</button>
            <button className="btn-primary" onClick={loadWorkerAndSlots}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 bg-[radial-gradient(circle_at_10%_0%,#e8f0ff_0%,#f5f8ff_35%,#f2f6fb_100%)]">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/85 border-b border-blue-100">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-blue-50 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
          <h1 className="font-bold text-gray-900">Book {worker.category_name}</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <section className="rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-600 text-white p-5 md:p-6 shadow-xl border border-blue-500/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.24) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -left-16 -bottom-16 h-44 w-44 rounded-full bg-black/20 blur-2xl" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold border border-white/25"><Sparkles size={14} /> Premium Booking Flow</p>
              <h2 className="text-2xl font-bold mt-3">Confirm your booking in minutes</h2>
              <p className="text-sm text-blue-100 mt-1">Pick time, add address, and pay securely.</p>
            </div>
            <div className="rounded-2xl border border-white/25 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-blue-100">Estimated total</p>
              <p className="text-2xl font-bold">₹{totalAmount}</p>
            </div>
          </div>
        </section>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-2xl border border-blue-100 bg-white/95 shadow-xl p-4 md:p-5">
          <p className="text-xs font-semibold text-blue-600 mb-2">1. Worker Info</p>
          <div className="flex gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">{worker.name[0]}</div>
            <div>
              <div className="flex items-center gap-1.5"><p className="font-semibold text-gray-900">{worker.name}</p>{worker.is_background_verified && <CheckCircle size={14} className="text-green-500" />}</div>
              <p className="text-sm text-gray-500">{worker.category_name}</p>
              <div className="flex items-center gap-1 mt-1"><Star size={13} className="text-yellow-400 fill-yellow-400" /><span className="text-sm font-medium">{worker.rating || '-'}</span><span className="text-sm text-gray-400">({worker.rating_count}) - ₹{worker.hourly_rate}/hr</span></div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.03 }} className="rounded-2xl border border-blue-100 bg-white/95 shadow-xl p-4 md:p-5">
          <p className="text-xs font-semibold text-blue-600 mb-2">2. Select Date</p>
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Calendar size={16} className="text-blue-600" /> Choose a date</h2>
          {availableDates.length === 0 ? (
            <p className="text-gray-400 text-sm">No slots available.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {calendarDates.map((d) => {
                const enabled = availableDates.includes(d.key);
                const selected = selectedDate === d.key;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => enabled && setSelectedDate(d.key)}
                    disabled={!enabled}
                    className={`rounded-xl border px-3 py-2 text-left transition-all ${
                      !enabled
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : selected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <p className="text-xs">{d.day}</p>
                    <p className="text-sm font-semibold">{d.label}</p>
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.06 }} className="rounded-2xl border border-blue-100 bg-white/95 shadow-xl p-4 md:p-5">
          <p className="text-xs font-semibold text-blue-600 mb-2">3. Select Time Slot</p>
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Clock3 size={16} className="text-blue-600" /> Available time slots</h2>
          {timeTemplate.length === 0 ? (
            <p className="text-gray-400 text-sm">No slots available.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {timeTemplate.map((timeKey) => {
                const slot = selectedDateSlotMap.get(timeKey);
                const isDisabled = !slot;
                const isSelected = selectedSlot?.id === slot?.id;
                return (
                  <button
                    key={timeKey}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => slot && setSelectedSlot(slot)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                      isDisabled
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {timeKey.replace('-', ' - ')}
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.09 }} className="rounded-2xl border border-blue-100 bg-white/95 shadow-xl p-4 md:p-5">
          <p className="text-xs font-semibold text-blue-600 mb-2">4. Payment Summary</p>
          <h2 className="font-semibold text-gray-900 mb-3">Payment details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between text-gray-600"><span>Service cost</span><span>₹{serviceCost}</span></div>
            <div className="flex items-center justify-between text-gray-600"><span>Platform fee</span><span>₹{platformFee}</span></div>
            <div className="border-t border-gray-200 pt-2 flex items-center justify-between font-semibold text-gray-900"><span>Total amount</span><span>₹{totalAmount}</span></div>
          </div>
          <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
            <ShieldCheck size={14} /> Secure checkout powered by Razorpay.
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.12 }} className="rounded-2xl border border-blue-100 bg-white/95 shadow-xl p-4 md:p-5">
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
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }} className="rounded-2xl border border-blue-100 bg-white/95 shadow-xl p-4 md:p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Describe the problem <span className="text-gray-400 font-normal">(optional)</span></h2>
          <textarea className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[80px]" rows={2} placeholder="e.g. Kitchen tap is leaking since morning..." value={description} onChange={e => setDescription(e.target.value)} />
        </motion.div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-blue-100 p-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-bold text-gray-900 text-xl">₹{totalAmount}</p>
            <p className="text-xs text-gray-500">Service cost + platform fee</p>
          </div>
          <div className="sm:text-right w-full sm:w-auto">
            <p className="text-xs font-semibold text-blue-600 mb-1">5. Confirm Booking</p>
            <button className="w-full sm:w-auto px-10 py-3 text-base rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-200 transition-transform duration-200 hover:scale-105 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2" onClick={handleBook} disabled={!selectedDate || !selectedSlot || !address.trim() || loading}>{loading ? 'Processing...' : <><ArrowRight size={16} /> Pay Now</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
