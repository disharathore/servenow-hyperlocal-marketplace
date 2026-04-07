'use client';
import { useState } from 'react';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [pincode, setPincode] = useState(user?.pincode || '');
  const [loading, setLoading] = useState(false);

  async function onSave() {
    setLoading(true);
    try {
      const r = await authApi.updateProfile({ name, pincode });
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
