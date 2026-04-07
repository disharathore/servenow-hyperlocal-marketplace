'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { CheckCircle, Clock, AlertCircle, TrendingUp, ShieldCheck } from 'lucide-react';

type Tab = 'overview'|'bookings'|'workers'|'disputes';

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!user) { router.push('/login'); return; } if (user.role !== 'admin') { router.push('/'); return; } adminApi.stats().then(r => { setStats(r.data); setLoading(false); }); }, [user,router]);
  useEffect(() => {
    if (tab==='bookings'&&bookings.length===0) adminApi.bookings().then(r=>setBookings(r.data));
    if (tab==='workers'&&workers.length===0) adminApi.workers().then(r=>setWorkers(r.data));
    if (tab==='disputes'&&disputes.length===0) adminApi.disputes().then(r=>setDisputes(r.data));
  }, [tab, bookings.length, workers.length, disputes.length]);

  if (loading||!stats) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading…</div></div>;

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
        {tab==='bookings' && <div className="space-y-3">{bookings.map((b:any) => <div key={b.id} className="card p-4"><div className="flex items-center justify-between mb-2"><div><p className="font-semibold text-gray-900 text-sm">{b.category_name}</p><p className="text-xs text-gray-400">{b.customer_name} → {b.worker_name}</p></div><div className="text-right"><span className={`badge badge-${b.status}`}>{b.status.replace('_',' ')}</span><p className="text-xs text-gray-400 mt-1">₹{Math.floor(b.amount/100)}</p></div></div><p className="text-xs text-gray-400">{new Date(b.scheduled_at).toLocaleString('en-IN')} · ID: {b.id.slice(0,8)}</p></div>)}</div>}
        {tab==='workers' && <div className="space-y-3">{workers.map((w:any) => <div key={w.id} className="card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-lg font-bold text-blue-600 flex-shrink-0">{w.name[0]}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="font-semibold text-gray-900 text-sm">{w.name}</p>{w.is_background_verified&&<ShieldCheck size={14} className="text-green-500" />}</div><p className="text-xs text-gray-400">{w.category_name} · ⭐ {w.rating} · {w.total_jobs} jobs</p></div><div className="flex flex-col items-end gap-2"><span className={`text-xs font-medium ${w.is_available?'text-green-600':'text-gray-400'}`}>{w.is_available?'Online':'Offline'}</span>{!w.is_background_verified&&<button onClick={()=>adminApi.verifyWorker(w.id).then(()=>setWorkers(ws=>ws.map(x=>x.id===w.id?{...x,is_background_verified:true}:x)))} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg">Verify</button>}</div></div>)}</div>}
        {tab==='disputes' && <div className="space-y-3">{disputes.length === 0 ? <div className="card p-4 text-sm text-gray-500">No open disputes.</div> : disputes.map((d:any) => <div key={d.id} className="card p-4"><div className="flex items-center justify-between"><div><p className="font-semibold text-sm text-gray-900">{d.category_name}</p><p className="text-xs text-gray-500">{d.customer_name} vs {d.worker_name}</p></div><span className="badge bg-yellow-100 text-yellow-700">disputed</span></div><p className="text-xs text-gray-500 mt-2">Reason: {d.cancellation_reason || 'Customer raised issue'}</p><div className="mt-3 flex gap-2"><button onClick={() => adminApi.resolveDispute(d.id, 'completed').then(() => setDisputes((prev) => prev.filter((x) => x.id !== d.id)))} className="btn-primary text-sm py-2">Resolve as Completed</button><button onClick={() => adminApi.resolveDispute(d.id, 'cancelled').then(() => setDisputes((prev) => prev.filter((x) => x.id !== d.id)))} className="btn-secondary text-sm py-2">Resolve as Cancelled</button></div></div>)}</div>}
      </main>
    </div>
  );
}
