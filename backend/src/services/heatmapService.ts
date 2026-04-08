/**
 * Worker Heatmap Service
 * Provides supply/demand analytics for admin dashboard
 */

import { query } from '../db/client';

export interface HeatmapNode {
  pincode: string;
  city: string;
  locality: string;
  category: string;
  category_slug: string;
  icon: string;
  demand: number; // pending + accepted bookings
  supply: number; // active workers
  ratio: number;
  demand_level: 'low' | 'medium' | 'high' | 'extreme';
  avg_rating: number;
  total_earnings: number;
  active_workers_today: number;
}

/**
 * Determine demand level based on demand/supply ratio
 */
function getDemandLevel(ratio: number): 'low' | 'medium' | 'high' | 'extreme' {
  if (ratio < 1) return 'low';
  if (ratio < 1.5) return 'medium';
  if (ratio < 2.5) return 'high';
  return 'extreme';
}

/**
 * Get top cities by demand
 */
export async function getTopCitiesByDemand(limit: number = 10) {
  const result = await query(
    `SELECT 
      u.city,
      COUNT(CASE WHEN b.status IN ('pending', 'accepted') THEN 1 END) as demand,
      COUNT(DISTINCT CASE WHEN wp.is_available = true THEN wp.user_id END) as supply,
      COUNT(DISTINCT c.id) as categories_count,
      COALESCE(AVG(wp.rating), 0) as avg_rating
    FROM users u
    LEFT JOIN bookings b ON u.pincode = (
      SELECT pincode FROM users WHERE id = b.customer_id OR id = (
        SELECT user_id FROM worker_profiles WHERE id = b.worker_id
      )
    )
    LEFT JOIN worker_profiles wp ON u.pincode = (SELECT pincode FROM users WHERE id = wp.user_id)
    LEFT JOIN categories c ON c.id = wp.category_id
    WHERE u.city IS NOT NULL
    GROUP BY u.city
    ORDER BY demand DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    city: row.city,
    demand: Number(row.demand),
    supply: Number(row.supply),
    categories: Number(row.categories_count),
    avgRating: Number(row.avg_rating || 0),
    demandLevel: getDemandLevel((Number(row.demand) || 0) / (Number(row.supply) || 1)),
  }));
}

/**
 * Get heatmap data by location and category
 */
export async function getHeatmapData(filters?: {
  category?: string;
  city?: string;
  timeframe?: 'today' | 'week' | 'month';
}) {
  const { category, city, timeframe = 'today' } = filters || {};

  let dateFilter = "DATE_TRUNC('day', b.created_at) >= CURRENT_DATE";
  if (timeframe === 'week') {
    dateFilter = "DATE_TRUNC('day', b.created_at) >= CURRENT_DATE - INTERVAL '7 days'";
  } else if (timeframe === 'month') {
    dateFilter = "DATE_TRUNC('day', b.created_at) >= CURRENT_DATE - INTERVAL '30 days'";
  }

  let sql = `
    SELECT 
      u_customer.pincode,
      u_customer.city,
      u_customer.locality,
      c.name as category,
      c.slug as category_slug,
      c.icon,
      c.base_price,
      COUNT(CASE WHEN b.status IN ('pending', 'accepted') THEN 1 END) as demand,
      COUNT(DISTINCT wp.id) FILTER (WHERE wp.is_available = true) as supply,
      COUNT(DISTINCT CASE WHEN b.status = 'completed' AND ${dateFilter} THEN b.id END) as completed_today,
      COALESCE(AVG(wp.rating), 0)::decimal(3,2) as avg_rating,
      COALESCE(SUM(CASE WHEN b.status = 'completed' AND b.payment_status = 'paid' AND ${dateFilter} THEN b.amount ELSE 0 END), 0) as earnings_today,
      COUNT(DISTINCT CASE WHEN b.status IN ('pending', 'accepted') AND ${dateFilter} THEN b.worker_id END) as active_workers_today
    FROM users u_customer
    JOIN bookings b ON b.customer_id = u_customer.id
    JOIN worker_profiles wp ON wp.category_id IN (SELECT id FROM categories)
    JOIN users u_worker ON u_worker.id = wp.user_id
    JOIN categories c ON c.id = wp.category_id
    WHERE u_customer.pincode IS NOT NULL
      AND u_customer.city IS NOT NULL
  `;

  const params: unknown[] = [];
  let paramIndex = 1;

  if (category) {
    sql += `\n      AND c.slug = $${paramIndex++}`;
    params.push(category);
  }

  if (city) {
    sql += `\n      AND u_customer.city ILIKE $${paramIndex++}`;
    params.push(`%${city}%`);
  }

  sql += `
    GROUP BY 
      u_customer.pincode,
      u_customer.city,
      u_customer.locality,
      c.id,
      c.name,
      c.slug,
      c.icon,
      c.base_price
    ORDER BY demand DESC
  `;

  const result = await query(sql, params);

  return result.rows.map((row) => {
    const demand = Number(row.demand || 0);
    const supply = Number(row.supply || 0);
    const ratio = supply > 0 ? demand / supply : 0;

    return {
      pincode: row.pincode,
      city: row.city,
      locality: row.locality,
      category: row.category,
      categorySlug: row.category_slug,
      icon: row.icon,
      basePrice: Number(row.base_price),
      demand,
      supply,
      ratio: Number(ratio.toFixed(2)),
      demandLevel: getDemandLevel(ratio),
      avgRating: Number(row.avg_rating || 0),
      completedToday: Number(row.completed_today || 0),
      earningsToday: Number(row.earnings_today || 0),
      activeWorkersToday: Number(row.active_workers_today || 0),
    };
  });
}

/**
 * Get real-time demand map (last hour)
 */
export async function getRealTimeDemandMap() {
  const result = await query(`
    SELECT 
      COALESCE(u_cust.pincode, 'unknown') as pincode,
      COALESCE(u_cust.city, 'unknown') as city,
      c.name as category,
      c.slug as category_slug,
      c.icon,
      COUNT(CASE WHEN b.status IN ('pending', 'accepted') THEN 1 END) as pending_requests,
      COUNT(CASE WHEN b.status = 'arriving' THEN 1 END) as arriving_workers,
      COUNT(CASE WHEN b.status = 'in_progress' THEN 1 END) as in_progress,
      AVG(EXTRACT(EPOCH FROM (NOW() - b.requested_at))/60)::int as avg_wait_minutes
    FROM bookings b
    LEFT JOIN users u_cust ON u_cust.id = b.customer_id
    LEFT JOIN categories c ON c.id = b.category_id
    WHERE b.created_at > NOW() - INTERVAL '1 hour'
      AND b.status IN ('pending', 'accepted', 'arriving', 'in_progress')
    GROUP BY 
      u_cust.pincode, 
      u_cust.city, 
      c.id, 
      c.name,
      c.slug,
      c.icon
    ORDER BY pending_requests DESC
  `);

  return result.rows.map((row) => ({
    pincode: row.pincode,
    city: row.city,
    category: row.category,
    categorySlug: row.category_slug,
    icon: row.icon,
    pendingRequests: Number(row.pending_requests),
    arrivingWorkers: Number(row.arriving_workers),
    inProgress: Number(row.in_progress),
    avgWaitMinutes: Number(row.avg_wait_minutes || 0),
  }));
}

/**
 * Get supply distribution (workers available per location)
 */
export async function getSupplyDistribution() {
  const result = await query(`
    SELECT 
      u.pincode,
      u.city,
      u.locality,
      c.name as category,
      c.slug as category_slug,
      c.icon,
      COUNT(*) as available_workers,
      AVG(wp.rating) as avg_rating,
      MAX(wp.rating) as top_rating,
      MIN(wp.hourly_rate) as min_rate,
      MAX(wp.hourly_rate) as max_rate,
      COUNT(CASE WHEN as.is_booked = false THEN 1 END) as available_slots_count
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    JOIN categories c ON c.id = wp.category_id
    JOIN availability_slots as ON as.worker_id = wp.id AND as.is_booked = false AND as.date >= CURRENT_DATE
    WHERE wp.is_available = true AND u.is_active = true
    GROUP BY 
      u.pincode, 
      u.city, 
      u.locality, 
      c.id, 
      c.name,
      c.slug,
      c.icon
    ORDER BY available_workers DESC
  `);

  return result.rows.map((row) => ({
    pincode: row.pincode,
    city: row.city,
    locality: row.locality,
    category: row.category,
    categorySlug: row.category_slug,
    icon: row.icon,
    availableWorkers: Number(row.available_workers),
    avgRating: Number(row.avg_rating || 0),
    topRating: Number(row.top_rating || 0),
    priceRange: {
      min: Number(row.min_rate || 0),
      max: Number(row.max_rate || 0),
    },
  }));
}
