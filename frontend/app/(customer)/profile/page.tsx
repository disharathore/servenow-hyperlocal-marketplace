'use client';
import { useState } from 'react';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { toast } from 'sonner';

async function isValidIndianPincode(pin: string) {
  if (!/^\d{6}$/.test(pin)) return false;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await res.json();
    return data?.[0]?.Status === 'Success';
  } catch {
    return false;
  }
}

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [pincode, setPincode] = useState(user?.pincode || '');
  const [loading, setLoading] = useState(false);

  async function onSave() {
    const normalizedPin = pincode.trim();
    if (normalizedPin && !/^\d{6}$/.test(normalizedPin)) {
      toast.error('Pincode must be 6 digits');
      return;
    }

    setLoading(true);
    try {
      if (normalizedPin) {
        const valid = await isValidIndianPincode(normalizedPin);
        if (!valid) {
          toast.error('Enter a valid Indian pincode');
          setLoading(false);
          return;
        }
      }

      const r = await authApi.updateProfile({ name, pincode: normalizedPin });
      updateUser(r.data);
      toast.success('Profile updated');
    } catch {
      toast.error('Could not update profile');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppWrapperLayout>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="card p-6 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Phone</label>
            <input className="input bg-gray-50" value={user?.phone || ''} disabled />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Pincode</label>
            <input className="input" maxLength={6} value={pincode || ''} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <button className="btn-primary" onClick={onSave} disabled={loading}>{loading ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
