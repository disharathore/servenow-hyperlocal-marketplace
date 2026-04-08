'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { authApi, servicesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { motion } from 'framer-motion';
import { ArrowRight, BriefcaseBusiness, Clock3, MapPin, ShieldCheck, Sparkles } from 'lucide-react';

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
    if (pincode && pincode.length !== 6) return setError('Pincode must be 6 digits');
    if (slots.length === 0) return setError('Add at least one slot');
    for (const slot of slots) {
      if (slot.start >= slot.end) {
        setError(`Invalid slot: ${slot.day} end time must be after start time`);
        return;
      }
    }
    setError(''); setLoading(true);
    try {
      if (pincode) {
        try {
          await api.patch('/auth/profile', { pincode });
        } catch {
          // Profile enrichment should not block worker activation.
        }
      }
      await api.post('/workers/setup', { bio, category_id: categoryId, experience_years: exp, hourly_rate: rate, skills: skills.split(',').map(s=>s.trim()).filter(Boolean), slots: slots.map(s => ({ day_of_week: DAYS.indexOf(s.day), start_time: s.start, end_time: s.end })) });
      const meRes = await authApi.me();
      updateUser(meRes.data);
      router.replace('/worker/dashboard');
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED') {
        setError('Server timeout while saving setup. Please try again.');
      } else if (!err?.response) {
        setError('Cannot reach server. Ensure backend is running on port 4000.');
      } else {
        setError(err.response?.data?.error || 'Setup failed. Try again.');
      }
    }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,#e8f0ff_0%,#f5f8ff_35%,#f2f6fb_100%)] pb-10">
      <div className="max-w-5xl mx-auto px-4 pt-8 md:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 md:gap-8">
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35 }}
            className="lg:col-span-2"
          >
            <div className="rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-600 text-white p-6 md:p-7 shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.24) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
              <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
              <div className="absolute -left-12 -bottom-16 h-44 w-44 rounded-full bg-black/20 blur-2xl" />
              <div className="relative z-10">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold border border-white/30">
                  <Sparkles size={14} /> Worker Onboarding
                </p>
                <h1 className="mt-4 text-2xl md:text-3xl font-bold leading-tight">Complete your worker profile</h1>
                <p className="mt-2 text-sm text-blue-50/95">This profile is shown to customers before they book you.</p>

                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-center gap-2"><ShieldCheck size={16} /> Verified professional trust badge</li>
                  <li className="flex items-center gap-2"><MapPin size={16} /> Local service area matching</li>
                  <li className="flex items-center gap-2"><Clock3 size={16} /> Availability-based auto booking</li>
                </ul>

                <div className="mt-6 rounded-2xl border border-white/25 bg-white/10 p-3 backdrop-blur-sm">
                  <svg viewBox="0 0 360 140" className="w-full h-auto" aria-hidden="true">
                    <rect x="6" y="54" width="348" height="76" rx="14" fill="rgba(255,255,255,0.2)" />
                    <circle cx="70" cy="52" r="26" fill="rgba(255,255,255,0.88)" />
                    <circle cx="180" cy="52" r="26" fill="rgba(255,255,255,0.88)" />
                    <circle cx="290" cy="52" r="26" fill="rgba(255,255,255,0.88)" />
                    <path d="M58 52h24" stroke="#1e3a8a" strokeWidth="6" strokeLinecap="round" />
                    <path d="M172 50l10 12 18-22" stroke="#1e3a8a" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="280" y="42" width="20" height="20" rx="4" stroke="#1e3a8a" strokeWidth="5" fill="none" />
                    <rect x="48" y="92" width="44" height="9" rx="4.5" fill="rgba(255,255,255,0.82)" />
                    <rect x="157" y="92" width="46" height="9" rx="4.5" fill="rgba(255,255,255,0.82)" />
                    <rect x="267" y="92" width="46" height="9" rx="4.5" fill="rgba(255,255,255,0.82)" />
                  </svg>
                </div>
              </div>
            </div>
          </motion.aside>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            onSubmit={handleSubmit}
            className="lg:col-span-3 space-y-6"
          >
            <div className="rounded-2xl bg-white/95 backdrop-blur border border-blue-100 shadow-xl p-5 md:p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><BriefcaseBusiness size={18} /> About you</h2>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Service category</label>
                <select className="input" value={categoryId} onChange={e=>setCategoryId(e.target.value)} required>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Short bio</label>
                <textarea className="input min-h-[96px] resize-none" rows={3} placeholder="Experienced professional with reliable, on-time service..." value={bio} onChange={e=>setBio(e.target.value)} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-slate-600 mb-1.5">Experience (years)</label><input type="number" min={0} max={50} className="input" value={exp} onChange={e=>setExp(Number(e.target.value))} /></div>
                <div><label className="block text-sm font-medium text-slate-600 mb-1.5">Hourly rate (₹)</label><input type="number" min={100} max={5000} step={50} className="input" value={rate} onChange={e=>setRate(Number(e.target.value))} /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-600 mb-1.5">Skills (comma separated)</label><input className="input" placeholder="Pipe fitting, drain cleaning" value={skills} onChange={e=>setSkills(e.target.value)} /></div>
            </div>

            <div className="rounded-2xl bg-white/95 backdrop-blur border border-blue-100 shadow-xl p-5 md:p-6 space-y-3">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><MapPin size={18} /> Service area</h2>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Pincode e.g. 201301" maxLength={6} value={pincode} onChange={e=>setPincode(e.target.value.replace(/\D/g,''))} onBlur={lookupPincode} />
                <button type="button" onClick={lookupPincode} className="btn-secondary px-4 text-sm">Lookup</button>
              </div>
              {pincodeInfo && <p className="text-sm text-emerald-700 font-medium">✅ {pincodeInfo.locality}, {pincodeInfo.city}</p>}
            </div>

            <div className="rounded-2xl bg-white/95 backdrop-blur border border-blue-100 shadow-xl p-5 md:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Clock3 size={18} /> Availability slots</h2>
                <button type="button" onClick={() => setSlots([...slots,{day:'Wednesday',start:'09:00',end:'17:00'}])} className="text-sm text-blue-600 font-semibold hover:text-blue-700">+ Add slot</button>
              </div>
              <div className="space-y-3">
                {slots.map((slot,i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                    <select className="input text-sm" value={slot.day} onChange={e=>{const s=[...slots];s[i].day=e.target.value;setSlots(s);}}>{DAYS.map(d=><option key={d}>{d}</option>)}</select>
                    <select className="input w-24 text-sm" value={slot.start} onChange={e=>{const s=[...slots];s[i].start=e.target.value;setSlots(s);}}>{TIMES.map(t=><option key={t}>{t}</option>)}</select>
                    <select className="input w-24 text-sm" value={slot.end} onChange={e=>{const s=[...slots];s[i].end=e.target.value;setSlots(s);}}>{TIMES.map(t=><option key={t}>{t}</option>)}</select>
                    <button type="button" onClick={()=>setSlots(slots.filter((_,idx)=>idx!==i))} className="text-red-500 hover:text-red-600 px-2 text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}

            <button type="submit" disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3.5 shadow-lg shadow-blue-200 transition-transform duration-200 hover:scale-105 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2">{loading?'Saving…':<><ArrowRight size={16} /> Save Profile & Go Live</>}</button>
          </motion.form>
        </div>
      </div>
    </div>
  );
}
