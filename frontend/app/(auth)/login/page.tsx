'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const [step, setStep] = useState<'phone'|'otp'|'role'|'profile'>('phone');
  const [phone, setPhone] = useState(''); const [otp, setOtp] = useState('');
  const [name, setName] = useState(''); const [role, setRole] = useState<'customer'|'worker'>('customer');
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [tempToken, setTempToken] = useState('');

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (phone.length !== 10) return setError('Enter valid 10-digit number');
    setError(''); setLoading(true);
    try { await authApi.sendOtp(phone); setStep('otp'); }
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
      const { token, user } = res.data;
      setTempToken(token);
      localStorage.setItem('sn_token', token);
      setName(user.name || '');
      setRole(user.role === 'worker' ? 'worker' : 'customer');
      setStep('role');
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
      await authApi.updateProfile({ role });
      const meRes = await authApi.me();
      setName(meRes.data?.name || '');
      setPincode(meRes.data?.pincode || '');
      setStep('profile');
    } catch {
      setError('Could not set your role. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter your name');
    if (pincode.length !== 6) return setError('Please enter a valid 6-digit pincode');
    setError(''); setLoading(true);
    try {
      await authApi.updateProfile({ name, role, pincode });
      const meRes = await authApi.me();
      setAuth(meRes.data, tempToken);
      router.push(role === 'worker' && !meRes.data.worker_profile_id ? '/worker/setup' : role === 'worker' ? '/worker/dashboard' : '/');
    } catch { setError('Setup failed. Try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4"><span className="text-white text-2xl">⚡</span></div>
          <h1 className="text-2xl font-bold text-gray-900">ServeNow</h1>
          <p className="text-gray-500 text-sm mt-1">Local services, instantly booked</p>
        </div>
        <div className="card p-6">
          {step === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone number</label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium">🇮🇳 +91</span>
                  <input className="input flex-1" type="tel" placeholder="9876543210" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,''))} autoFocus />
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Sending…' : 'Get OTP'}</button>
            </form>
          )}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OTP sent to +91 {phone}</label>
                <input className="input tracking-[0.5em] text-center text-xl font-bold" type="text" placeholder="● ● ● ● ● ●" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} autoFocus />
                <p className="text-xs text-gray-400 mt-1">Dev mode OTP: <strong>123456</strong></p>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify OTP'}</button>
              <button type="button" className="btn-ghost w-full text-sm" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>← Change number</button>
            </form>
          )}
          {step === 'role' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Continue as</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['customer','worker'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setRole(r)} className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${role===r ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                      {r === 'customer' ? '🙋 Customer' : '🔧 Worker'}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button className="btn-primary w-full" type="button" onClick={handleRoleContinue} disabled={loading}>{loading ? 'Saving…' : 'Continue →'}</button>
            </div>
          )}
          {step === 'profile' && (
            <form onSubmit={handleProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
                <input className="input" placeholder="Rahul Sharma" value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pincode</label>
                <input className="input" placeholder="201301" maxLength={6} value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g,''))} />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Setting up…' : 'Finish Setup →'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
