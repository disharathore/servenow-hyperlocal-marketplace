'use client';
import { useEffect, useState } from 'react';
import AppWrapperLayout from '@/app/_components/AppWrapperLayout';
import { servicesApi } from '@/lib/api';
import Link from 'next/link';

interface ServiceCategory {
  id: string;
  slug: string;
  icon: string;
  name: string;
  base_price: number;
}

export default function MyServicesPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);

  useEffect(() => {
    servicesApi.categories().then((r) => setCategories(r.data as ServiceCategory[]));
  }, []);

  return (
    <AppWrapperLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Explore Services</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {categories.map((c) => (
            <Link key={c.id} href={`/services/${c.slug}`} className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl">{c.icon}</p>
              <p className="font-semibold text-sm text-gray-900 mt-2">{c.name}</p>
              <p className="text-xs text-gray-500 mt-1">From ₹{c.base_price}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppWrapperLayout>
  );
}
