'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { Toaster } from 'sonner';
import { toast } from 'sonner';
import { Flame } from 'lucide-react';
import { connectSocket } from '@/lib/socket';

interface RoleBasedLayoutProps { children: React.ReactNode; }

export default function RoleBasedLayout({ children }: RoleBasedLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    
    // Route protection logic
    const isAuthPage = pathname?.startsWith('/login');
    const needsAuth = !isAuthPage;
    
    if (needsAuth && !user && !token) {
      router.push('/login');
      return;
    }

    // Role-based routing
    if (user && !isAuthPage) {
      const onWorkerRoute = pathname?.startsWith('/worker');
      const onAdminRoute = pathname?.startsWith('/admin');
      if (user.role === 'worker' && onAdminRoute) router.push('/worker/dashboard');
      if (user.role === 'customer' && (onWorkerRoute || onAdminRoute)) router.push('/');
      if (user.role === 'admin' && !onAdminRoute) router.push('/admin');
    }
  }, [user, token, pathname, mounted, router]);

  useEffect(() => {
    if (!mounted || !user || !token) return;
    const socket = connectSocket();

    socket.on('new_booking', (payload: { category?: string; amount?: number }) => {
      toast.success('New job request', {
        description: `${payload?.category || 'Service'} • ₹${Math.floor((payload?.amount || 0) / 100)}`,
      });
    });
    socket.on('payment_confirmed', () => {
      toast.success('Payment confirmed', { description: 'Customer payment received successfully.' });
    });
    socket.on('booking_accepted', () => {
      toast.success('Worker accepted your booking');
    });
    socket.on('booking_rejected', (payload: { reason?: string }) => {
      toast.error('Booking was rejected', { description: payload?.reason || 'Please book another worker.' });
    });
    socket.on('job_started', () => {
      toast.success('Job started', { description: 'Your worker is now at your location.' });
    });
    socket.on('job_completed', () => {
      toast.success('Job completed', { description: 'Please rate your service experience.' });
    });

    return () => {
      socket.off('new_booking');
      socket.off('payment_confirmed');
      socket.off('booking_accepted');
      socket.off('booking_rejected');
      socket.off('job_started');
      socket.off('job_completed');
    };
  }, [mounted, user, token]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="flex flex-col items-center gap-3">
          <Flame size={40} className="text-blue-600 animate-bounce" />
          <p className="text-gray-600 font-medium">Loading ServeNow…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <Toaster position="top-center" richColors />
    </>
  );
}
