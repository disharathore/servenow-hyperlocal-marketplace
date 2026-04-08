'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { servicesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Search, MapPin } from 'lucide-react';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { SkeletonGrid } from '@/app/_components/LoadingStates';
import { toast } from 'sonner';
import WorkerCard from '@/app/_components/WorkerCard';

type CategoryChip = 'all' | 'plumber' | 'electrician' | 'tutor';

interface WorkerItem {
  id: string;
  name: string;
  avatar_url?: string | null;
  category_name: string;
  category_slug: string;
  rating?: number;
  rating_count?: number;
  hourly_rate: number;
  total_jobs?: number;
  is_background_verified?: boolean;
  is_available?: boolean;
  experience_years?: number;
  distance_km?: number | null;
  locality?: string | null;
}

const categoryChips: Array<{ slug: CategoryChip; label: string; icon: string }> = [
  { slug: 'all', label: 'All', icon: '✨' },
  { slug: 'plumber', label: 'Plumber', icon: '🔧' },
  { slug: 'electrician', label: 'Electrician', icon: '⚡' },
  { slug: 'tutor', label: 'Tutor', icon: '📚' },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryChip>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role === 'worker') { router.push('/worker/dashboard'); return; }

    setLoading(true);
    servicesApi.workers({
      category: activeCategory === 'all' ? undefined : activeCategory,
      search: search.trim() || undefined,
      location: user.locality || user.city || undefined,
    })
      .then((r) => {
        setWorkers(r.data as WorkerItem[]);
      })
      .catch(() => {
        toast.error('Unable to load workers right now.');
      })
      .finally(() => setLoading(false));
  }, [user, router, activeCategory, search]);

  const filteredWorkers = workers.filter((w) =>
    [w.name, w.category_name, w.locality || ''].join(' ').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppWrapperLayout>
      <div className="max-w-6xl mx-auto px-4 pt-5 pb-3">
        <div className="mb-4">
          <p className="text-gray-500 text-sm mb-1">Welcome back, {user?.name?.split(' ')[0] || 'there'}</p>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Find your local expert</h1>
          <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
            <MapPin size={13} /> {user?.locality || user?.city || 'Set service location'}
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-20 bg-[var(--surface)]/95 backdrop-blur border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-11"
              placeholder="Search workers, services, location"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {categoryChips.map((chip) => (
            <button
              key={chip.slug}
              onClick={() => setActiveCategory(chip.slug)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                activeCategory === chip.slug
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="mr-1">{chip.icon}</span>{chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Available Workers</h2>
          </div>

          {loading ? (
            <SkeletonGrid count={6} />
          ) : filteredWorkers.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium">No workers found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWorkers.map((worker) => (
                <WorkerCard
                  id={worker.id}
                  name={worker.name}
                  category={worker.category_name}
                  avatarUrl={worker.avatar_url}
                  rating={worker.rating ?? 0}
                  ratingCount={worker.rating_count ?? 0}
                  hourlyRate={worker.hourly_rate}
                  totalJobs={worker.total_jobs ?? 0}
                  distanceKm={worker.distance_km ?? null}
                  isVerified={worker.is_background_verified ?? false}
                  locality={worker.locality || 'Nearby'}
                  isAvailable={worker.is_available ?? true}
                  experienceYears={worker.experience_years ?? 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: '✅', label: 'Verified workers', desc: 'Background checked professionals' },
            { icon: '🔒', label: 'Secure payments', desc: 'Safe checkout and support' },
            { icon: '📍', label: 'Live tracking', desc: 'Track worker movement in real time' },
          ].map((b) => (
            <div key={b.label} className="rounded-xl shadow-md p-4 bg-white border border-gray-100 text-center">
              <div className="text-2xl mb-2">{b.icon}</div>
              <p className="font-semibold text-gray-900 text-sm">{b.label}</p>
              <p className="text-gray-500 text-xs mt-1">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </AppWrapperLayout>
  );
}
