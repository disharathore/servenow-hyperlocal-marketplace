'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowRight, BriefcaseBusiness, CheckCircle2, ShieldCheck, Sparkles, UserRound, Wrench, Zap, BookOpen } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const [step, setStep] = useState<'phone'|'otp'|'role'|'profile'>('phone');
  const [phone, setPhone] = useState(''); const [otp, setOtp] = useState('');
  const [name, setName] = useState(''); const [role, setRole] = useState<'customer'|'worker'>('customer');
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [tempRefreshToken, setTempRefreshToken] = useState('');
  const [liveBookings, setLiveBookings] = useState(1284);
  const [demoOtp, setDemoOtp] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => {
      setLiveBookings((prev) => {
        const delta = Math.random() < 0.75 ? 1 : 2;
        const next = prev + delta;
        return next > 9999 ? 1200 : next;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, []);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (phone.length !== 10) return setError('Enter valid 10-digit number');
    setError(''); setLoading(true);
    try {
      const res = await authApi.sendOtp(phone);
      const code = res.data?.dev_otp as string | undefined;
      setDemoOtp(code || '');
      if (code) {
        setOtp(code);
        toast.info(`Demo OTP: ${code}`);
      }
      setStep('otp');
      toast.success('OTP sent successfully');
    }
    catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        setError('Server not reachable. Start backend and try again.');
      } else {
        setError((axios.isAxiosError(err) && err.response?.data?.error) || 'Failed to send OTP. Try again.');
      }
    }
    finally { setLoading(false); }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return setError('Enter 6-digit OTP');
    setError(''); setLoading(true);
    try {
      const res = await authApi.verifyOtp(phone, otp);
      const { token, refresh_token, user } = res.data;
      setTempToken(token);
      setTempRefreshToken(refresh_token);
      localStorage.setItem('sn_token', token);
      localStorage.setItem('sn_refresh_token', refresh_token);
      setName(user.name || '');
      setRole(user.role === 'worker' ? 'worker' : 'customer');
      setStep('role');
      toast.success('Phone verified');
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        setError('Server not reachable. Start backend and try again.');
      } else {
        setError((axios.isAxiosError(err) && err.response?.data?.error) || 'Incorrect OTP. Try again.');
      }
    }
    finally { setLoading(false); }
  }

  async function handleRoleContinue() {
    setError('');
    setLoading(true);
    try {
      if (!tempToken || !tempRefreshToken) {
        setError('Session expired. Please verify OTP again.');
        setStep('otp');
        return;
      }
      await authApi.updateProfile({ role });
      const meRes = await authApi.me();
      const meData = meRes.data;

      if (meData.name && meData.pincode) {
        setAuth(meData, tempToken, tempRefreshToken);
        toast.success('Welcome back');
        router.push(role === 'worker' && !meData.worker_profile_id
          ? '/worker/setup'
          : role === 'worker'
            ? '/worker/dashboard'
            : '/');
        return;
      }

      setName(meData.name || '');
      setPincode(meData.pincode || '');
      setStep('profile');
    } catch {
      setError('Could not set your role. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(demoType: 'customer' | 'worker') {
    setError('');
    setLoading(true);
    try {
      const res = await authApi.demoLogin(demoType);
      const { token, refresh_token, user } = res.data;
      setAuth(user, token, refresh_token);
      toast.success(`🎭 Welcome to Demo Mode (${demoType})`);
      router.push(demoType === 'worker' ? '/worker/dashboard' : '/');
    } catch (err) {
      setError('Failed to start demo. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    if (pincode.length !== 6) return setError('Please enter a valid 6-digit pincode');
    setError(''); setLoading(true);
    try {
      if (!tempToken || !tempRefreshToken) {
        setError('Session expired. Please verify OTP again.');
        setStep('otp');
        return;
      }
      await authApi.updateProfile({ name, role, pincode });
      const meRes = await authApi.me();
      setAuth(meRes.data, tempToken, tempRefreshToken);
      toast.success('Profile setup complete');
      router.push(role === 'worker' && !meRes.data.worker_profile_id ? '/worker/setup' : role === 'worker' ? '/worker/dashboard' : '/');
    } catch { setError('Setup failed. Try again.'); }
    finally { setLoading(false); }
  }

  const stepTitle = step === 'phone'
    ? 'Welcome to ServeNow'
    : step === 'otp'
      ? 'Verify Your Number'
      : step === 'role'
        ? 'Choose Your Mode'
        : 'Finish Your Profile';

  const stepSubtitle = step === 'phone'
    ? 'Login or try demo'
    : step === 'otp'
      ? `Code sent to +91 ${phone}`
      : step === 'role'
        ? 'Select how you want to continue'
        : 'One last step to personalize your account';

  function scrollToLoginCard() {
    const card = document.getElementById('login-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#eef4ff_0%,#f8fbff_45%,#f3f6fb_100%)] animate-page-load-smooth">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-600 text-white px-8 py-12 md:px-12 lg:px-16 flex items-center">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/15 blur-3xl animate-blob-slow" />
          <div className="absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-indigo-900/20 blur-3xl animate-blob-slower" />
          <div className="absolute top-1/3 right-12 h-36 w-36 rounded-full bg-white/10 blur-2xl animate-blob-slow" />
          <div className="absolute bottom-10 left-8 h-24 w-24 rounded-full bg-violet-200/20 blur-xl animate-blob-slower" />
          <div className="absolute inset-0 pointer-events-none">
            {[
              { left: '8%', top: '14%', delay: '0s' },
              { left: '20%', top: '28%', delay: '0.6s' },
              { left: '34%', top: '42%', delay: '1.2s' },
              { left: '58%', top: '18%', delay: '0.9s' },
              { left: '72%', top: '34%', delay: '1.8s' },
              { left: '86%', top: '24%', delay: '0.3s' },
              { left: '14%', top: '64%', delay: '1.1s' },
              { left: '40%', top: '72%', delay: '1.5s' },
              { left: '66%', top: '62%', delay: '0.7s' },
              { left: '82%', top: '74%', delay: '2.1s' },
            ].map((dot, idx) => (
              <span
                key={idx}
                className="particle-dot"
                style={{ left: dot.left, top: dot.top, animationDelay: dot.delay }}
              />
            ))}
          </div>

          <div className="relative z-10 w-full max-w-lg mx-auto md:mx-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm border border-white/25">
              <Sparkles size={16} /> Trusted Home Services Platform
            </p>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut', delay: 0.08 }}
              className="mt-6 text-[2.65rem] md:text-[3.45rem] leading-[1.02] font-bold text-white tracking-tight"
            >
              Book <span className="bg-gradient-to-r from-cyan-100 via-white to-blue-100 bg-clip-text text-transparent">Trusted</span> Local Services <span className="bg-gradient-to-r from-violet-100 via-white to-blue-100 bg-clip-text text-transparent">Instantly</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.18 }}
              className="mt-3 text-base md:text-lg font-semibold text-amber-200"
            >
              🔥 {liveBookings.toLocaleString('en-IN')} bookings happening right now
            </motion.p>
            <div className="mt-4 h-7 overflow-hidden">
              <p className="typing-subtitle text-base md:text-lg text-blue-50/95 whitespace-nowrap">
                Plumbers, Electricians, Tutors...
              </p>
            </div>
            <button
              type="button"
              onClick={scrollToLoginCard}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/15 border border-white/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/25 hover:scale-105 transition-all duration-200"
            >
              <ArrowRight size={15} /> Get Started
            </button>

            <ul className="mt-8 space-y-3 text-sm md:text-base">
              <li className="flex items-center gap-3"><span className="text-lg">✔</span><span>Real-time booking</span></li>
              <li className="flex items-center gap-3"><span className="text-lg">✔</span><span>Live tracking</span></li>
              <li className="flex items-center gap-3"><span className="text-lg">✔</span><span>Secure payments</span></li>
            </ul>

            <div className="mt-12 rounded-2xl bg-white/10 backdrop-blur-lg border border-white/25 p-6">
              <div className="flex items-center justify-between gap-4">
                {[
                  { icon: Wrench, label: 'Home Repair' },
                  { icon: Zap, label: 'Electrical' },
                  { icon: BookOpen, label: 'Tutoring' },
                ].map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, delay: 0.06 * index }}
                      whileHover={{ y: -4, scale: 1.05 }}
                      className="flex flex-col items-center text-center flex-1 rounded-xl bg-white/15 border border-white/20 p-4 transition-all duration-200 hover:bg-white/25 hover:scale-105 hover:shadow-xl"
                    >
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/15">
                        <Icon size={22} className="text-white" />
                      </span>
                      <span className="text-sm font-semibold mt-3 text-white">{item.label}</span>
                    </motion.div>
                  );
                })}
              </div>
              <p className="text-sm text-white mt-5">Fast onboarding for reliable neighborhood professionals.</p>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-xl">
                <p className="text-xs text-blue-100/90">Trusted by 1000+ users</p>
                <p className="mt-1 text-lg font-semibold">⭐⭐⭐⭐⭐</p>
                <p className="text-xs text-blue-100/90 mt-1">Top-rated local service platform</p>
              </div>
              <div className="rounded-2xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:shadow-xl">
                <p className="text-xs text-blue-100/90">Today&apos;s momentum</p>
                <p className="mt-1 text-lg font-semibold">500+ bookings completed today</p>
                <p className="text-xs text-blue-100/90 mt-1">Fast, reliable, and verified professionals</p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative px-5 py-10 md:px-8 md:py-12 lg:px-12 flex items-center justify-center bg-gradient-to-br from-gray-50 to-white">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20px 20px, rgba(14,116,255,0.06) 1px, transparent 0)', backgroundSize: '34px 34px' }} />
          <motion.div
            id="login-card"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            whileHover={{ y: -2 }}
            className="relative z-10 w-full max-w-[400px] rounded-2xl bg-[#ffffff] shadow-2xl border border-gray-100 p-10"
            style={{ boxShadow: '0 32px 72px rgba(15,23,42,0.18), 0 12px 34px rgba(37,99,235,0.22)' }}
          >
            <div className="text-center mb-7">
              <div className="relative mx-auto mb-4 inline-flex h-18 w-18 items-center justify-center">
                <span className="absolute inset-0 rounded-2xl bg-blue-400/35 blur-xl" />
                <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">
                  <span className="text-white text-3xl">⚡</span>
                </span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">{stepTitle}</h2>
              <p className="text-sm text-slate-500 mt-1">{stepSubtitle}</p>
            </div>

            {step === 'phone' && (
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Phone number</label>
                  <div className="flex items-center gap-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-2 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 transition-all">
                    <span className="inline-flex flex-shrink-0 items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 border border-slate-200">🇮🇳 +91</span>
                    <input
                      className="w-full min-w-0 bg-transparent px-2 py-2 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-lg"
                      type="tel"
                      placeholder="9876543210"
                      maxLength={10}
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g,''))}
                      autoFocus
                    />
                  </div>
                </div>

                {error && <p className="text-red-600 text-sm">{error}</p>}

                <button
                  className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 shadow-md shadow-blue-200 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-blue-300/60 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Sending…' : <><CheckCircle2 size={16} /> Get OTP</>}
                </button>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                  <div className="relative flex justify-center text-sm"><span className="px-3 bg-white text-slate-400">or continue with demo</span></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('customer')}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-orange-100 bg-orange-50 hover:bg-orange-100 text-orange-600 text-sm font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60"
                  >
                    <UserRound size={16} /> Demo Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('worker')}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-sm font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60"
                  >
                    <BriefcaseBusiness size={16} /> Demo Worker
                  </button>
                </div>
              </form>
            )}

            {step === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Enter OTP</label>
                  <input className="input tracking-[0.45em] text-center text-xl font-bold focus:ring-blue-200" type="text" placeholder="● ● ● ● ● ●" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} autoFocus />
                  <p className="text-xs text-slate-400 mt-2">Demo OTP: <strong>123456</strong></p>
                  {demoOtp && (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                      Demo build code: <span className="font-bold tracking-[0.2em]">{demoOtp}</span>
                    </p>
                  )}
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 shadow-md shadow-blue-200 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-blue-300/60 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] disabled:opacity-60 inline-flex items-center justify-center gap-2" type="submit" disabled={loading}>{loading ? 'Verifying…' : <><CheckCircle2 size={16} /> Verify OTP</>}</button>
                <button type="button" className="w-full rounded-lg border border-slate-200 text-slate-600 py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>Change number</button>
              </form>
            )}

            {step === 'role' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  {(['customer','worker'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setRole(r)} className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${role===r ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {r === 'customer' ? '🙋 Customer' : '🔧 Worker'}
                    </button>
                  ))}
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 shadow-md shadow-blue-200 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-blue-300/60 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] disabled:opacity-60 inline-flex items-center justify-center gap-2" type="button" onClick={handleRoleContinue} disabled={loading}>{loading ? 'Saving…' : <><ArrowRight size={16} /> Continue</>}</button>
              </div>
            )}

            {step === 'profile' && (
              <form onSubmit={handleProfile} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your name</label>
                  <input className="input focus:ring-blue-200" placeholder="Rahul Sharma" value={name} onChange={e => setName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Pincode</label>
                  <input className="input focus:ring-blue-200" placeholder="201301" maxLength={6} value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g,''))} />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 shadow-md shadow-blue-200 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-blue-300/60 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] disabled:opacity-60 inline-flex items-center justify-center gap-2" type="submit" disabled={loading}>{loading ? 'Setting up…' : <><ArrowRight size={16} /> Finish Setup</>}</button>
              </form>
            )}

            <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500 flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-600" />
              Your login is secured with OTP verification and protected session tokens.
            </div>

            <p className="text-center text-xs text-slate-400 mt-4">Built for real-world service marketplaces</p>
          </motion.div>
          </section>
      </div>
    </div>
  );
}
