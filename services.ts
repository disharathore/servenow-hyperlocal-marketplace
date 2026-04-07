import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { getDistanceKm } from '../utils/maps';

const router = Router();

// ─── GET /api/services/categories ────────────────────────
router.get('/categories', async (_req: Request, res: Response) => {
  const result = await query(
    'SELECT * FROM categories WHERE is_active = true ORDER BY name'
  );
  return res.json(result.rows);
});

// ─── GET /api/services/workers ───────────────────────────
// Query params: category, lat, lng, date, pincode
router.get('/workers', async (req: Request, res: Response) => {
  const schema = z.object({
    category: z.string().optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    date: z.string().optional(), // YYYY-MM-DD
    pincode: z.string().optional(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const { category, lat, lng, date, pincode } = parsed.data;

  let sql = `
    SELECT
      wp.*,
      u.name, u.phone, u.avatar_url, u.city, u.locality, u.pincode,
      u.lat as user_lat, u.lng as user_lng,
      c.name as category_name, c.slug as category_slug, c.icon as category_icon,
      c.base_price
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    JOIN categories c ON c.id = wp.category_id
    WHERE wp.is_available = true AND u.is_active = true
  `;

  const params: unknown[] = [];
  let idx = 1;

  if (category) {
    sql += ` AND c.slug = $${idx++}`;
    params.push(category);
  }

  if (pincode) {
    sql += ` AND u.pincode = $${idx++}`;
    params.push(pincode);
  }

  if (date) {
    // Only return workers who have at least one free slot on that date
    sql += `
      AND EXISTS (
        SELECT 1 FROM availability_slots s
        WHERE s.worker_id = wp.id
          AND s.date = $${idx++}
          AND s.is_booked = false
      )
    `;
    params.push(date);
  }

  sql += ' ORDER BY wp.rating DESC, wp.total_jobs DESC LIMIT 50';

  const result = await query(sql, params);

  // If lat/lng provided, sort by distance and attach distance field
  let workers = result.rows;
  if (lat && lng) {
    workers = workers
      .map((w) => ({
        ...w,
        distance_km: w.user_lat && w.user_lng
          ? parseFloat(getDistanceKm({ lat, lng }, { lat: w.user_lat, lng: w.user_lng }).toFixed(1))
          : null,
      }))
      .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  }

  return res.json(workers);
});

// ─── GET /api/services/workers/:id ───────────────────────
router.get('/workers/:id', async (req: Request, res: Response) => {
  const result = await query(
    `SELECT
      wp.*,
      u.name, u.phone, u.avatar_url, u.city, u.locality,
      u.lat as user_lat, u.lng as user_lng,
      c.name as category_name, c.slug as category_slug, c.icon, c.base_price,
      COALESCE(
        json_agg(DISTINCT ws.skill) FILTER (WHERE ws.skill IS NOT NULL),
        '[]'
      ) as skills
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    JOIN categories c ON c.id = wp.category_id
    LEFT JOIN worker_skills ws ON ws.worker_id = wp.id
    WHERE wp.id = $1
    GROUP BY wp.id, u.name, u.phone, u.avatar_url, u.city, u.locality,
             u.lat, u.lng, c.name, c.slug, c.icon, c.base_price`,
    [req.params.id]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Worker not found' });
  return res.json(result.rows[0]);
});

// ─── GET /api/services/workers/:id/slots ─────────────────
router.get('/workers/:id/slots', async (req: Request, res: Response) => {
  const { date } = req.query;

  let sql = `
    SELECT * FROM availability_slots
    WHERE worker_id = $1 AND is_booked = false AND date >= CURRENT_DATE
  `;
  const params: unknown[] = [req.params.id];

  if (date) {
    sql += ' AND date = $2';
    params.push(date as string);
  } else {
    sql += ' AND date <= CURRENT_DATE + INTERVAL \'14 days\'';
  }

  sql += ' ORDER BY date, start_time';

  const result = await query(sql, params);
  return res.json(result.rows);
});

// ─── GET /api/services/workers/:id/reviews ───────────────
router.get('/workers/:id/reviews', async (req: Request, res: Response) => {
  const result = await query(
    `SELECT r.*, u.name as customer_name, u.avatar_url as customer_avatar
     FROM reviews r
     JOIN bookings b ON b.id = r.booking_id
     JOIN users u ON u.id = r.customer_id
     WHERE r.worker_id = $1
     ORDER BY r.created_at DESC
     LIMIT 20`,
    [req.params.id]
  );
  return res.json(result.rows);
});

export default router;
