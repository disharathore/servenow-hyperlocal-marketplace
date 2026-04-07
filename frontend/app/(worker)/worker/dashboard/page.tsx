'use client';
import { useEffect, useRef, useState } from 'react';
import { bookingsApi, jobsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { connectSocket } from '@/lib/socket';
import { useRouter } from 'next/navigation';
import { MapPin, Clock, CheckCircle, ToggleLeft, ToggleRight, Phone } from 'lucide-react';

export default function WorkerDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const bookingsRef = useRef<any[]>([]);

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'worker') { router.push('/'); return; }
    if (!user.worker_profile_id) { router.push('/worker/setup'); return; }

    const loadDashboard = async () => {
      const [bRes, eRes] = await Promise.all([bookingsApi.list(), jobsApi.earnings()]);
      setBookings(bRes.data);
      setEarnings(eRes.data);
      setLoading(false);
    };

    loadDashboard();
    const socket = connectSocket();
    socket.on('new_booking', () => bookingsApi.list().then(r => setBookings(r.data)));
    const locationInterval = setInterval(() => {
      const savedSettings = localStorage.getItem('sn_settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          if (parsed.locationShare === false) return;
        } catch {
          // Ignore malformed local settings and continue with default behavior.
        }
      }
      const activeBooking = bookingsRef.current.find((b) => ['accepted', 'in_progress'].includes(b.status));
      if (!activeBooking) return;
      navigator.geolocation.getCurrentPosition(pos => socket.emit('worker:location', { lat: pos.coords.latitude, lng: pos.coords.longitude, booking_id: activeBooking.id }));
    }, 15000);
    return () => { socket.off('new_booking'); clearInterval(locationInterval); };
  }, [user, router]);

  async function toggleAvailability() { const socket = connectSocket(); socket.emit('worker:availability', { available: !available }); setAvailable(!available); }

  async function handleAction(bookingId: string, action: 'accept'|'reject'|'start'|'complete') {
    const actions = { accept: jobsApi.accept, start: jobsApi.start, complete: jobsApi.complete };
    if (action === 'reject') {
      await jobsApi.reject(bookingId, 'Worker unavailable at requested time');
    } else {
      await actions[action](bookingId);
    }
    const res = await bookingsApi.list();
    setBookings(res.data);
  }

  const pending = bookings.filter(b => b.status === 'pending');
  const active = bookings.filter(b => ['accepted','in_progress'].includes(b.status));
  const done = bookings.filter(b => b.status === 'completed').slice(0,5);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div><p className="font-bold text-gray-900">Hey, {user?.name?.split(' ')[0]} 👋</p><p className="text-xs text-gray-400">Worker dashboard</p></div>
          <button onClick={toggleAvailability} className="flex items-center gap-2 text-sm font-medium">
            {available ? <><ToggleRight size={28} className="text-green-500" /><span className="text-green-600">Available</span></> : <><ToggleLeft size={28} className="text-gray-400" /><span className="text-gray-500">Off</span></>}
          </button>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
        {earnings && (
          <div className="grid grid-cols-2 gap-3">
            {[{label:'This week',val:`₹${Math.floor(Number(earnings.this_week)/100)}`},{label:'This month',val:`₹${Math.floor(Number(earnings.this_month)/100)}`},{label:'Total earned',val:`₹${Math.floor(Number(earnings.total_earnings)/100)}`},{label:'Total jobs',val:earnings.total_jobs}].map(s => (
              <div key={s.label} className="card p-4"><p className="text-xs text-gray-400 mb-1">{s.label}</p><p className="text-xl font-bold text-gray-900">{s.val}</p></div>
            ))}
          </div>
        )}
        {pending.length > 0 && <section><h2 className="font-semibold text-gray-900 mb-2">New requests ({pending.length})</h2><div className="space-y-3">{pending.map((b:any) => <BookingCard key={b.id} booking={b} onAccept={() => handleAction(b.id,'accept')} onReject={() => handleAction(b.id,'reject')} />)}</div></section>}
        {active.length > 0 && <section><h2 className="font-semibold text-gray-900 mb-2">Active jobs</h2><div className="space-y-3">{active.map((b:any) => <BookingCard key={b.id} booking={b} onStart={b.status==='accepted'?() => handleAction(b.id,'start'):undefined} onComplete={b.status==='in_progress'?() => handleAction(b.id,'complete'):undefined} />)}</div></section>}
        {done.length > 0 && <section><h2 className="font-semibold text-gray-900 mb-2">Recent completions</h2><div className="space-y-2">{done.map((b:any) => <div key={b.id} className="card p-3 flex items-center gap-3 opacity-75"><CheckCircle size={18} className="text-green-500 flex-shrink-0" /><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-700 truncate">{b.customer_name}</p><p className="text-xs text-gray-400">{new Date(b.scheduled_at).toLocaleDateString('en-IN')}</p></div><span className="text-sm font-bold text-gray-700">₹{Math.floor(b.amount/100)}</span></div>)}</div></section>}
        {pending.length===0 && active.length===0 && !loading && <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">⏳</p><p className="font-medium">No pending bookings</p><p className="text-sm mt-1">Stay online to receive requests</p></div>}
      </div>
    </div>
  );
}

function BookingCard({ booking, onAccept, onReject, onStart, onComplete }: { booking: any; onAccept?: ()=>void; onReject?: ()=>void; onStart?: ()=>void; onComplete?: ()=>void; }) {
  const [loading, setLoading] = useState(false);
  async function handle(fn: ()=>void) { setLoading(true); await fn(); setLoading(false); }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2"><span className="text-xl">{booking.category_icon}</span><div><p className="font-semibold text-gray-900">{booking.category_name}</p><p className="text-xs text-gray-400">{booking.customer_name}</p></div></div>
        <span className="font-bold text-blue-600">₹{Math.floor(booking.amount/100)}</span>
      </div>
      <div className="space-y-1 text-xs text-gray-500 mb-3">
        <div className="flex gap-1.5"><Clock size={12} className="flex-shrink-0 mt-0.5" />{new Date(booking.scheduled_at).toLocaleString('en-IN')}</div>
        <div className="flex gap-1.5"><MapPin size={12} className="flex-shrink-0 mt-0.5" />{booking.address}</div>
      </div>
      <div className="flex gap-2">
        <a href={`tel:+91${booking.customer_phone}`} className="btn-secondary flex-shrink-0 px-3 py-2 flex items-center gap-1 text-sm"><Phone size={14} /> Call</a>
        {onAccept && <button onClick={() => handle(onAccept)} disabled={loading} className="btn-primary flex-1 text-sm py-2">{loading?'…':'Accept Job'}</button>}
        {onReject && <button onClick={() => handle(onReject)} disabled={loading} className="btn-secondary text-sm py-2 px-3">{loading?'…':'Reject'}</button>}
        {onStart && <button onClick={() => handle(onStart)} disabled={loading} className="btn-primary flex-1 text-sm py-2 bg-purple-600 hover:bg-purple-700">{loading?'…':'Start Job'}</button>}
        {onComplete && <button onClick={() => handle(onComplete)} disabled={loading} className="btn-primary flex-1 text-sm py-2 bg-green-600 hover:bg-green-700">{loading?'…':'Mark Complete'}</button>}
      </div>
    </div>
  );
}
