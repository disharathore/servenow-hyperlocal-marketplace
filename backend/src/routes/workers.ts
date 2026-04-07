import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import pool from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.post('/setup', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const schema = z.object({ category_id: z.string().uuid(), bio: z.string().min(10), experience_years: z.number().int().min(0).max(50), hourly_rate: z.number().int().min(100).max(10000), skills: z.array(z.string()).optional(), slots: z.array(z.object({ day_of_week: z.number().int().min(0).max(6), start_time: z.string(), end_time: z.string() })).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' });
  const { category_id, bio, experience_years, hourly_rate, skills, slots } = parsed.data;
  const categoryResult = await query('SELECT id FROM categories WHERE id = $1 AND is_active = true', [category_id]);
  if (!categoryResult.rows[0]) return res.status(400).json({ error: 'Invalid category selected' });
  const existing = await query('SELECT id FROM worker_profiles WHERE user_id=$1', [req.user!.userId]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let wId: string;
    if (existing.rows[0]) {
      await client.query(`UPDATE worker_profiles SET category_id=$1,bio=$2,experience_years=$3,hourly_rate=$4 WHERE user_id=$5`, [category_id, bio, experience_years, hourly_rate, req.user!.userId]);
      wId = existing.rows[0].id;
    } else {
      wId = (await client.query(`INSERT INTO worker_profiles (user_id,category_id,bio,experience_years,hourly_rate) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.user!.userId, category_id, bio, experience_years, hourly_rate])).rows[0].id;
    }
    if (skills?.length) {
      await client.query('DELETE FROM worker_skills WHERE worker_id=$1', [wId]);
      for (const skill of skills) await client.query('INSERT INTO worker_skills (worker_id,skill) VALUES ($1,$2) ON CONFLICT DO NOTHING', [wId, skill]);
    }
    await client.query('DELETE FROM availability_slots WHERE worker_id=$1 AND is_booked=false', [wId]);
    const today = new Date();
    for (let week = 0; week < 4; week++) for (const slot of slots) {
      const d = new Date(today); d.setDate(today.getDate() + (slot.day_of_week - today.getDay() + 7) % 7 + week * 7);
      await client.query(`INSERT INTO availability_slots (worker_id,date,start_time,end_time) VALUES ($1,$2,$3,$4) ON CONFLICT (worker_id,date,start_time) DO NOTHING`, [wId, d.toISOString().split('T')[0], slot.start_time, slot.end_time]);
    }
    await client.query('COMMIT');
    return res.json({ success: true, worker_id: wId });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});
router.get('/me', requireAuth, requireRole('worker'), async (req, res) => {
  const r = await query(`SELECT wp.*, c.name as category_name, COALESCE(json_agg(DISTINCT ws.skill) FILTER (WHERE ws.skill IS NOT NULL), '[]') as skills FROM worker_profiles wp LEFT JOIN categories c ON c.id=wp.category_id LEFT JOIN worker_skills ws ON ws.worker_id=wp.id WHERE wp.user_id=$1 GROUP BY wp.id, c.name`, [req.user!.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Worker profile not found' });
  return res.json(r.rows[0]);
});
export default router;
