'use client';
import { useEffect, useRef, useState } from 'react';
import { authApi, bookingsApi, jobsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { connectSocket } from '@/lib/socket';
import { useRouter } from 'next/navigation';
import { MapPin, Clock, CheckCircle, ToggleLeft, ToggleRight, Phone, Briefcase, Bell, Wifi } from 'lucide-react';

interface Booking {
  id: string;
  status: 'pending' | 'accepted' | 'arriving' | 'in_progress' | 'completed' | 'cancelled';
  category_icon: string;
  category_name: string;
  customer_name: string;
  customer_phone: string;
  amount: number;
  scheduled_at: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface IncomingJob {
  id: string;
  status: 'REQUESTED';
  customer_name: string;
  customer_phone: string;
  service_type: string;
  service_icon?: string;
  address: string;
  scheduled_at: string;
  slot_start: string | null;
  slot_end: string | null;
  amount: number;
}

interface Earnings {
  total_jobs: number;
  total_earnings: number | string;
  this_month: number | string;
  this_week: number | string;
}

interface WorkerMeta {
  rating: number | null;
  total_jobs: number | null;
  is_available: boolean | null;
}

export default function WorkerDashboard() {
  const router = useRouter();
  const { user, isDemoMode } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [incomingJobs, setIncomingJobs] = useState<IncomingJob[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [workerMeta, setWorkerMeta] = useState<WorkerMeta | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const bookingsRef = useRef<Booking[]>([]);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'worker') { router.push('/'); return; }
    if (!user.worker_profile_id) { router.push('/worker/setup'); return; }

    const loadDashboard = async () => {
      const [availableRes, bRes, eRes, meRes] = await Promise.all([jobsApi.available(), bookingsApi.list(), jobsApi.earnings(), authApi.me()]);
      setIncomingJobs((availableRes.data || []) as IncomingJob[]);
      setBookings(bRes.data as Booking[]);
      setEarnings(eRes.data as Earnings);
      setWorkerMeta({
        rating: meRes.data?.rating != null ? Number(meRes.data.rating) : null,
        total_jobs: meRes.data?.total_jobs != null ? Number(meRes.data.total_jobs) : null,
        is_available: meRes.data?.is_available ?? null,
      });
      if (typeof meRes.data?.is_available === 'boolean') setAvailable(meRes.data.is_available);
      setLoading(false);
    };

    loadDashboard();
    const socket = connectSocket();
    socket.on('new_booking', loadDashboard);
    socket.on('booking_status_changed', loadDashboard);
    socket.on('job_completed', loadDashboard);
    return () => {
      socket.off('new_booking', loadDashboard);
      socket.off('booking_status_changed', loadDashboard);
      socket.off('job_completed', loadDashboard);
    };
  }, [user, router]);

  useEffect(() => {
    const hasActiveBooking = bookings.some((b) => ['accepted', 'arriving', 'in_progress'].includes(b.status));

    if (!hasActiveBooking) {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      return;
    }

    if (locationIntervalRef.current) return;

    const socket = connectSocket();
    locationIntervalRef.current = setInterval(() => {
      const savedSettings = localStorage.getItem('sn_settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          if (parsed.locationShare === false) return;
        } catch {
          // Ignore malformed local settings and continue with default behavior.
        }
      }
      const activeBooking = bookingsRef.current.find((b) => ['accepted', 'arriving', 'in_progress'].includes(b.status));
      if (!activeBooking) return;
      navigator.geolocation.getCurrentPosition(pos => socket.emit('worker:location', { lat: pos.coords.latitude, lng: pos.coords.longitude, booking_id: activeBooking.id }));
    }, 15000);

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [bookings]);

  async function toggleAvailability() { const socket = connectSocket(); socket.emit('worker:availability', { available: !available }); setAvailable(!available); }

  async function goOnline() {
    if (available) return;
    const socket = connectSocket();
    socket.emit('worker:availability', { available: true });
    setAvailable(true);
  }

  async function handleAction(bookingId: string, action: 'accept'|'reject'|'arriving'|'start'|'complete') {
    const actions = { accept: jobsApi.accept, arriving: jobsApi.arriving, start: jobsApi.start, complete: jobsApi.complete };
    if (action === 'accept' || action === 'reject') {
      setIncomingJobs(prev => prev.filter(job => job.id !== bookingId));
    }

    if (action === 'reject') {
      await jobsApi.reject(bookingId, 'Worker unavailable at requested time');
    } else {
      await actions[action](bookingId);
    }

    const [availableRes, bRes, eRes, meRes] = await Promise.all([jobsApi.available(), bookingsApi.list(), jobsApi.earnings(), authApi.me()]);
    setIncomingJobs((availableRes.data || []) as IncomingJob[]);
    setBookings(bRes.data as Booking[]);
    setEarnings(eRes.data as Earnings);
    setWorkerMeta({
      rating: meRes.data?.rating != null ? Number(meRes.data.rating) : null,
      total_jobs: meRes.data?.total_jobs != null ? Number(meRes.data.total_jobs) : null,
      is_available: meRes.data?.is_available ?? null,
    });
  }

  const active = bookings.filter(b => ['accepted','arriving','in_progress'].includes(b.status));
  const history = bookings.filter(b => ['completed', 'cancelled', 'disputed'].includes(b.status)).slice(0,10);
  const primaryActiveJob = active[0] || null;

  const demoJobs: IncomingJob[] = [
    {
      id: 'demo-job-1',
      status: 'REQUESTED',
      customer_name: 'Riya Sharma',
      customer_phone: '9876543210',
      service_type: 'Deep Cleaning',
      service_icon: '🧼',
      address: 'Sector 18, Noida',
      scheduled_at: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
      slot_start: '16:00',
      slot_end: '17:00',
      amount: 149900,
    },
    {
      id: 'demo-job-2',
      status: 'REQUESTED',
      customer_name: 'Arjun Mehta',
      customer_phone: '9123456780',
      service_type: 'AC Repair',
      service_icon: '❄️',
      address: 'Indiranagar, Bengaluru',
      scheduled_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      slot_start: '16:30',
      slot_end: '17:30',
      amount: 189900,
    },
  ];

  const visibleIncomingJobs = incomingJobs.length > 0 ? incomingJobs : (isDemoMode ? demoJobs : []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,#e8f0ff_0%,#f5f8ff_35%,#f2f6fb_100%)] pb-8">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/85 border-b border-blue-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900 text-lg">Hey, {user?.name?.split(' ')[0]} 👋</p>
            <p className="text-xs text-gray-500">Worker dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs font-semibold px-3.5 py-2 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
              onClick={() => router.push('/worker/availability')}
            >
              Set Availability
            </button>
            <button onClick={toggleAvailability} className="flex items-center gap-2 text-sm font-semibold">
              {available ? <><ToggleRight size={28} className="text-green-500" /><span className="text-green-600">Available</span></> : <><ToggleLeft size={28} className="text-gray-400" /><span className="text-gray-500">Off</span></>}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <section className="rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-600 text-white p-6 md:p-7 shadow-xl border border-blue-500/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.24) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -left-16 -bottom-16 h-44 w-44 rounded-full bg-black/20 blur-2xl" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-blue-100 text-sm">Today at a glance</p>
              <h1 className="text-2xl md:text-3xl font-bold mt-1">Your Service Command Center</h1>
              <p className="text-blue-100 mt-2 text-sm">Stay active, respond quickly, and maximize earnings.</p>
            </div>
            <div className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[180px]">
              <p className="text-xs text-blue-100">Live status</p>
              <p className="mt-1 text-lg font-semibold flex items-center gap-2">
                {available ? <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" /> : <span className="inline-flex h-2.5 w-2.5 rounded-full bg-slate-300" />}
                {available ? 'Online for jobs' : 'Offline'}
              </p>
            </div>
          </div>
        </section>

        {earnings && (
          <section className="rounded-2xl border border-emerald-100 bg-white/95 backdrop-blur shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-500">Earnings Summary</p>
                <p className="text-3xl font-extrabold text-green-700">₹{Math.floor(Number(earnings.total_earnings) / 100).toLocaleString('en-IN')}</p>
                <p className="text-xs text-gray-500">Total earned</p>
              </div>
              <Briefcase size={22} className="text-green-600" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <p className="text-xs text-gray-500">This week</p>
                <p className="text-xl font-bold text-green-700">₹{Math.floor(Number(earnings.this_week) / 100).toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <p className="text-xs text-gray-500">This month</p>
                <p className="text-xl font-bold text-green-700">₹{Math.floor(Number(earnings.this_month) / 100).toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-white p-3">
                <p className="text-xs text-gray-500">Completed</p>
                <p className="text-xl font-bold text-gray-900">{earnings.total_jobs}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-white p-3">
                <p className="text-xs text-gray-500">Rating</p>
                <p className="text-xl font-bold text-gray-900">{workerMeta?.rating ? workerMeta.rating.toFixed(1) : 'N/A'}</p>
              </div>
            </div>
          </section>
        )}

        {primaryActiveJob && (
          <section className="rounded-2xl border border-blue-100 bg-white/95 backdrop-blur shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Active Job</h2>
              <span className="badge badge-accepted capitalize">{primaryActiveJob.status.replace('_', ' ')}</span>
            </div>
            <div className="space-y-2 mb-4 text-sm text-gray-600">
              <p className="font-semibold text-gray-900">{primaryActiveJob.category_icon} {primaryActiveJob.category_name} • {primaryActiveJob.customer_name}</p>
              <p className="text-xs flex items-center gap-1.5"><Clock size={12} /> {new Date(primaryActiveJob.scheduled_at).toLocaleString('en-IN')}</p>
              <p className="text-xs flex items-center gap-1.5"><MapPin size={12} /> {primaryActiveJob.address}</p>
              <p className="text-sm font-bold text-blue-700">₹{Math.floor(primaryActiveJob.amount/100)}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <a href={`tel:+91${primaryActiveJob.customer_phone}`} className="btn-secondary text-sm py-2 px-2 flex items-center justify-center gap-1"><Phone size={14} />Call</a>
              <button
                onClick={() => handleAction(primaryActiveJob.id, 'accept')}
                disabled={primaryActiveJob.status !== 'pending'}
                className={`text-sm py-2 rounded-xl font-medium ${primaryActiveJob.status === 'pending' ? 'btn-primary' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                Accept
              </button>
              <button
                onClick={() => handleAction(primaryActiveJob.id, 'start')}
                disabled={!(primaryActiveJob.status === 'accepted' || primaryActiveJob.status === 'arriving')}
                className={`text-sm py-2 rounded-xl font-medium ${primaryActiveJob.status === 'accepted' || primaryActiveJob.status === 'arriving' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                Start
              </button>
              <button
                onClick={() => handleAction(primaryActiveJob.id, 'complete')}
                disabled={primaryActiveJob.status !== 'in_progress'}
                className={`text-sm py-2 rounded-xl font-medium ${primaryActiveJob.status === 'in_progress' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                Complete
              </button>
            </div>
          </section>
        )}

        {visibleIncomingJobs.length > 0 && (
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">Incoming Jobs</h2>
            {isDemoMode && incomingJobs.length === 0 && (
              <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Demo preview jobs shown while live queue is empty.</p>
            )}
            <div className="space-y-3">
              {visibleIncomingJobs.map((b) => (
                <IncomingJobCard
                  key={b.id}
                  booking={b}
                  onAccept={() => handleAction(b.id,'accept')}
                  onReject={() => handleAction(b.id,'reject')}
                  isDemo={b.id.startsWith('demo-job-')}
                />
              ))}
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section>
            <h2 className="font-semibold text-gray-900 mb-2">Job History</h2>
            <div className="space-y-2">
              {history.map((b) => (
                <div key={b.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3 flex items-center gap-3 opacity-90 shadow-sm">
                  <CheckCircle size={18} className={`${b.status === 'completed' ? 'text-green-500' : 'text-gray-400'} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{b.customer_name}</p>
                    <p className="text-xs text-gray-400">{new Date(b.scheduled_at).toLocaleDateString('en-IN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-700">₹{Math.floor(b.amount/100)}</p>
                    <p className="text-xs uppercase tracking-wide text-gray-500">{b.status.replace('_', ' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {visibleIncomingJobs.length===0 && active.length===0 && !loading && (
          <section className="rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg p-8 text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 via-blue-100 to-indigo-100 border border-blue-200">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm border border-blue-100">
                <Wifi size={26} className="text-blue-600" />
              </div>
            </div>
            <p className="text-base font-semibold text-slate-800">No jobs right now — stay online to receive requests</p>
            <button
              type="button"
              onClick={goOnline}
              disabled={available}
              className={`mt-4 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition ${available ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              Go Online
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function IncomingJobCard({ booking, onAccept, onReject, isDemo = false }: { booking: IncomingJob; onAccept: () => Promise<void>; onReject: () => Promise<void>; isDemo?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    await fn();
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Bell size={14} className="text-blue-600" /> New request • {booking.service_icon || '🛠️'} {booking.service_type}</p>
          <p className="text-xs text-gray-500 mt-1">{booking.customer_name} • {new Date(booking.scheduled_at).toLocaleString('en-IN')}</p>
          {(booking.slot_start && booking.slot_end) && <p className="text-xs text-gray-500 mt-1">Slot: {booking.slot_start} - {booking.slot_end}</p>}
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{booking.address}</p>
        </div>
        <span className="text-base font-bold text-blue-700">₹{Math.floor(booking.amount / 100)}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => run(onAccept)} disabled={loading || isDemo} className={`text-sm py-2 px-4 ${isDemo ? 'bg-gray-100 text-gray-400 rounded-xl cursor-not-allowed' : 'btn-primary'}`}>{loading ? '...' : 'Accept'}</button>
        <button onClick={() => run(onReject)} disabled={loading || isDemo} className={`text-sm py-2 px-4 ${isDemo ? 'bg-gray-100 text-gray-400 rounded-xl cursor-not-allowed' : 'btn-secondary'}`}>{loading ? '...' : 'Reject'}</button>
        {isDemo && <span className="inline-flex items-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2">Demo</span>}
      </div>
    </div>
  );
}
