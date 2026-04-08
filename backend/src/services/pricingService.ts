/**
 * Surge Pricing Service
 * Calculates dynamic pricing based on demand and supply
 */

import { query } from '../db/client';

interface SurgePricingData {
  basePrice: number;
  multiplier: number;
  finalPrice: number;
  isPeakHour: boolean;
  demandLevel: 'low' | 'medium' | 'high' | 'extreme';
}

/**
 * Check if current time is peak hour
 * Peak hours: 9-11 AM, 5-7 PM on weekdays, all day on weekends
 */
function isPeakHour(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  if (isWeekend) return true;
  return (hour >= 9 && hour < 11) || (hour >= 17 && hour < 19);
}

/**
 * Calculate demand-supply ratio for a category in a location
 */
async function getDemandSupplyRatio(
  categoryId: string,
  pincode?: string
): Promise<{
  demand: number;
  supply: number;
  ratio: number;
}> {
  let demandSql = `
    SELECT COALESCE(COUNT(*), 0) as demand
    FROM bookings b
    JOIN categories c ON c.id = b.category_id
    JOIN users u_cust ON u_cust.id = b.customer_id
    WHERE c.id = $1
      AND b.status IN ('pending', 'accepted')
      AND DATE(b.scheduled_at) = CURRENT_DATE
  `;

  let supplySql = `
    SELECT COALESCE(COUNT(*), 0) as supply
    FROM worker_profiles wp
    JOIN categories c ON c.id = wp.category_id
    WHERE c.id = $1 AND wp.is_available = true
  `;

  if (pincode) {
    demandSql += ' AND u_cust.pincode = $2';
    supplySql += ' AND EXISTS (SELECT 1 FROM users u WHERE u.id = wp.user_id AND u.pincode = $2)';
  }

  const demandResult = await query(demandSql, [categoryId, ...(pincode ? [pincode] : [])]);
  const supplyResult = await query(supplySql, [categoryId, ...(pincode ? [pincode] : [])]);

  const demand = Number(demandResult.rows[0]?.demand || 0);
  const supply = Number(supplyResult.rows[0]?.supply || 0);
  const ratio = supply > 0 ? demand / supply : 0;

  return { demand, supply, ratio };
}

/**
 * Calculate surge multiplier based on demand-supply ratio
 */
function calculateMultiplier(ratio: number, isPeak: boolean): { multiplier: number; demandLevel: 'low' | 'medium' | 'high' | 'extreme' } {
  let baseMultiplier = 1.0;
  let demandLevel: 'low' | 'medium' | 'high' | 'extreme' = 'low';

  if (ratio < 1) {
    baseMultiplier = 1.0;
    demandLevel = 'low';
  } else if (ratio < 1.5) {
    baseMultiplier = 1.1;
    demandLevel = 'medium';
  } else if (ratio < 2.5) {
    baseMultiplier = 1.25;
    demandLevel = 'high';
  } else {
    baseMultiplier = 1.5;
    demandLevel = 'extreme';
  }

  // Apply peak hour multiplier
  const peakMultiplier = isPeak ? 1.2 : 1.0;
  const finalMultiplier = baseMultiplier * peakMultiplier;

  return {
    multiplier: Math.min(finalMultiplier, 2.0), // Cap at 2x
    demandLevel,
  };
}

/**
 * Calculate final price with surge pricing
 */
export async function calculateSurgePrice(
  basePrice: number,
  categoryId: string,
  pincode?: string
): Promise<SurgePricingData> {
  const peak = isPeakHour();
  const { ratio } = await getDemandSupplyRatio(categoryId, pincode);
  const { multiplier, demandLevel } = calculateMultiplier(ratio, peak);

  const finalPrice = Math.round(basePrice * multiplier);

  return {
    basePrice,
    multiplier: Number(multiplier.toFixed(2)),
    finalPrice,
    isPeakHour: peak,
    demandLevel,
  };
}

/**
 * Get pricing info for display on frontend
 */
export async function getPricingInfo(categoryId: string, pincode?: string) {
  const peak = isPeakHour();
  const { demand, supply, ratio } = await getDemandSupplyRatio(categoryId, pincode);
  const { multiplier, demandLevel } = calculateMultiplier(ratio, peak);

  return {
    isPeakHour: peak,
    demandLevel,
    demandCount: demand,
    supplyCount: supply,
    demandSupplyRatio: Number(ratio.toFixed(2)),
    surgeMultiplier: Number(multiplier.toFixed(2)),
    reason:
      multiplier > 1.0
        ? `High demand${peak ? ' + Peak hours' : ''}. Surge pricing active: ${multiplier}x`
        : 'Standard pricing',
  };
}
