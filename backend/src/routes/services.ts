import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { getDistanceKm } from '../utils/maps';

const router = Router();

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

async function ensureCategoriesSeeded() {
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
  await ensureCategoriesSeeded();
  const r = await query('SELECT * FROM categories WHERE is_active = true ORDER BY name');
  return res.json(r.rows);
});

router.get('/workers', async (req: Request, res: Response) => {
  const schema = z.object({ category: z.string().optional(), lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), date: z.string().optional(), pincode: z.string().optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });
  const { category, lat, lng, date, pincode } = parsed.data;
  let sql = `SELECT wp.*, u.name, u.phone, u.avatar_url, u.city, u.locality, u.pincode, u.lat as user_lat, u.lng as user_lng,
    c.name as category_name, c.slug as category_slug, c.icon as category_icon, c.base_price
    FROM worker_profiles wp JOIN users u ON u.id = wp.user_id JOIN categories c ON c.id = wp.category_id
    WHERE wp.is_available = true AND u.is_active = true`;
  const params: unknown[] = []; let idx = 1;
  if (category) { sql += ` AND c.slug = $${idx++}`; params.push(category); }
  if (pincode) { sql += ` AND u.pincode = $${idx++}`; params.push(pincode); }
  if (date) { sql += ` AND EXISTS (SELECT 1 FROM availability_slots s WHERE s.worker_id = wp.id AND s.date = $${idx++} AND s.is_booked = false)`; params.push(date); }
  sql += ' ORDER BY wp.rating DESC, wp.total_jobs DESC LIMIT 50';
  const result = await query(sql, params);
  let workers = result.rows;
  if (lat && lng) {
    workers = workers.map(w => ({ ...w, distance_km: w.user_lat && w.user_lng ? parseFloat(getDistanceKm({ lat, lng }, { lat: w.user_lat, lng: w.user_lng }).toFixed(1)) : null })).sort((a,b) => (a.distance_km??999)-(b.distance_km??999));
  }
  return res.json(workers);
});

router.get('/workers/:id', async (req, res) => {
  const r = await query(`SELECT wp.*, u.name, u.phone, u.avatar_url, u.city, u.locality, u.lat as user_lat, u.lng as user_lng,
    c.name as category_name, c.slug as category_slug, c.icon, c.base_price,
    COALESCE(json_agg(DISTINCT ws.skill) FILTER (WHERE ws.skill IS NOT NULL), '[]') as skills
    FROM worker_profiles wp JOIN users u ON u.id = wp.user_id JOIN categories c ON c.id = wp.category_id
    LEFT JOIN worker_skills ws ON ws.worker_id = wp.id WHERE wp.id = $1
    GROUP BY wp.id, u.name, u.phone, u.avatar_url, u.city, u.locality, u.lat, u.lng, c.name, c.slug, c.icon, c.base_price`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Worker not found' });
  return res.json(r.rows[0]);
});

router.get('/workers/:id/slots', async (req, res) => {
  const { date } = req.query;
  let sql = `SELECT * FROM availability_slots WHERE worker_id = $1 AND is_booked = false AND date >= CURRENT_DATE`;
  const params: unknown[] = [req.params.id];
  if (date) { sql += ' AND date = $2'; params.push(date as string); }
  else { sql += " AND date <= CURRENT_DATE + INTERVAL '14 days'"; }
  sql += ' ORDER BY date, start_time';
  return res.json((await query(sql, params)).rows);
});

router.get('/workers/:id/reviews', async (req, res) => {
  const r = await query(`SELECT r.*, u.name as customer_name FROM reviews r JOIN users u ON u.id = r.customer_id WHERE r.worker_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [req.params.id]);
  return res.json(r.rows);
});

export default router;
