'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { authApi, servicesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const TIMES = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

type Category = { id: string; name: string; icon?: string };

export default function WorkerSetupPage() {
  const router = useRouter();
  const updateUser = useAuthStore(s => s.updateUser);
  const [bio, setBio] = useState(''); const [exp, setExp] = useState(1); const [rate, setRate] = useState(300);
  const [skills, setSkills] = useState(''); const [pincode, setPincode] = useState(''); const [pincodeInfo, setPincodeInfo] = useState<{ city: string; locality: string } | null>(null);
  const [slots, setSlots] = useState([{day:'Monday',start:'09:00',end:'17:00'},{day:'Tuesday',start:'09:00',end:'17:00'}]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    servicesApi.categories()
      .then((res) => {
        const items: Category[] = res.data || [];
        setCategories(items);
        if (items.length > 0) setCategoryId(items[0].id);
      })
      .catch(() => setError('Failed to load service categories'));
  }, []);

  async function lookupPincode() {
    if (pincode.length !== 6) return;
    try { const r = await fetch(`https://api.postalpincode.in/pincode/${pincode}`); const d = await r.json(); if (d[0]?.Status==='Success') setPincodeInfo({ city: d[0].PostOffice[0].District, locality: d[0].PostOffice[0].Name }); } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bio.trim()) return setError('Please add a bio');
    if (!categoryId) return setError('Please select a service category');
    if (slots.length === 0) return setError('Add at least one slot');
    setError(''); setLoading(true);
    try {
      if (pincode) await api.patch('/auth/profile', { pincode, role: 'worker' });
      await api.post('/workers/setup', { bio, category_id: categoryId, experience_years: exp, hourly_rate: rate, skills: skills.split(',').map(s=>s.trim()).filter(Boolean), slots: slots.map(s => ({ day_of_week: DAYS.indexOf(s.day), start_time: s.start, end_time: s.end })) });
      const meRes = await authApi.me();
      updateUser(meRes.data);
      router.replace('/worker/dashboard');
    } catch (err: any) { setError(err.response?.data?.error || 'Setup failed. Try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white border-b border-gray-100"><div className="max-w-2xl mx-auto px-4 py-4"><h1 className="font-bold text-xl text-gray-900">Complete your worker profile</h1><p className="text-sm text-gray-500 mt-1">This is shown to customers before they book you</p></div></header>
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">About you</h2>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Service category</label>
            <select className="input" value={categoryId} onChange={e=>setCategoryId(e.target.value)} required>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Short bio</label><textarea className="input resize-none" rows={3} placeholder="Experienced plumber with 5 years in residential repairs…" value={bio} onChange={e=>setBio(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm text-gray-600 mb-1">Experience (years)</label><input type="number" min={0} max={50} className="input" value={exp} onChange={e=>setExp(Number(e.target.value))} /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Hourly rate (₹)</label><input type="number" min={100} max={5000} step={50} className="input" value={rate} onChange={e=>setRate(Number(e.target.value))} /></div>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Skills (comma separated)</label><input className="input" placeholder="Pipe fitting, drain cleaning" value={skills} onChange={e=>setSkills(e.target.value)} /></div>
        </div>
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Service area</h2>
          <div className="flex gap-2"><input className="input flex-1" placeholder="Pincode e.g. 201301" maxLength={6} value={pincode} onChange={e=>setPincode(e.target.value.replace(/\D/g,''))} onBlur={lookupPincode} /><button type="button" onClick={lookupPincode} className="btn-secondary px-4 text-sm">Lookup</button></div>
          {pincodeInfo && <p className="text-sm text-green-600 font-medium">✅ {pincodeInfo.locality}, {pincodeInfo.city}</p>}
        </div>
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900">Availability slots</h2><button type="button" onClick={() => setSlots([...slots,{day:'Wednesday',start:'09:00',end:'17:00'}])} className="text-sm text-blue-600 font-medium">+ Add slot</button></div>
          <div className="space-y-3">
            {slots.map((slot,i) => (
              <div key={i} className="flex gap-2 items-center">
                <select className="input flex-1 text-sm" value={slot.day} onChange={e=>{const s=[...slots];s[i].day=e.target.value;setSlots(s);}}>{DAYS.map(d=><option key={d}>{d}</option>)}</select>
                <select className="input w-24 text-sm" value={slot.start} onChange={e=>{const s=[...slots];s[i].start=e.target.value;setSlots(s);}}>{TIMES.map(t=><option key={t}>{t}</option>)}</select>
                <span className="text-gray-400">–</span>
                <select className="input w-24 text-sm" value={slot.end} onChange={e=>{const s=[...slots];s[i].end=e.target.value;setSlots(s);}}>{TIMES.map(t=><option key={t}>{t}</option>)}</select>
                <button type="button" onClick={()=>setSlots(slots.filter((_,idx)=>idx!==i))} className="text-red-400 hover:text-red-600 px-2 text-lg">×</button>
              </div>
            ))}
          </div>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3">{loading?'Saving…':'Save Profile & Go Live →'}</button>
      </form>
    </div>
  );
}
