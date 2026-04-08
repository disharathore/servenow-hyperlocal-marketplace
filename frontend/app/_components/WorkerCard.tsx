'use client';
import Link from 'next/link';
import { Star, MapPin, CheckCircle } from 'lucide-react';

interface WorkerCardProps {
  id: string;
  name: string;
  category: string;
  avatarUrl?: string | null;
  rating: number;
  ratingCount: number;
  hourlyRate: number;
  totalJobs: number;
  distanceKm: number | null;
  isVerified: boolean;
  locality: string;
  isAvailable: boolean;
  experienceYears: number;
}

export default function WorkerCard({ 
  id, name, category, avatarUrl, rating, ratingCount, hourlyRate, totalJobs, distanceKm, isVerified, locality, isAvailable, experienceYears 
}: WorkerCardProps) {
  const initials = (name || 'Worker')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className={`rounded-xl p-4 shadow-md bg-white border border-gray-100 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${!isAvailable ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 font-semibold flex items-center justify-center flex-shrink-0">
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="font-semibold text-gray-900 truncate">{name}</p>
            {isVerified && <CheckCircle size={14} className="text-green-500 flex-shrink-0" />}
          </div>
          <p className="text-xs text-gray-500 truncate">{category}</p>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1 text-amber-600">
              <Star size={13} className="fill-current" />
              <span className="text-sm font-medium">{Number(rating || 0).toFixed(1)}</span>
              <span className="text-xs text-gray-400">({ratingCount})</span>
            </div>
            <span className="text-sm font-semibold text-blue-700">₹{hourlyRate}/hr</span>
          </div>

          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <span className="truncate">{locality}</span>
            {distanceKm !== null && <span className="inline-flex items-center gap-1"><MapPin size={11} />{distanceKm} km</span>}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">{experienceYears}y exp • {totalJobs} jobs</span>
            <Link href={`/book/${id}`}>
              <button className="btn-primary text-xs px-3 py-1.5">Book Now</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
