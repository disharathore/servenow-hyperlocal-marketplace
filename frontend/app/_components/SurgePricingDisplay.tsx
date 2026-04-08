/**
 * Surge Pricing Display Component
 * Shows pricing info with demand level and peak hour indicators
 */

import { AlertCircle, Zap, TrendingUp } from 'lucide-react';

interface PricingInfo {
  isPeakHour: boolean;
  demandLevel: 'low' | 'medium' | 'high' | 'extreme';
  demandCount: number;
  supplyCount: number;
  demandSupplyRatio: number;
  surgeMultiplier: number;
  reason: string;
}

interface SurgePricingDisplayProps {
  pricing: PricingInfo;
  basePrice: number;
  finalPrice: number;
}

export function SurgePricingDisplay({ pricing, basePrice, finalPrice }: SurgePricingDisplayProps) {
  const demandLevelColors = {
    low: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: '😊' },
    medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: '😐' },
    high: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: '😕' },
    extreme: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '😰' },
  };

  const colors = demandLevelColors[pricing.demandLevel];
  const surgeAmount = finalPrice - basePrice;
  const showSurge = pricing.surgeMultiplier > 1;

  return (
    <div className={`rounded-lg border-2 p-4 ${colors.bg} ${colors.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{colors.icon}</span>
          <div>
            <p className={`font-bold ${colors.text}`}>
              {pricing.demandLevel === 'extreme'
                ? '🔥 Extreme Demand'
                : pricing.demandLevel === 'high'
                  ? '⚡ High Demand'
                  : pricing.demandLevel === 'medium'
                    ? '📊 Medium Demand'
                    : '✨ Normal Pricing'}
            </p>
            {pricing.isPeakHour && <p className="text-xs text-muted">⏰ Peak Hours (9-11 AM, 5-7 PM)</p>}
          </div>
        </div>
        {showSurge && (
          <div className="text-right">
            <p className="text-sm text-muted">Surge:</p>
            <p className="font-bold text-lg" style={{ color: colors.text }}>
              {pricing.surgeMultiplier.toFixed(2)}x
            </p>
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-white/50 rounded p-2 text-center">
          <p className="text-xs text-muted mb-1">Base Price</p>
          <p className="font-bold">₹{basePrice}</p>
        </div>
        {showSurge && (
          <>
            <div className="flex items-center justify-center text-2xl">→</div>
            <div className={`bg-white/50 rounded p-2 text-center border-2`} style={{ borderColor: colors.text }}>
              <p className="text-xs text-muted mb-1">Final Price</p>
              <p className="font-bold">₹{finalPrice}</p>
            </div>
          </>
        )}
      </div>

      {/* Reason */}
      <p className={`text-sm mb-3 ${colors.text}`}>{pricing.reason}</p>

      {/* Stats */}
      <div className="bg-white/50 rounded p-3 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted">Demand / Supply Ratio:</span>
          <span className="font-medium">
            {pricing.demandCount} / {pricing.supplyCount} ({pricing.demandSupplyRatio.toFixed(1)}:1)
          </span>
        </div>
        {showSurge && (
          <div className="flex justify-between">
            <span className="text-muted">Additional Cost:</span>
            <span className="font-medium text-orange-600">+₹{surgeAmount}</span>
          </div>
        )}
      </div>

      {/* Info */}
      {pricing.demandLevel === 'extreme' && (
        <div className="mt-3 flex gap-2 text-xs bg-white/70 rounded p-2">
          <Zap className="w-4 h-4 flex-shrink-0 text-red-600" />
          <p className="text-muted">
            High demand! Consider booking workers in advance or trying adjacent time slots for standard pricing.
          </p>
        </div>
      )}
    </div>
  );
}
