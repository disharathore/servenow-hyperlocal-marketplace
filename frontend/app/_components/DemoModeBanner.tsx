/**
 * Demo Mode Banner
 * Shows at top when user is in demo mode
 */

import { AlertCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/lib/store';

export function DemoModeBanner() {
  const { isDemoMode } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);

  if (!isDemoMode || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-400 to-orange-400 text-white px-4 py-3 flex items-center justify-between shadow-lg">
      <div className="max-w-6xl mx-auto flex items-center gap-3 flex-1">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <div>
          <p className="font-bold">🎭 You're in Demo Mode</p>
          <p className="text-sm opacity-90">This is a demo account. Data is reset periodically.</p>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 text-white hover:bg-white/20 p-1 rounded transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
