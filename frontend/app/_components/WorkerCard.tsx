'use client';
import Link from 'next/link';
import { Star, MapPin, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface WorkerCardProps {
  id: string;
  name: string;
  category: string;
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
  id, name, category, rating, ratingCount, hourlyRate, totalJobs, distanceKm, isVerified, locality, isAvailable, experienceYears 
}: WorkerCardProps) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
      <Link href={`/book/${id}`}>
        <div className={`card p-4 flex gap-3 hover:shadow-md transition-shadow cursor-pointer ${!isAvailable ? 'opacity-60' : ''}`}>
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-lg font-bold text-blue-600 flex-shrink-0">
            {name?.[0]?.toUpperCase() || 'W'}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="font-semibold text-gray-900 truncate">{name}</p>
              {isVerified && <CheckCircle size={14} className="text-green-500 flex-shrink-0" />}
            </div>
            
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <div className="flex items-center gap-0.5">
                <Star size={13} className="text-yellow-400 fill-yellow-400" />
                <span className="font-medium">{rating || '—'}</span>
                <span className="text-gray-400">({ratingCount})</span>
              </div>
              <span>·</span>
              <span>{totalJobs} jobs</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-1.5">
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{category}</span>
              <span>{experienceYears}y exp</span>
              {distanceKm !== null && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5"><MapPin size={11} />{distanceKm} km</span>
                </>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{locality}</p>
              <span className="font-bold text-blue-600 text-sm">₹{hourlyRate}/hr</span>
            </div>
          </div>

          {!isAvailable && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/20 backdrop-blur-sm">
              <div className="bg-white rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700">Offline</div>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
