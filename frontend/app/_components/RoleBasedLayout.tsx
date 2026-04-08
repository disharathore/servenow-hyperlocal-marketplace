'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';
import { connectSocket } from '@/lib/socket';
import { DemoModeBanner } from './DemoModeBanner';
import { AnimatePresence, motion } from 'framer-motion';

interface RoleBasedLayoutProps { children: React.ReactNode; }

export default function RoleBasedLayout({ children }: RoleBasedLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (!hydrated) return;
    
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
  }, [user, token, pathname, hydrated, router]);

  useEffect(() => {
    if (!hydrated || !user || !token) return;
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
  }, [hydrated, user, token]);

  return (
    <>
      <DemoModeBanner />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
