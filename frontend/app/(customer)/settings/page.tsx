'use client';
import { useState } from 'react';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [locationShare, setLocationShare] = useState(true);

  return (
    <AppWrapperLayout>
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="card p-6 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <label className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
            <span className="text-sm font-medium text-gray-700">Push notifications</span>
            <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          </label>
          <label className="flex items-center justify-between border border-gray-100 rounded-xl p-3">
            <span className="text-sm font-medium text-gray-700">Share live location during active jobs</span>
            <input type="checkbox" checked={locationShare} onChange={(e) => setLocationShare(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          </label>
          <button className="btn-primary" onClick={() => toast.success('Settings saved')}>Save Settings</button>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
