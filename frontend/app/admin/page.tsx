'use client';
import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { CheckCircle, Clock, AlertCircle, TrendingUp, ShieldCheck } from 'lucide-react';

type Tab = 'overview'|'bookings'|'workers'|'disputes';

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
  id: string;
  name: string;
  category_name: string;
  rating: number;
  total_jobs: number;
  is_background_verified: boolean;
  is_available: boolean;
}

interface AdminDispute {
  id: string;
  category_name: string;
  customer_name: string;
  worker_name: string;
  cancellation_reason: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [workers, setWorkers] = useState<AdminWorker[]>([]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState('');
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

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'admin') { router.push('/'); return; }
    fetchStats();
  }, [user,router]);

  const fetchTabData = async (nextTab: Tab) => {
    if (nextTab === 'overview') return;
    if (fetchedTabs.current.has(nextTab)) return;

    setTabError('');
    setTabLoading(true);
    try {
      if (nextTab === 'bookings') {
        const r = await adminApi.bookings();
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
      fetchedTabs.current.add(nextTab);
    } catch {
      setTabError(`Unable to load ${nextTab}. Please retry.`);
    } finally {
      setTabLoading(false);
    }
  };

  useEffect(() => {
    fetchTabData(tab);
  }, [tab]);

  const refreshCurrentTab = () => {
    fetchedTabs.current.delete(tab);
    if (tab === 'bookings') setBookings([]);
    if (tab === 'disputes') setDisputes([]);
    fetchTabData(tab);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading…</div></div>;
  if (pageError || !stats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card p-6 max-w-md w-full text-center">
          <p className="font-semibold text-gray-900">Admin dashboard unavailable</p>
          <p className="text-sm text-gray-500 mt-2">{pageError || 'Unable to load admin stats.'}</p>
          <button className="btn-primary mt-4" onClick={fetchStats}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-xl">⚡</span><span className="font-bold text-gray-900">ServeNow Admin</span></div>
          <span className="badge bg-red-100 text-red-700">Admin</span>
        </div>
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pb-0">
          {(['overview','bookings','workers','disputes'] as Tab[]).map(t => <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${tab===t?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>)}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {tabError && <div className="card p-3 mb-4 text-sm text-red-600 border border-red-200 bg-red-50">{tabError}</div>}
        {tabLoading && tab !== 'overview' && <div className="card p-3 mb-4 text-sm text-gray-500">Loading {tab}...</div>}
        {tab==='overview' && <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-5"><p className="text-xs text-gray-400 mb-1">Total GMV</p><p className="text-2xl font-bold text-gray-900">₹{Math.floor(Number(stats.revenue.total_gmv)/100).toLocaleString('en-IN')}</p></div>
            <div className="card p-5"><p className="text-xs text-gray-400 mb-1">This month</p><p className="text-2xl font-bold text-blue-600">₹{Math.floor(Number(stats.revenue.this_month_gmv)/100).toLocaleString('en-IN')}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[{label:'Today',value:stats.bookings.today,icon:Clock,color:'text-blue-600'},{label:'Completed',value:stats.bookings.completed,icon:CheckCircle,color:'text-green-600'},{label:'Cancelled',value:stats.bookings.cancelled,icon:AlertCircle,color:'text-red-500'},{label:'Pending',value:stats.bookings.pending,icon:Clock,color:'text-yellow-600'},{label:'In progress',value:stats.bookings.in_progress,icon:TrendingUp,color:'text-purple-600'},{label:'Total',value:stats.bookings.total,icon:CheckCircle,color:'text-gray-700'}].map(s => (
              <div key={s.label} className="card p-4"><s.icon size={16} className={`${s.color} mb-2`} /><p className="text-xl font-bold text-gray-900">{s.value}</p><p className="text-xs text-gray-400">{s.label}</p></div>
            ))}
          </div>
        </div>}
        {tab==='bookings' && <div className="space-y-3"><div className="flex justify-end"><button onClick={refreshCurrentTab} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">Refresh</button></div>{bookings.map((b) => <div key={b.id} className="card p-4"><div className="flex items-center justify-between mb-2"><div><p className="font-semibold text-gray-900 text-sm">{b.category_name}</p><p className="text-xs text-gray-400">{b.customer_name} → {b.worker_name}</p></div><div className="text-right"><span className={`badge badge-${b.status}`}>{b.status.replace('_',' ')}</span><p className="text-xs text-gray-400 mt-1">₹{Math.floor(b.amount/100)}</p></div></div><p className="text-xs text-gray-400">{new Date(b.scheduled_at).toLocaleString('en-IN')} · ID: {b.id.slice(0,8)}</p></div>)}</div>}
        {tab==='workers' && <div className="space-y-3">{workers.map((w) => <div key={w.id} className="card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-lg font-bold text-blue-600 flex-shrink-0">{w.name[0]}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="font-semibold text-gray-900 text-sm">{w.name}</p>{w.is_background_verified&&<ShieldCheck size={14} className="text-green-500" />}</div><p className="text-xs text-gray-400">{w.category_name} · ⭐ {w.rating} · {w.total_jobs} jobs</p></div><div className="flex flex-col items-end gap-2"><span className={`text-xs font-medium ${w.is_available?'text-green-600':'text-gray-400'}`}>{w.is_available?'Online':'Offline'}</span>{!w.is_background_verified&&<button onClick={()=>adminApi.verifyWorker(w.id).then(()=>setWorkers(ws=>ws.map(x=>x.id===w.id?{...x,is_background_verified:true}:x)))} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg">Verify</button>}</div></div>)}</div>}
        {tab==='disputes' && <div className="space-y-3"><div className="flex justify-end"><button onClick={refreshCurrentTab} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">Refresh</button></div>{disputes.length === 0 ? <div className="card p-4 text-sm text-gray-500">No open disputes.</div> : disputes.map((d) => <div key={d.id} className="card p-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-sm text-gray-900">{d.category_name}</p><p className="text-xs text-gray-500">{d.customer_name} vs {d.worker_name}</p></div><span className="badge bg-yellow-100 text-yellow-700">disputed</span></div><p className="text-xs text-gray-500 mt-2">Reason: {d.cancellation_reason || 'Customer raised issue'}</p><div className="mt-3 flex gap-2"><button onClick={() => adminApi.resolveDispute(d.id, 'completed').then(() => setDisputes((prev) => prev.filter((x) => x.id !== d.id)))} className="btn-primary text-sm py-2">Resolve as Completed</button><button onClick={() => adminApi.resolveDispute(d.id, 'cancelled').then(() => setDisputes((prev) => prev.filter((x) => x.id !== d.id)))} className="btn-secondary text-sm py-2">Resolve as Cancelled</button></div></div>)}</div>}
      </main>
    </div>
  );
}
