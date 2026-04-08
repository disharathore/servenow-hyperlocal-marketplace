'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { reviewsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Star, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function ReviewPage() {
  const { bookingId } = useParams() as { bookingId: string };
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const [rating, setRating] = useState(0); const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState(''); const [loading, setLoading] = useState(false); const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'customer') {
      router.push(user.role === 'worker' ? '/worker/dashboard' : '/admin');
      return;
    }
  }, [user, router]);

  async function handleSubmit() {
    if (rating === 0) return;
    setLoading(true);
    try {
      await reviewsApi.submit({ booking_id: bookingId, rating, comment });
      toast.success('Review submitted successfully');
      setSubmitted(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    }
    catch {
      toast.error('Failed to submit. You may have already reviewed this booking.');
    }
    finally { setLoading(false); }
  }

  if (submitted) return <div className="min-h-screen flex items-center justify-center text-center px-4"><div><p className="text-5xl mb-4">🎉</p><h2 className="text-xl font-bold text-gray-900">Thanks for your review!</h2><p className="text-gray-500 mt-2">Redirecting…</p></div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100"><div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3"><button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button><h1 className="font-bold text-gray-900">Rate your experience</h1></div></header>
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="card p-6 text-center">
          <p className="text-gray-500 mb-4 text-sm">How was the service?</p>
          <div className="flex justify-center gap-3 mb-6">
            {[1,2,3,4,5].map(s => <button key={s} onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)} onClick={() => setRating(s)}><Star size={36} className={`transition-colors ${s<=(hovered||rating)?'text-yellow-400 fill-yellow-400':'text-gray-300'}`} /></button>)}
          </div>
          <textarea className="input resize-none text-sm" rows={3} placeholder="Share your experience (optional)…" value={comment} onChange={e => setComment(e.target.value)} />
          <button className="btn-primary w-full mt-4" onClick={handleSubmit} disabled={rating===0||loading}>{loading?'Submitting…':'Submit Review'}</button>
        </div>
      </div>
    </div>
  );
}
