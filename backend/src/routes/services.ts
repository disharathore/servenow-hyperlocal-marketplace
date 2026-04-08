import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { getSmartMatchedWorkers } from '../services/matchingService';
import { getPricingInfo, calculateSurgePrice } from '../services/pricingService';

const router = Router();

let blockedSlotsAvailable: boolean | null = null;

async function hasBlockedSlotsTable() {
  if (blockedSlotsAvailable !== null) return blockedSlotsAvailable;
  const result = await query("SELECT to_regclass('public.blocked_slots') AS table_name");
  blockedSlotsAvailable = Boolean(result.rows[0]?.table_name);
  return blockedSlotsAvailable;
}

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function ensureMaterializedSlots(workerId: string, fromDate: Date, toDate: Date) {
  const availability = await query(
    'SELECT day_of_week, start_time, end_time FROM worker_availability WHERE worker_id = $1',
    [workerId]
  );
  if (!availability.rows.length) return;

  const daysByDow = new Map<number, Array<{ start_time: string; end_time: string }>>();
  for (const row of availability.rows) {
    const dow = Number(row.day_of_week);
    const list = daysByDow.get(dow) || [];
    list.push({
      start_time: String(row.start_time).slice(0, 8),
      end_time: String(row.end_time).slice(0, 8),
    });
    daysByDow.set(dow, list);
  }

  const cursor = new Date(fromDate);
  while (cursor <= toDate) {
    const dow = cursor.getDay();
    const slots = daysByDow.get(dow) || [];
    for (const slot of slots) {
      await query(
        `INSERT INTO availability_slots (worker_id, date, start_time, end_time, is_booked)
         VALUES ($1, $2, $3::time, $4::time, false)
         ON CONFLICT (worker_id, date, start_time)
         DO UPDATE SET end_time = EXCLUDED.end_time`,
        [workerId, dateOnly(cursor), slot.start_time, slot.end_time]
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}

const DEFAULT_CATEGORIES = [
  { slug: 'plumber', name: 'Plumber', icon: '🔧', description: 'Pipe repairs, faucet fitting, drainage', base_price: 299 },
  { slug: 'electrician', name: 'Electrician', icon: '⚡', description: 'Wiring, switches, appliance repair', base_price: 349 },
  { slug: 'carpenter', name: 'Carpenter', icon: '🪚', description: 'Furniture repair, door fitting', base_price: 399 },
  { slug: 'ac-repair', name: 'AC Repair', icon: '❄️', description: 'Servicing, gas refill, installation', base_price: 549 },
  { slug: 'painter', name: 'Painter', icon: '🎨', description: 'Wall painting, waterproofing', base_price: 499 },
  { slug: 'home-cleaning', name: 'Home Cleaning', icon: '🧹', description: 'Deep clean, bathroom, kitchen', base_price: 299 },
  { slug: 'tutor', name: 'Home Tutor', icon: '📚', description: 'School subjects, entrance prep', base_price: 400 },
  { slug: 'pest-control', name: 'Pest Control', icon: '🐛', description: 'Cockroach, termite, rodent treatment', base_price: 699 },
  { slug: 'cctv', name: 'CCTV / Security', icon: '📹', description: 'Installation and maintenance', base_price: 799 },
  { slug: 'appliance-repair', name: 'Appliance Repair', icon: '🧰', description: 'Washing machine, fridge, microwave', base_price: 399 },
  { slug: 'makeup-artist', name: 'Makeup Artist', icon: '💄', description: 'Party, bridal, event makeup', base_price: 999 },
  { slug: 'fitness-trainer', name: 'Fitness Trainer', icon: '🏋️', description: 'Personal training at home', base_price: 699 },
  { slug: 'laptop-repair', name: 'Laptop Repair', icon: '💻', description: 'Hardware and software fixes', base_price: 499 },
  { slug: 'car-wash', name: 'Car Wash', icon: '🚗', description: 'Doorstep car wash and detailing', base_price: 399 },
  { slug: 'packers-movers', name: 'Packers & Movers', icon: '📦', description: 'Shifting and moving support', base_price: 1199 },
  { slug: 'water-purifier', name: 'Water Purifier Service', icon: '🚰', description: 'RO maintenance and filter change', base_price: 499 },
  { slug: 'salon-home', name: 'Salon at Home', icon: '💇', description: 'Haircut, grooming, beauty services', base_price: 599 },
  { slug: 'gardening', name: 'Gardening', icon: '🌿', description: 'Garden setup and maintenance', base_price: 449 },
  { slug: 'mobile-repair', name: 'Mobile Repair', icon: '📱', description: 'Screen and battery replacement', base_price: 499 },
  { slug: 'interior-design', name: 'Interior Design', icon: '🛋️', description: 'Consultation and home styling', base_price: 1499 },
];

export async function ensureCategoriesSeeded() {
  const countResult = await query('SELECT COUNT(*)::int AS count FROM categories WHERE is_active = true');
  const count = countResult.rows[0]?.count || 0;
  if (count >= 15) return;

  for (const c of DEFAULT_CATEGORIES) {
    await query(
      `INSERT INTO categories (slug, name, icon, description, base_price, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (slug)
       DO UPDATE SET
         name = EXCLUDED.name,
         icon = EXCLUDED.icon,
         description = EXCLUDED.description,
         base_price = EXCLUDED.base_price,
         is_active = true`,
      [c.slug, c.name, c.icon, c.description, c.base_price]
    );
  }
}

router.get('/categories', async (_req, res) => {
  const r = await query('SELECT * FROM categories WHERE is_active = true ORDER BY name');
  return res.json(r.rows);
});

router.get('/workers', async (req: Request, res: Response) => {
  const schema = z.object({
    category: z.string().optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    date: z.string().optional(),
    pincode: z.string().optional(),
    search: z.string().optional(),
    location: z.string().optional(),
    min_rating: z.coerce.number().optional(),
    max_price: z.coerce.number().optional(),
    max_distance: z.coerce.number().optional(),
    sort_by: z.enum(['nearest', 'best_rated']).optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });
  const { category, lat, lng, date, pincode, search, location, min_rating, max_price, max_distance, sort_by } = parsed.data;

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

  let sql = `SELECT wp.*, u.name, u.phone, u.avatar_url, u.city, u.locality, u.pincode, u.lat as user_lat, u.lng as user_lng,
    c.name as category_name, c.slug as category_slug, c.icon as category_icon, c.base_price
    , ${distanceExpr} AS distance_km
    FROM worker_profiles wp JOIN users u ON u.id = wp.user_id JOIN categories c ON c.id = wp.category_id
    WHERE wp.is_available = true AND u.is_active = true`;
  const params: unknown[] = []; let idx = 1;
  if (category) { sql += ` AND c.slug = $${idx++}`; params.push(category); }
  if (pincode) { sql += ` AND u.pincode = $${idx++}`; params.push(pincode); }
  if (search && search.trim()) {
    sql += ` AND (
      c.name ILIKE $${idx}
      OR c.slug ILIKE $${idx}
      OR u.name ILIKE $${idx}
      OR COALESCE(wp.bio, '') ILIKE $${idx}
    )`;
    params.push(`%${search.trim()}%`);
    idx += 1;
  }
  if (location && location.trim()) {
    sql += ` AND (
      COALESCE(u.city, '') ILIKE $${idx}
      OR COALESCE(u.locality, '') ILIKE $${idx}
      OR COALESCE(u.pincode, '') ILIKE $${idx}
    )`;
    params.push(`%${location.trim()}%`);
    idx += 1;
  }
  if (typeof min_rating === 'number') {
    sql += ` AND COALESCE(wp.rating, 0) >= $${idx++}`;
    params.push(min_rating);
  }
  if (typeof max_price === 'number') {
    sql += ` AND COALESCE(wp.hourly_rate, 0) <= $${idx++}`;
    params.push(max_price);
  }
  if (hasGeo && typeof max_distance === 'number') {
    sql += ` AND ${distanceExpr} <= $${idx++}`;
    params.push(max_distance);
  }
  if (date) {
    const blockedSlotsEnabled = await hasBlockedSlotsTable();
    const blockedClause = blockedSlotsEnabled
      ? `
        AND NOT EXISTS (
          SELECT 1
          FROM blocked_slots bs
          WHERE bs.worker_id = s.worker_id
            AND bs.date = s.date
            AND bs.time_slot = (to_char(s.start_time, 'HH24:MI') || '-' || to_char(s.end_time, 'HH24:MI'))
        )`
      : '';
    sql += ` AND EXISTS (
      SELECT 1
      FROM availability_slots s
      WHERE s.worker_id = wp.id
        AND s.date = $${idx++}
        AND s.is_booked = false${blockedClause}
    )`;
    params.push(date);
  }
  if (sort_by === 'nearest' && hasGeo) {
    sql += ' ORDER BY distance_km ASC NULLS LAST, wp.rating DESC, wp.total_jobs DESC';
  } else {
    sql += ' ORDER BY wp.rating DESC, wp.total_jobs DESC, distance_km ASC NULLS LAST';
  }
  sql += ' LIMIT 50';

  const result = await query(sql, params);
  const workers = result.rows.map((w) => ({
    ...w,
    distance_km: w.distance_km == null ? null : Number(Number(w.distance_km).toFixed(1)),
  }));
  return res.json(workers);
});

router.get('/workers/:id', async (req, res) => {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid worker id' });
  const r = await query(`SELECT wp.*, u.name, u.phone, u.avatar_url, u.city, u.locality, u.lat as user_lat, u.lng as user_lng,
    c.name as category_name, c.slug as category_slug, c.icon, c.base_price,
    COALESCE(json_agg(DISTINCT ws.skill) FILTER (WHERE ws.skill IS NOT NULL), '[]') as skills
    FROM worker_profiles wp JOIN users u ON u.id = wp.user_id JOIN categories c ON c.id = wp.category_id
    LEFT JOIN worker_skills ws ON ws.worker_id = wp.id WHERE wp.id = $1
    GROUP BY wp.id, u.name, u.phone, u.avatar_url, u.city, u.locality, u.lat, u.lng, c.name, c.slug, c.icon, c.base_price`, [parsed.data.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Worker not found' });
  return res.json(r.rows[0]);
});

router.get('/workers/:id/slots', async (req, res) => {
  const schema = z.object({
    id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    hydrate: z.coerce.boolean().optional(),
  });
  const parsed = schema.safeParse({ ...req.params, ...req.query });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid slots query' });
  const { id, date, hydrate } = parsed.data;
  const fromDate = date ? new Date(`${String(date)}T00:00:00`) : new Date();
  const toDate = date ? new Date(`${String(date)}T00:00:00`) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  if (hydrate && !Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
    await ensureMaterializedSlots(id, fromDate, toDate);
  }

  const blockedSlotsEnabled = await hasBlockedSlotsTable();
  const blockedClause = blockedSlotsEnabled
    ? `
      AND NOT EXISTS (
        SELECT 1
        FROM blocked_slots bs
        WHERE bs.worker_id = s.worker_id
          AND bs.date = s.date
          AND bs.time_slot = (to_char(s.start_time, 'HH24:MI') || '-' || to_char(s.end_time, 'HH24:MI'))
      )`
    : '';

  let sql = `
    SELECT s.*
    FROM availability_slots s
    WHERE s.worker_id = $1
      AND s.is_booked = false
      AND s.date >= CURRENT_DATE${blockedClause}`;
  const params: unknown[] = [id];
  if (date) { sql += ' AND date = $2'; params.push(date as string); }
  else { sql += " AND date <= CURRENT_DATE + INTERVAL '14 days'"; }
  sql += ' ORDER BY date, start_time';
  return res.json((await query(sql, params)).rows);
});

router.get('/workers/:id/reviews', async (req, res) => {
  const paramsSchema = z.object({ id: z.string().uuid() });
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid worker id' });
  const r = await query(`SELECT r.*, u.name as customer_name FROM reviews r JOIN users u ON u.id = r.customer_id WHERE r.worker_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [parsed.data.id]);
  return res.json(r.rows);
});

// Smart Matching - Get best matched workers for a category
router.get('/smart-match', async (req: Request, res: Response) => {
  const schema = z.object({
    category: z.string(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    date: z.string().optional(),
    pincode: z.string().optional(),
    limit: z.coerce.number().optional().default(5),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query parameters' });

  try {
    // Get category ID from slug
    const catResult = await query('SELECT id FROM categories WHERE slug = $1 AND is_active = true', [parsed.data.category]);
    if (!catResult.rows[0]) return res.status(404).json({ error: 'Category not found' });

    const workers = await getSmartMatchedWorkers({
      categoryId: catResult.rows[0].id,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      date: parsed.data.date,
      pincode: parsed.data.pincode,
      limit: parsed.data.limit,
    });

    return res.json(workers);
  } catch (err) {
    console.error('Smart match error:', err);
    return res.status(500).json({ error: 'Failed to find matched workers' });
  }
});

// Pricing Info - Get surge pricing and demand info for a service
router.get('/pricing-info', async (req: Request, res: Response) => {
  const schema = z.object({
    category: z.string(),
    pincode: z.string().optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query parameters' });

  try {
    const catResult = await query('SELECT id FROM categories WHERE slug = $1 AND is_active = true', [parsed.data.category]);
    if (!catResult.rows[0]) return res.status(404).json({ error: 'Category not found' });

    const pricingInfo = await getPricingInfo(catResult.rows[0].id, parsed.data.pincode);
    return res.json(pricingInfo);
  } catch (err) {
    console.error('Pricing info error:', err);
    return res.status(500).json({ error: 'Failed to get pricing info' });
  }
});

// Calculate final price - Get exact price for a booking
router.post('/calculate-price', async (req: Request, res: Response) => {
  const schema = z.object({
    basePrice: z.number().positive(),
    category: z.string(),
    pincode: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request body' });

  try {
    const catResult = await query('SELECT id FROM categories WHERE slug = $1 AND is_active = true', [parsed.data.category]);
    if (!catResult.rows[0]) return res.status(404).json({ error: 'Category not found' });

    const pricingData = await calculateSurgePrice(parsed.data.basePrice, catResult.rows[0].id, parsed.data.pincode);
    return res.json(pricingData);
  } catch (err) {
    console.error('Calculate price error:', err);
    return res.status(500).json({ error: 'Failed to calculate price' });
  }
});

export default router;
