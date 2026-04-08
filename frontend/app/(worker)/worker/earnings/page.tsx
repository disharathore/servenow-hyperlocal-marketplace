'use client';
import { useEffect, useState } from 'react';
import { jobsApi, bookingsApi } from '@/lib/api';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';

interface EarningsSummary {
  total_jobs: number;
  total_earnings: number | string;
  today: number | string;
  this_week: number | string;
  this_month: number | string;
  pending_payouts: number | string;
}

interface CompletedJob {
  id: string;
  category_name: string;
  customer_name: string;
  amount: number;
  completed_at: string | null;
  scheduled_at: string;
  payment_status: string;
}

export default function WorkerEarningsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [jobs, setJobs] = useState<CompletedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'worker') {
      router.push('/');
      return;
    }

    Promise.all([jobsApi.earnings(), bookingsApi.list('completed')])
      .then(([e, b]) => {
        setEarnings(e.data as EarningsSummary);
        setJobs((b.data as CompletedJob[]) || []);
      })
      .catch(() => setError('Unable to load earnings right now.'))
      .finally(() => setLoading(false));
  }, [user, router]);

  const toRupee = (value: number | string | undefined) => `₹${Math.floor(Number(value || 0) / 100)}`;

  return (
    <AppWrapperLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">Earnings & Payouts</h1>
        {loading && <div className="card p-6 text-sm text-gray-500">Loading earnings...</div>}
        {error && <div className="card p-6 text-sm text-red-600">{error}</div>}
        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-4"><p className="text-xs text-gray-500">Today</p><p className="text-2xl font-bold">{toRupee(earnings?.today)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">This week</p><p className="text-2xl font-bold">{toRupee(earnings?.this_week)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">This month</p><p className="text-2xl font-bold">{toRupee(earnings?.this_month)}</p></div>
              <div className="card p-4"><p className="text-xs text-gray-500">Total jobs</p><p className="text-2xl font-bold">{Number(earnings?.total_jobs || 0)}</p></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card p-4 border border-green-100 bg-green-50/40">
                <p className="text-xs text-gray-500">Total earnings</p>
                <p className="text-3xl font-bold text-green-700">{toRupee(earnings?.total_earnings)}</p>
              </div>
              <div className="card p-4 border border-amber-100 bg-amber-50/40">
                <p className="text-xs text-gray-500">Pending payouts</p>
                <p className="text-3xl font-bold text-amber-700">{toRupee(earnings?.pending_payouts)}</p>
              </div>
            </div>

            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Completed Jobs</h2>
              <div className="space-y-2">
                {jobs.slice(0, 30).map((j) => (
                  <div key={j.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                    <div>
                      <p className="text-gray-700 font-medium">{j.category_name} · {j.customer_name}</p>
                      <p className="text-xs text-gray-400">{new Date(j.completed_at || j.scheduled_at).toLocaleString('en-IN')} · {j.payment_status}</p>
                    </div>
                    <span className="font-semibold">₹{Math.floor(Number(j.amount || 0) / 100)}</span>
                  </div>
                ))}
                {jobs.length === 0 && <p className="text-sm text-gray-500">No completed jobs yet.</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </AppWrapperLayout>
  );
}
