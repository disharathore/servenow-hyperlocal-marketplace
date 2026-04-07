'use client';
import { useEffect, useState } from 'react';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { toast } from 'sonner';

const SETTINGS_KEY = 'sn_settings';

type LocalSettings = {
  notifications: boolean;
  locationShare: boolean;
};

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [locationShare, setLocationShare] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as LocalSettings;
      setNotifications(Boolean(saved.notifications));
      setLocationShare(Boolean(saved.locationShare));
    } catch {
      localStorage.removeItem(SETTINGS_KEY);
    }
  }, []);

  const saveSettings = () => {
    const next: LocalSettings = { notifications, locationShare };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    toast.success('Settings saved');
  };

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
          <button className="btn-primary" onClick={saveSettings}>Save Settings</button>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
