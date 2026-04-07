'use client';
import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string,string> = { pending:'badge-pending', accepted:'badge-accepted', in_progress:'badge-in_progress', completed:'badge-completed', cancelled:'badge-cancelled' };

export default function DashboardPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { bookingsApi.list(filter||undefined).then(r => { setBookings(r.data); setLoading(false); }); }, [filter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <h1 className="font-bold text-gray-900">My Bookings</h1>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {['','pending','accepted','in_progress','completed','cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${filter===s?'bg-blue-600 text-white':'bg-white text-gray-600 border border-gray-200'}`}>{s===''?'All':s.replace('_',' ')}</button>
          ))}
        </div>
        {loading ? <div className="space-y-3">{Array.from({length:3}).map((_,i) => <div key={i} className="card p-4 animate-pulse h-28 bg-gray-100" />)}</div>
          : bookings.length===0 ? <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">📋</p><p className="font-medium">No bookings yet</p><Link href="/" className="btn-primary inline-block mt-4 text-sm">Book a Service</Link></div>
          : <div className="space-y-3">{bookings.map((b:any) => (
            <Link key={b.id} href={`/track/${b.id}`} className="card p-4 block hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2"><span className="text-xl">{b.category_icon}</span><div><p className="font-semibold text-gray-900">{b.category_name}</p><p className="text-xs text-gray-400">{b.worker_name}</p></div></div>
                <span className={`badge ${STATUS_COLORS[b.status]||''}`}>{b.status.replace('_',' ')}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400 mt-2">
                <span className="flex items-center gap-1"><Clock size={12} />{new Date(b.scheduled_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">₹{(b.amount/100).toFixed(0)} · {b.payment_status}</span>
                {['accepted','in_progress'].includes(b.status) && <span className="text-xs text-blue-600 font-medium">Track live →</span>}
              </div>
            </Link>
          ))}</div>
        }
      </div>
    </div>
  );
}
