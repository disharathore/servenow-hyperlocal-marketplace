'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { servicesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Filter, X } from 'lucide-react';
import Link from 'next/link';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { PageLoader } from '@/app/_components/LoadingStates';
import WorkerCard from '@/app/_components/WorkerCard';
import { motion, AnimatePresence } from 'framer-motion';

interface Worker {
  id: string;
  user_id: string;
  name: string;
  rating: number;
  rating_count: number;
  hourly_rate: number;
  total_jobs: number;
  category_name: string;
  is_background_verified: boolean;
  experience_years: number;
  is_available: boolean;
  distance_km?: number | null;
  locality?: string;
}

const SUBCATEGORY_MAP: Record<string, string[]> = {
  plumber: ['Leak repair', 'Tap fitting', 'Drain cleaning', 'Bathroom fittings'],
  electrician: ['Fan installation', 'Switch repair', 'Wiring', 'MCB fix'],
  tutor: ['Class 10', 'Class 12', 'JEE', 'NEET'],
  'ac-repair': ['Split AC', 'Window AC', 'Installation', 'Gas refill'],
  'home-cleaning': ['Kitchen deep clean', 'Bathroom clean', 'Sofa clean', 'Full home'],
};

export default function ServiceListingPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuthStore();
  const [category, setCategory] = useState<string>('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filteredWorkers, setFilteredWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Filter states
  const [filters, setFilters] = useState({
    minRating: 0,
    maxPrice: 10000,
    maxDistance: 30,
    verified: false,
    available: true
  });

  type Filters = typeof filters;

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role === 'worker') { router.push('/worker/dashboard'); return; }
    setCategory(String(params.category || ''));
  }, [user, params, router]);

  // Get user location
  useEffect(() => {
    if (!category) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationLoading(false);
        },
        () => {
          setLocationLoading(false);
          // Default to Mumbai if location denied
          setUserLocation({ lat: 19.0760, lng: 72.8777 });
        }
      );
    } else {
      setLocationLoading(false);
    }
  }, [category]);

  // Fetch workers
  useEffect(() => {
    if (!category || !userLocation) return;

    setError('');
    servicesApi.workers({ category, lat: userLocation.lat, lng: userLocation.lng })
      .then(r => {
        setWorkers(r.data);
        setLoading(false);
        applyFilters(r.data, filters);
      })
      .catch(() => {
        setLoading(false);
        setError('Unable to load workers right now. Please try again.');
      });
  }, [category, userLocation]);

  const retryFetch = () => {
    if (!category || !userLocation) return;
    setLoading(true);
    setError('');
    servicesApi.workers({ category, lat: userLocation.lat, lng: userLocation.lng })
      .then(r => {
        setWorkers(r.data);
        applyFilters(r.data, filters);
      })
      .catch(() => setError('Unable to load workers right now. Please try again.'))
      .finally(() => setLoading(false));
  };

  const applyFilters = (workersList: Worker[], currentFilters: Filters) => {
    const filtered = workersList.filter(w => 
      w.rating >= currentFilters.minRating &&
      w.hourly_rate <= currentFilters.maxPrice &&
      ((w.distance_km ?? 0) <= currentFilters.maxDistance || w.distance_km == null) &&
      (!currentFilters.verified || w.is_background_verified) &&
      (!currentFilters.available || w.is_available)
    );
    setFilteredWorkers(filtered);
  };

  const handleFilterChange = (key: keyof Filters, value: Filters[keyof Filters]) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    applyFilters(workers, updated);
  };

  if (loading || locationLoading) return <PageLoader />;

  return (
    <AppWrapperLayout>
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Link href="/" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-sm mb-4">
            ← Services
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 capitalize mb-2">{category}</h1>
          <p className="text-gray-600 text-sm">{filteredWorkers.length} verified professionals available</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(SUBCATEGORY_MAP[category] || ['General service', 'Quick visit', 'Premium support']).map((item) => (
              <span key={item} className="text-xs font-medium bg-white text-gray-700 border border-gray-200 px-2.5 py-1 rounded-full">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Sidebar */}
          <div className={`lg:block ${showFilters ? 'block' : 'hidden'}`}>
            <motion.div className="card p-4 sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Filter size={18} /> Filters
                </h3>
                <button
                  onClick={() => setShowFilters(false)}
                  className="lg:hidden text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                {/* Rating Filter */}
                <div>
                  <label className="text-sm font-medium text-gray-900 mb-2 block">Minimum Rating</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.5"
                      value={filters.minRating}
                      onChange={e => handleFilterChange('minRating', parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <span className="text-sm font-semibold text-blue-600 w-8">{filters.minRating.toFixed(1)}</span>
                  </div>
                </div>

                {/* Price Filter */}
                <div>
                  <label className="text-sm font-medium text-gray-900 mb-2 block">Max Hourly Rate</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="100"
                      max="10000"
                      step="100"
                      value={filters.maxPrice}
                      onChange={e => handleFilterChange('maxPrice', parseInt(e.target.value))}
                      className="w-full"
                    />
                    <span className="text-sm font-semibold text-blue-600 w-12">₹{filters.maxPrice}</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-900 mb-2 block">Max Distance (km)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="30"
                      step="1"
                      value={filters.maxDistance}
                      onChange={e => handleFilterChange('maxDistance', parseInt(e.target.value))}
                      className="w-full"
                    />
                    <span className="text-sm font-semibold text-blue-600 w-10">{filters.maxDistance}</span>
                  </div>
                </div>

                {/* Verified Filter */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.verified}
                    onChange={e => handleFilterChange('verified', e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-900">Verified only</span>
                </label>

                {/* Availability Filter */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.available}
                    onChange={e => handleFilterChange('available', e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-900">Available now</span>
                </label>

                <button
                  onClick={() => {
                    const cleared = { minRating: 0, maxPrice: 10000, maxDistance: 30, verified: false, available: true };
                    setFilters(cleared);
                    applyFilters(workers, cleared);
                  }}
                  className="w-full text-sm text-blue-600 font-medium hover:bg-blue-50 py-2 rounded transition-colors"
                >
                  Clear filters
                </button>
              </div>
            </motion.div>
          </div>

          {/* Members Grid */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <p className="text-sm text-gray-600">{filteredWorkers.length} results</p>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-blue-600 font-medium text-sm hover:bg-blue-50 px-3 py-2 rounded"
              >
                <Filter size={16} /> Filters
              </button>
            </div>

            {filteredWorkers.length === 0 ? (
              error ? (
                <div className="card p-8 text-center">
                  <p className="font-semibold text-gray-900">Failed to load workers</p>
                  <p className="text-sm text-gray-500 mt-1">{error}</p>
                  <button className="btn-primary mt-4" onClick={retryFetch}>Retry</button>
                </div>
              ) : (
              <div className="card p-8 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-semibold text-gray-900">No workers found</p>
                <p className="text-sm text-gray-500 mt-1">Try adjusting your filters or browse other categories</p>
                <Link href="/" className="inline-block mt-4 text-blue-600 font-medium hover:underline">
                  Browse all services
                </Link>
              </div>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AnimatePresence>
                  {filteredWorkers.map((worker, idx) => (
                    <motion.div
                      key={worker.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <WorkerCard
                        id={worker.id}
                        name={worker.name}
                        category={worker.category_name}
                        rating={worker.rating}
                        ratingCount={worker.rating_count}
                        hourlyRate={worker.hourly_rate}
                        totalJobs={worker.total_jobs}
                        distanceKm={worker.distance_km ?? null}
                        isVerified={worker.is_background_verified}
                        locality={worker.locality || 'Nearby'}
                        isAvailable={worker.is_available}
                        experienceYears={worker.experience_years}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
