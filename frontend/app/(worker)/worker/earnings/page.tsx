'use client';
import { useEffect, useState } from 'react';
import { jobsApi, bookingsApi } from '@/lib/api';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';

export default function WorkerEarningsPage() {
  const [earnings, setEarnings] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([jobsApi.earnings(), bookingsApi.list('completed')]).then(([e, b]) => {
      setEarnings(e.data);
      setJobs(b.data);
    });
  }, []);

  return (
    <AppWrapperLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <h1 className="text-2xl font-bold text-gray-900">Earnings & Payouts</h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-4"><p className="text-xs text-gray-500">This week</p><p className="text-2xl font-bold">₹{Math.floor(Number(earnings?.this_week || 0) / 100)}</p></div>
          <div className="card p-4"><p className="text-xs text-gray-500">This month</p><p className="text-2xl font-bold">₹{Math.floor(Number(earnings?.this_month || 0) / 100)}</p></div>
          <div className="card p-4"><p className="text-xs text-gray-500">Total jobs</p><p className="text-2xl font-bold">{Number(earnings?.total_jobs || 0)}</p></div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Completed Jobs</h2>
          <div className="space-y-2">
            {jobs.slice(0, 20).map((j) => (
              <div key={j.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                <span className="text-gray-700">{j.category_name} · {j.customer_name}</span>
                <span className="font-semibold">₹{Math.floor(j.amount / 100)}</span>
              </div>
            ))}
            {jobs.length === 0 && <p className="text-sm text-gray-500">No completed jobs yet.</p>}
          </div>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
