'use client';
import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { ShieldCheck, BarChart3 } from 'lucide-react';
import { CardListSkeleton, FullPageSkeleton } from '@/app/_components/MarketplaceSkeletons';
import Link from 'next/link';
import { connectSocket } from '@/lib/socket';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

type Tab = 'overview'|'bookings'|'workers'|'users'|'disputes';

interface AdminStats {
  bookings: {
    today: number;
    completed: number;
    cancelled: number;
    pending: number;
    in_progress: number;
    total: number;
  };
  revenue: {
    total_gmv: number | string;
    this_month_gmv: number | string;
  };
  dashboard_metrics?: {
    total_bookings: number;
    revenue: number;
    active_workers: number;
  };
}

interface AdminBooking {
  id: string;
  category_name: string;
  customer_name: string;
  worker_name: string;
  status: string;
  amount: number;
  scheduled_at: string;
}

interface AdminWorker {
  user_id: string;
  id: string;
  name: string;
  category_name: string;
  rating: number;
  total_jobs: number;
  is_background_verified: boolean;
  is_available: boolean;
}

interface AdminUser {
  id: string;
  name: string | null;
  phone: string;
  role: 'customer' | 'worker' | 'admin';
  is_active: boolean;
  created_at: string;
}

interface AdminDispute {
  id: string;
  category_name: string;
  customer_name: string;
  worker_name: string;
  cancellation_reason: string | null;
}

interface ShowcaseResponse {
  metrics: {
    total_users: number;
    total_bookings: number;
    active_jobs: number;
    revenue: number;
  };
  charts: {
    bookings_per_day: Array<{ label: string; count: number }>;
    top_services: Array<{ service: string; count: number; revenue: number }>;
  };
}

interface LiveActivityItem {
  id: string;
  type: 'new_booking' | 'booking_accepted';
  message: string;
  ts: string;
}

interface ScenarioStepItem {
  id: string;
  step: string;
  message: string;
  ts: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [recentBookings, setRecentBookings] = useState<AdminBooking[]>([]);
  const [workers, setWorkers] = useState<AdminWorker[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState('');
  const [showcase, setShowcase] = useState<ShowcaseResponse | null>(null);
  const [activity, setActivity] = useState<LiveActivityItem[]>([]);
  const [scenarioId, setScenarioId] = useState('');
  const [scenarioRunning, setScenarioRunning] = useState(false);
  const [scenarioSteps, setScenarioSteps] = useState<ScenarioStepItem[]>([]);
  const [showRealOnlyBookings, setShowRealOnlyBookings] = useState(false);
  const fetchedTabs = useRef<Set<string>>(new Set());

  const fetchStats = async () => {
    setLoading(true);
    setPageError('');
    try {
      const r = await adminApi.stats();
      setStats(r.data as AdminStats);
    } catch {
      setPageError('Unable to load admin stats. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const fetchShowcase = async () => {
    try {
      const r = await adminApi.showcase();
      setShowcase(r.data as ShowcaseResponse);
    } catch {
      // Keep existing snapshot if realtime is running.
    }
  };

  const fetchRecentBookings = async () => {
    try {
      const r = await adminApi.bookings();
      const rows = Array.isArray(r.data) ? (r.data as AdminBooking[]) : [];
      setRecentBookings(rows.slice(0, 8));
    } catch {
      // Keep dashboard stable even if one section fails.
    }
  };

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'admin') { router.push('/'); return; }
    fetchStats();
    fetchShowcase();
    fetchRecentBookings();
  }, [user,router]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const socket = connectSocket();

    const handleAdminActivity = (payload: { type?: 'new_booking' | 'booking_accepted'; booking_id?: string; category?: string; ts?: string }) => {
      const eventType = payload.type;
      if (!eventType) return;

      const next: LiveActivityItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: eventType,
        message: eventType === 'new_booking'
          ? `New booking request${payload.category ? ` • ${payload.category}` : ''}`
          : 'Worker accepted job',
        ts: payload.ts || new Date().toISOString(),
      };

      setActivity((prev) => [next, ...prev].slice(0, 8));
      fetchShowcase();
      fetchRecentBookings();
    };

    socket.on('admin:activity', handleAdminActivity);

    const handleScenarioStep = (payload: { scenario_id?: string; step?: string; message?: string; ts?: string }) => {
      if (!payload.scenario_id || !payload.step || !payload.message) return;
      const step = payload.step;
      const message = payload.message;

      setScenarioId(payload.scenario_id);
      setScenarioRunning(step !== 'completion');
      setScenarioSteps((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          step,
          message,
          ts: payload.ts || new Date().toISOString(),
        },
      ]);
      fetchShowcase();
      fetchStats();
      fetchRecentBookings();
    };

    socket.on('demo:scenario_step', handleScenarioStep);

    return () => {
      socket.off('admin:activity', handleAdminActivity);
      socket.off('demo:scenario_step', handleScenarioStep);
    };
  }, [user]);

  const runDemoScenario = async () => {
    setScenarioRunning(true);
    setScenarioSteps([
      {
        id: `boot-${Date.now()}`,
        step: 'starting',
        message: 'Scenario started. Preparing booking flow...',
        ts: new Date().toISOString(),
      },
    ]);
    try {
      const r = await adminApi.runDemoScenario();
      if (r.data?.scenario_id) setScenarioId(String(r.data.scenario_id));
    } catch {
      setScenarioRunning(false);
      setScenarioSteps((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          step: 'error',
          message: 'Failed to run scenario. Please try again.',
          ts: new Date().toISOString(),
        },
      ]);
    }
  };

  const fetchTabData = async (nextTab: Tab) => {
    if (nextTab === 'overview') return;
    if (fetchedTabs.current.has(nextTab)) return;

    setTabError('');
    setTabLoading(true);
    try {
      if (nextTab === 'bookings') {
        const r = await adminApi.bookings(undefined, showRealOnlyBookings);
        setBookings(r.data as AdminBooking[]);
      }
      if (nextTab === 'workers') {
        const r = await adminApi.workers();
        setWorkers(r.data as AdminWorker[]);
      }
      if (nextTab === 'disputes') {
        const r = await adminApi.disputes();
        setDisputes(r.data as AdminDispute[]);
      }
      if (nextTab === 'users') {
        const r = await adminApi.users();
        setUsers(r.data as AdminUser[]);
      }
      fetchedTabs.current.add(nextTab);
    } catch {
      setTabError(`Unable to load ${nextTab}. Please retry.`);
    } finally {
      setTabLoading(false);
    }
  };

  useEffect(() => {
    fetchTabData(tab);
  }, [tab, showRealOnlyBookings]);

  const refreshCurrentTab = () => {
    fetchedTabs.current.delete(tab);
    if (tab === 'bookings') setBookings([]);
    if (tab === 'users') setUsers([]);
    if (tab === 'disputes') setDisputes([]);
    fetchTabData(tab);
  };

  if (loading) return <FullPageSkeleton />;
  if (pageError || !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-6 max-w-md w-full text-center">
          <p className="font-semibold text-gray-900">Admin dashboard unavailable</p>
          <p className="text-sm text-gray-500 mt-2">{pageError || 'Unable to load admin stats.'}</p>
          <button className="btn-primary mt-4" onClick={fetchStats}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-xl">⚡</span><span className="font-bold text-gray-900">ServeNow Admin</span></div>
          <Link href="/admin/heatmap" className="flex items-center gap-2 px-3 py-1 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors text-sm font-medium">
            <BarChart3 className="w-4 h-4" />
            Heatmap
          </Link>
        </div>
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pb-0">
          {(['overview','bookings','workers','users','disputes'] as Tab[]).map(t => <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${tab===t?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>)}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {tabError && <div className="card p-3 mb-4 text-sm text-red-600 border border-red-200 bg-red-50">{tabError}</div>}
        {tabLoading && tab !== 'overview' && (
          <div className="mb-4">
            <CardListSkeleton rows={3} />
          </div>
        )}
        {tab==='overview' && <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-xs text-gray-400 mb-1">Total users</p>
              <p className="text-3xl font-bold text-gray-900">{showcase?.metrics.total_users ?? 0}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-gray-400 mb-1">Bookings</p>
              <p className="text-3xl font-bold text-gray-900">{showcase?.metrics.total_bookings ?? stats.bookings.total}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs text-gray-400 mb-1">Revenue</p>
              <p className="text-3xl font-bold text-green-700">₹{Math.floor((showcase?.metrics.revenue ?? Number(stats.revenue.total_gmv))/100).toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-900">Bookings over time</p>
              <span className="text-xs text-gray-500">Last 7 days</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={showcase?.charts.bookings_per_day || []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bookingsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ stroke: '#93c5fd', strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="count" stroke="#2563eb" fill="url(#bookingsFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-900">Recent bookings</p>
              <button onClick={fetchRecentBookings} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">Refresh</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-3">Booking</th>
                    <th className="py-2 pr-3">Service</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Worker</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500">No bookings yet.</td>
                    </tr>
                  )}
                  {recentBookings.map((booking) => (
                    <tr key={booking.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 pr-3 font-mono text-xs text-gray-700">{booking.id.slice(0, 8)}</td>
                      <td className="py-3 pr-3 text-gray-800">{booking.category_name}</td>
                      <td className="py-3 pr-3 text-gray-700">{booking.customer_name}</td>
                      <td className="py-3 pr-3 text-gray-700">{booking.worker_name}</td>
                      <td className="py-3 pr-3 text-gray-900 font-semibold">₹{Math.floor(booking.amount / 100)}</td>
                      <td className="py-3 pr-3">
                        <span className={`badge badge-${booking.status}`}>{booking.status.replace('_', ' ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">Live activity</p>
              <span className="text-xs text-green-600">Realtime</span>
            </div>
            <div className="space-y-2">
              {activity.length === 0 && <p className="text-sm text-gray-500">Waiting for events...</p>}
              {activity.map((item) => (
                <div key={item.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                  <p className="text-sm text-gray-800">{item.message}</p>
                  <span className="text-xs text-gray-400">{new Date(item.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Guided demo scenarios</p>
                <p className="text-xs text-gray-500">Auto-create booking, assign worker, then simulate accept, arrival, and completion.</p>
              </div>
              <button onClick={runDemoScenario} disabled={scenarioRunning} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
                {scenarioRunning ? 'Running scenario...' : 'Run Demo Scenario'}
              </button>
            </div>
            <div className="space-y-2">
              {scenarioId && <p className="text-xs text-gray-400">Scenario ID: {scenarioId}</p>}
              {scenarioSteps.length === 0 && <p className="text-sm text-gray-500">No scenario run yet.</p>}
              {scenarioSteps.map((item) => (
                <div key={item.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                  <p className="text-sm text-gray-800">{item.message}</p>
                  <span className="text-xs text-gray-400">{new Date(item.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>}
        {tab==='bookings' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showRealOnlyBookings}
                  onChange={(e) => {
                    fetchedTabs.current.delete('bookings');
                    setShowRealOnlyBookings(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Show real only
              </label>
              <button onClick={refreshCurrentTab} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">Refresh</button>
            </div>
            {bookings.map((b) => <div key={b.id} className="card p-4"><div className="flex items-center justify-between mb-2"><div><p className="font-semibold text-gray-900 text-sm">{b.category_name}</p><p className="text-xs text-gray-400">{b.customer_name} → {b.worker_name}</p></div><div className="text-right"><span className={`badge badge-${b.status}`}>{b.status.replace('_',' ')}</span><p className="text-xs text-gray-400 mt-1">₹{Math.floor(b.amount/100)}</p></div></div><p className="text-xs text-gray-400">{new Date(b.scheduled_at).toLocaleString('en-IN')} · ID: {b.id.slice(0,8)}</p></div>)}
          </div>
        )}
        {tab==='workers' && <div className="space-y-3">{workers.map((w) => <div key={w.id} className="card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-lg font-bold text-blue-600 flex-shrink-0">{w.name[0]}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="font-semibold text-gray-900 text-sm">{w.name}</p>{w.is_background_verified&&<ShieldCheck size={14} className="text-green-500" />}</div><p className="text-xs text-gray-400">{w.category_name} · ⭐ {w.rating} · {w.total_jobs} jobs</p></div><div className="flex flex-col items-end gap-2"><span className={`text-xs font-medium ${w.is_available?'text-green-600':'text-gray-400'}`}>{w.is_available?'Online':'Offline'}</span><button onClick={()=>adminApi.verifyWorker(w.id, !w.is_background_verified).then(()=>setWorkers(ws=>ws.map(x=>x.id===w.id?{...x,is_background_verified:!x.is_background_verified}:x)))} className={`text-xs border px-2 py-1 rounded-lg ${w.is_background_verified ? 'bg-gray-50 text-gray-700 border-gray-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{w.is_background_verified ? 'Revoke verification' : 'Approve verification'}</button></div></div>)}</div>}
        {tab==='users' && <div className="space-y-3"><div className="flex justify-end"><button onClick={refreshCurrentTab} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">Refresh</button></div>{users.map((u) => <div key={u.id} className="card p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-sm text-gray-900">{u.name || 'Unnamed user'} <span className="text-xs text-gray-400">({u.role})</span></p><p className="text-xs text-gray-500">{u.phone} · Joined {new Date(u.created_at).toLocaleDateString('en-IN')}</p></div><div className="flex items-center gap-2"><span className={`text-xs font-medium ${u.is_active ? 'text-green-700' : 'text-red-600'}`}>{u.is_active ? 'Active' : 'Banned'}</span><button onClick={() => adminApi.setUserBan(u.id, !u.is_active).then(() => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_active: !x.is_active } : x)))} className={`text-xs border px-2 py-1 rounded-lg ${u.is_active ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{u.is_active ? 'Ban user' : 'Unban user'}</button></div></div>)}</div>}
        {tab==='disputes' && <div className="space-y-3"><div className="flex justify-end"><button onClick={refreshCurrentTab} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">Refresh</button></div>{disputes.length === 0 ? <div className="card p-4 text-sm text-gray-500">No open disputes.</div> : disputes.map((d) => <div key={d.id} className="card p-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-sm text-gray-900">{d.category_name}</p><p className="text-xs text-gray-500">{d.customer_name} vs {d.worker_name}</p></div><span className="badge bg-yellow-100 text-yellow-700">disputed</span></div><p className="text-xs text-gray-500 mt-2">Reason: {d.cancellation_reason || 'Customer raised issue'}</p><div className="mt-3 flex gap-2"><button onClick={() => adminApi.resolveDispute(d.id, 'completed').then(() => setDisputes((prev) => prev.filter((x) => x.id !== d.id)))} className="btn-primary text-sm py-2">Resolve as Completed</button><button onClick={() => adminApi.resolveDispute(d.id, 'cancelled').then(() => setDisputes((prev) => prev.filter((x) => x.id !== d.id)))} className="btn-secondary text-sm py-2">Resolve as Cancelled</button></div></div>)}</div>}
      </main>
    </div>
  );
}
