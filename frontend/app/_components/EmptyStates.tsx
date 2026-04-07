'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16 px-4">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">{description}</p>
      {action && (
        <Link href={action.href} className="btn-primary inline-block">
          {action.label}
        </Link>
      )}
    </motion.div>
  );
}

export const EMPTY_STATES = {
  NO_BOOKINGS: { icon: '📋', title: 'No bookings yet', description: 'Start by browsing services near you' },
  NO_JOBS: { icon: '⏳', title: 'No pending jobs', description: 'Stay online to receive service requests' },
  NO_REVIEWS: { icon: '⭐', title: 'No reviews yet', description: 'Complete your first service to get reviews' },
  NO_RESULTS: { icon: '🔍', title: 'No results found', description: 'Try adjusting your filters or search terms' },
  NO_WORKERS: { icon: '👥', title: 'No workers available', description: 'Check back soon for more options' },
  NO_EARNINGS: { icon: '💰', title: 'No earnings yet', description: 'Complete jobs to start earning' },
};
