/**
 * Smart Matched Workers Component
 * Displays ranked workers with scoring breakdown
 */

import { Star, MapPin, TrendingUp, Award } from 'lucide-react';

interface WorkerScore {
  worker_id: string;
  name: string;
  avatar_url?: string;
  rating: number;
  rating_count: number;
  distance_km?: number;
  availability_score: number;
  match_score: number;
  rank: number;
  badge?: string;
  hourly_rate: number;
  category_name: string;
}

interface SmartMatchedWorkersProps {
  workers: WorkerScore[];
  onSelectWorker?: (workerId: string) => void;
}

export function SmartMatchedWorkers({ workers, onSelectWorker }: SmartMatchedWorkersProps) {
  if (!workers.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No workers available for this service</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Best Matched Workers
        </h3>
        <span className="text-sm text-gray-500">Ranked by match score</span>
      </div>

      {workers.map((worker, idx) => (
        <div
          key={worker.worker_id}
          className="rounded-xl bg-white p-4 border-l-4 shadow-sm hover:shadow-md transition-all cursor-pointer border-gray-200"
          style={{
            borderLeftColor: idx === 0 ? '#2563eb' : idx === 1 ? '#fbbf24' : idx === 2 ? '#9ca3af' : '#e5e7eb',
          }}
          onClick={() => onSelectWorker?.(worker.worker_id)}
          role="button"
          tabIndex={0}
        >
          <div className="flex gap-4">
            {/* Rank Badge */}
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center font-bold text-blue-700">
                #{worker.rank}
              </div>
              {worker.badge && (
                <span className="text-xs text-center mt-1 font-medium text-blue-600">{worker.badge}</span>
              )}
            </div>

            {/* Worker Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-gray-900">{worker.name}</p>
                  <p className="text-sm text-gray-500">{worker.category_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-blue-600">₹{worker.hourly_rate}/hr</p>
                  <p className="text-xs text-gray-500">Match: {worker.match_score}/100</p>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
                {/* Rating */}
                <div className="flex items-center gap-1">
                  <div className="flex">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium ml-1">{worker.rating}</span>
                  </div>
                  <span className="text-gray-500">({worker.rating_count})</span>
                </div>

                {/* Distance */}
                {worker.distance_km !== null && (
                  <div className="flex items-center gap-1 text-gray-500">
                    <MapPin className="w-4 h-4" />
                    <span>{worker.distance_km} km</span>
                  </div>
                )}

                {/* Availability */}
                <div className="flex items-center gap-1 text-gray-500">
                  <Award className="w-4 h-4" />
                  <span>{Math.round(worker.availability_score)}% slots</span>
                </div>
              </div>

              {/* Score Breakdown Bar */}
              <div className="space-y-1">
                <div className="text-xs text-gray-500 mb-1">Score breakdown:</div>
                <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-100">
                  <div
                    className="bg-yellow-400"
                    style={{ width: `${(worker.rating / 5) * 40}%` }}
                    title="Rating"
                  />
                  <div
                    className="bg-blue-400"
                    style={{
                      width: `${worker.distance_km ? Math.max(0, (1 - worker.distance_km / 50) * 30) : 30}%`,
                    }}
                    title="Distance"
                  />
                  <div
                    className="bg-green-400"
                    style={{ width: `${(worker.availability_score / 100) * 20}%` }}
                    title="Availability"
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Rating</span>
                  <span>Distance</span>
                  <span>Availability</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
