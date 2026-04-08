/**
 * Smart Matching Service
 * Intelligently ranks workers based on rating, distance, and availability
 */

import { query } from '../db/client';

interface WorkerScore {
  worker_id: string;
  name: string;
  rating: number;
  rating_count: number;
  distance_km: number | null;
  availability_score: number;
  match_score: number;
  rank: number;
  badge?: string;
}

/**
 * Calculate availability score (0-100)
 * Based on number of available slots in next 7 days
 */
async function getAvailabilityScore(workerId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as available_slots
     FROM availability_slots
     WHERE worker_id = $1
       AND is_booked = false
       AND date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM blocked_slots bs
         WHERE bs.worker_id = $1
           AND bs.date = availability_slots.date
           AND bs.time_slot = (to_char(availability_slots.start_time, 'HH24:MI') || '-' || to_char(availability_slots.end_time, 'HH24:MI'))
       )`,
    [workerId]
  );

  const slots = Number(result.rows[0]?.available_slots || 0);
  // Max score at 10+ slots
  return Math.min((slots / 10) * 100, 100);
}

/**
 * Calculate composite match score
 * Rating (40%) + Distance (30%) + Availability (20%) + Reviews (10%)
 */
async function calculateMatchScore(
  ratingScore: number,
  distanceKm: number | null,
  ratingCount: number,
  availabilityScore: number,
  maxDistance: number = 50 // Max distance in km for scoring
): Promise<{ score: number; componentScores: Record<string, number> }> {
  // Rating component (0-40 points)
  const ratingComponent = (ratingScore / 5) * 40;

  // Distance component (0-30 points)
  // Closer = higher score
  let distanceComponent = 30;
  if (distanceKm !== null) {
    distanceComponent = Math.max(0, (1 - distanceKm / maxDistance) * 30);
  }

  // Availability component (0-20 points)
  const availabilityComponent = (availabilityScore / 100) * 20;

  // Reviews component (0-10 points)
  // More reviews = more trustworthy
  const reviewsComponent = Math.min((ratingCount / 50) * 10, 10);

  const totalScore = ratingComponent + distanceComponent + availabilityComponent + reviewsComponent;

  return {
    score: Number(totalScore.toFixed(2)),
    componentScores: {
      rating: Number(ratingComponent.toFixed(2)),
      distance: Number(distanceComponent.toFixed(2)),
      availability: Number(availabilityComponent.toFixed(2)),
      reviews: Number(reviewsComponent.toFixed(2)),
    },
  };
}

/**
 * Get badge based on worker performance
 */
function getBadge(ratingCount: number, rating: number): string | undefined {
  if (rating >= 4.8 && ratingCount >= 20) return '⭐ Top Rated';
  if (rating >= 4.5 && ratingCount >= 10) return '✓ Excellent';
  if (rating >= 4.0) return '✓ Good';
  return undefined;
}

/**
 * Smart match workers with comprehensive scoring
 */
export async function smartMatchWorkers(params: {
  categoryId: string;
  lat?: number;
  lng?: number;
  date?: string;
  limit?: number;
}): Promise<WorkerScore[]> {
  const { categoryId, lat, lng, date, limit = 5 } = params;

  const hasGeo = typeof lat === 'number' && typeof lng === 'number';
  const distanceExpr = hasGeo
    ? `(6371 * acos(
        cos(radians(${lat}))
        * cos(radians(COALESCE(wp.current_lat, u.lat)))
        * cos(radians(COALESCE(wp.current_lng, u.lng)) - radians(${lng}))
        + sin(radians(${lat}))
        * sin(radians(COALESCE(wp.current_lat, u.lat)))
      ))`
    : 'NULL';

  let sql = `
    SELECT 
      wp.id as worker_id,
      u.name,
      COALESCE(wp.rating, 0) as rating,
      COALESCE(wp.rating_count, 0) as rating_count,
      ${distanceExpr} as distance_km,
      wp.total_jobs
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    JOIN categories c ON c.id = wp.category_id
    WHERE wp.is_available = true
      AND u.is_active = true
      AND c.id = $1
  `;

  const params_arr: unknown[] = [categoryId];

  if (date) {
    sql += ` AND EXISTS (
      SELECT 1 FROM availability_slots s
      WHERE s.worker_id = wp.id
        AND s.date = $2
        AND s.is_booked = false
    )`;
    params_arr.push(date);
  }

  sql += ` ORDER BY COALESCE(wp.rating, 0) DESC, wp.rating_count DESC`;

  const result = await query(sql, params_arr);
  const workers = result.rows;

  // Calculate scores for each worker
  const scoredWorkers: WorkerScore[] = [];
  for (let i = 0; i < workers.length && scoredWorkers.length < limit * 2; i++) {
    const w = workers[i];
    const availScore = await getAvailabilityScore(w.worker_id);
    const { score } = await calculateMatchScore(
      w.rating,
      w.distance_km || null,
      w.rating_count,
      availScore
    );

    scoredWorkers.push({
      worker_id: w.worker_id,
      name: w.name,
      rating: Number(w.rating),
      rating_count: Number(w.rating_count),
      distance_km: w.distance_km ? Number(w.distance_km.toFixed(1)) : null,
      availability_score: Number(availScore.toFixed(2)),
      match_score: score,
      rank: 0,
      badge: getBadge(w.rating_count, w.rating),
    });
  }

  // Sort by match score and assign ranks
  scoredWorkers.sort((a, b) => b.match_score - a.match_score);
  scoredWorkers.forEach((w, idx) => {
    w.rank = idx + 1;
  });

  return scoredWorkers.slice(0, limit);
}

/**
 * Get smart-matched workers with full details
 */
export async function getSmartMatchedWorkers(params: {
  categoryId?: string;
  lat?: number;
  lng?: number;
  date?: string;
  limit?: number;
  pincode?: string;
}): Promise<any[]> {
  const { categoryId, lat, lng, date, limit = 5, pincode } = params;

  if (!categoryId) throw new Error('Category ID required');

  const scores = await smartMatchWorkers({
    categoryId,
    lat,
    lng,
    date,
    limit,
  });

  // Get full worker details with scores
  const workerIds = scores.map((s) => s.worker_id);
  if (workerIds.length === 0) return [];

  const placeholders = workerIds.map((_, i) => `$${i + 1}`).join(',');
  const fullWorkers = await query(
    `SELECT wp.*, u.name, u.phone, u.avatar_url, u.city, u.locality, u.pincode,
      c.name as category_name, c.slug as category_slug, c.icon, c.base_price
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    JOIN categories c ON c.id = wp.category_id
    WHERE wp.id IN (${placeholders})`,
    workerIds
  );

  // Merge scores with full details
  const result = fullWorkers.rows.map((worker) => {
    const score = scores.find((s) => s.worker_id === worker.id);
    return {
      ...worker,
      matchScore: score?.match_score || 0,
      availabilityScore: score?.availability_score || 0,
      rank: score?.rank || 0,
      badge: score?.badge,
    };
  });

  // Re-sort by rank
  return result.sort((a, b) => a.rank - b.rank);
}
