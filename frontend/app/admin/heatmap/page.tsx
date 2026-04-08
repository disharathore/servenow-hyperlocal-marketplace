'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import RoleHeader from '../../_components/RoleHeader';
import { CardListSkeleton } from '../../_components/MarketplaceSkeletons';
import { MapPin, TrendingUp, Users, ShoppingCart, BarChart3, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface HeatmapNode {
  pincode: string;
  city: string;
  locality: string;
  category: string;
  categorySlug: string;
  icon: string;
  demand: number;
  supply: number;
  ratio: number;
  demandLevel: 'low' | 'medium' | 'high' | 'extreme';
  avgRating: number;
  completedToday: number;
  earningsToday: number;
  activeWorkersToday: number;
}

interface RealtimeData {
  pincode: string;
  city: string;
  category: string;
  categorySlug: string;
  icon: string;
  pendingRequests: number;
  arrivingWorkers: number;
  inProgress: number;
  avgWaitMinutes: number;
}

interface TopCity {
  city: string;
  demand: number;
  supply: number;
  categories: number;
  avgRating: number;
  demandLevel: 'low' | 'medium' | 'high' | 'extreme';
}

const demandLevelBadges = {
  low: '🟢 Low',
  medium: '🟡 Medium',
  high: '🟠 High',
  extreme: '🔴 Extreme',
};

export default function HeatmapPage() {
  const [loading, setLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState<HeatmapNode[]>([]);
  const [realtimeData, setRealtimeData] = useState<RealtimeData[]>([]);
  const [topCities, setTopCities] = useState<TopCity[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'today' | 'week' | 'month'>('today');

  useEffect(() => {
    loadData();
  }, [selectedTimeframe]);

  async function loadData() {
    try {
      setLoading(true);
      const [heatmap, realtime, cities] = await Promise.all([
        adminApi.heatmapData(selectedTimeframe),
        adminApi.heatmapRealtime(),
        adminApi.heatmapTopCities(10),
      ]);

      setHeatmapData(heatmap.data || []);
      setRealtimeData(realtime.data || []);
      setTopCities(cities.data || []);
    } catch (error) {
      console.error('Failed to load heatmap data:', error);
      toast.error('Failed to load heatmap data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <CardListSkeleton rows={6} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface to-surface-2">
      <RoleHeader />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-brand-600" />
            Worker Heatmap Analytics
          </h1>
          <p className="text-muted">Real-time demand, supply, and pricing insights</p>
        </div>

        {/* Timeframe Toggle */}
        <div className="card p-3 mb-6 flex gap-2">
          {(['today', 'week', 'month'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedTimeframe === tf
                  ? 'bg-brand-600 text-white shadow-soft'
                  : 'bg-surface-2 text-muted hover:bg-panel'
              }`}
            >
              {tf === 'today' ? 'Today' : tf === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>

        {/* Top Cities Overview */}
        {topCities.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-brand-600" />
              Top Cities by Demand
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topCities.slice(0, 6).map((city) => (
                <div key={city.city} className="card p-4 hover:shadow-soft transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-lg">{city.city}</p>
                      <p className="text-xs text-muted">{city.categories} categories</p>
                    </div>
                    <span className="text-sm font-medium">{demandLevelBadges[city.demandLevel]}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-surface-2 rounded p-2">
                      <p className="text-muted text-xs">Demand</p>
                      <p className="font-bold text-lg">{city.demand}</p>
                    </div>
                    <div className="bg-surface-2 rounded p-2">
                      <p className="text-muted text-xs">Supply</p>
                      <p className="font-bold text-lg">{city.supply}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    <span className="text-yellow-500">⭐</span>
                    <span className="font-medium">{city.avgRating.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Real-time Activity */}
        {realtimeData.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Activity className="w-6 h-6 text-accent-500" />
              Real-time Activity (Last Hour)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {realtimeData.slice(0, 9).map((item, idx) => (
                <div key={idx} className="card p-4 border-l-4 border-brand-600">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold">{item.icon} {item.category}</p>
                      <p className="text-sm text-muted">{item.city}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Pending:</span>
                      <span className="font-bold text-orange-600">{item.pendingRequests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">En Route:</span>
                      <span className="font-bold text-blue-600">{item.arrivingWorkers}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">In Progress:</span>
                      <span className="font-bold text-green-600">{item.inProgress}</span>
                    </div>
                    {item.avgWaitMinutes > 0 && (
                      <div className="flex justify-between pt-2 border-t border-border">
                        <span className="text-muted">Avg Wait:</span>
                        <span className="font-bold">{item.avgWaitMinutes} min</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Heatmap Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-brand-600" />
            Demand-Supply Map ({heatmapData.length} locations)
          </h2>

          {heatmapData.length === 0 ? (
            <div className="card p-8 text-center text-muted">
              <p>No data available for the selected timeframe</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {heatmapData.map((node, idx) => {
                const ratio = node.demand / Math.max(node.supply, 1);
                const ratioColor =
                  ratio < 1
                    ? 'text-green-600'
                    : ratio < 1.5
                      ? 'text-yellow-600'
                      : ratio < 2.5
                        ? 'text-orange-600'
                        : 'text-red-600';

                return (
                  <div
                    key={idx}
                    className="card p-4 flex items-center gap-4 hover:shadow-soft transition-all cursor-pointer"
                  >
                    {/* Icon & Location */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-2xl flex-shrink-0">{node.icon}</span>
                      <div className="min-w-0">
                        <p className="font-bold truncate">{node.category}</p>
                        <p className="text-sm text-muted truncate">
                          {node.locality} • {node.city} {node.pincode}
                        </p>
                      </div>
                    </div>

                    {/* Demand Level Badge */}
                    <div className="text-sm font-medium px-3 py-1 rounded-full bg-surface-2">
                      {demandLevelBadges[node.demandLevel]}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-muted text-xs">Demand</p>
                        <p className="font-bold">{node.demand}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted text-xs">Supply</p>
                        <p className="font-bold">{node.supply}</p>
                      </div>
                      <div className={`text-center font-bold ${ratioColor}`}>
                        <p className="text-muted text-xs text-text">D/S Ratio</p>
                        <p>{node.ratio.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Performance */}
                    <div className="text-right text-sm">
                      <p className="text-muted text-xs">Completed</p>
                      <p className="font-bold">{node.completedToday}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
