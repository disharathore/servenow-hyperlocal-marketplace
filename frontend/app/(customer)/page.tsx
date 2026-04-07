'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { servicesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Search, ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { SkeletonGrid } from '@/app/_components/LoadingStates';
import { motion } from 'framer-motion';

interface Category { id: string; slug: string; name: string; icon: string; description: string; base_price: number; }

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role === 'worker') { router.push('/worker/dashboard'); return; }
    
    servicesApi.categories()
      .then(r => { setCategories(r.data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [user, router]);

  const filtered = categories.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppWrapperLayout>
      <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
          <div className="mb-6">
            <p className="text-blue-100 text-sm mb-1">Welcome back, {user?.name?.split(' ')[0] || 'there'} 👋</p>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">What service do you need?</h1>
            <button className="inline-flex items-center gap-1 text-xs bg-white/20 px-3 py-1.5 rounded-full hover:bg-white/30 transition-colors">
              <MapPin size={14} /> {user?.locality || user?.city || 'Set service location'}
            </button>
          </div>
          
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              className="w-full pl-12 pr-4 py-3 rounded-xl text-gray-900 bg-white/95 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-sm"
              placeholder="plumber, electrician, tutor, painter…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="mt-6 flex gap-2 flex-wrap">
            {['plumber', 'electrician', 'tutor', 'painter'].map(tag => (
              <button
                key={tag}
                onClick={() => setSearch(tag)}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/20 text-white hover:bg-white/30 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div>
          <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold text-gray-900">All Services</h2></div>
          
          {loading ? (
            <SkeletonGrid count={8} />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium">No services found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((cat, idx) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Link href={`/services/${cat.slug}`}>
                    <div className="card p-4 hover:shadow-md transition-all hover:-translate-y-1 cursor-pointer group">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-3xl">{cat.icon}</span>
                        <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                      </div>
                      <p className="font-semibold text-gray-900 text-sm">{cat.name}</p>
                      <p className="text-gray-400 text-xs mt-1 line-clamp-1">{cat.description}</p>
                      <p className="text-blue-600 font-bold text-sm mt-2">From ₹{cat.base_price}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Why ServeNow?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: '✅', label: 'Verified workers', desc: 'Background checked professionals' },
              { icon: '🔒', label: 'Secure payments', desc: 'Safe Razorpay checkout' },
              { icon: '📍', label: 'Live tracking', desc: 'See your worker on the map' }
            ].map(b => (
              <div key={b.label} className="card p-4 text-center hover:shadow-md transition-shadow">
                <div className="text-3xl mb-2">{b.icon}</div>
                <p className="font-semibold text-gray-900 text-sm">{b.label}</p>
                <p className="text-gray-500 text-xs mt-1">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppWrapperLayout>
  );
}
