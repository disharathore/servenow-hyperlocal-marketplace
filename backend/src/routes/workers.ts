import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import pool from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.post('/setup', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const schema = z.object({
    category_id: z.string().uuid(),
    bio: z.string().min(10),
    experience_years: z.number().int().min(0).max(50),
    hourly_rate: z.number().int().min(100).max(10000),
    skills: z.array(z.string()).optional(),
    slots: z.array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
      }).refine(s => s.start_time < s.end_time, {
        message: 'end_time must be after start_time',
      })
    ).min(1)
  });
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

    await client.query('DELETE FROM worker_availability WHERE worker_id=$1', [wId]);
    for (const slot of slots) {
      await client.query(
        `INSERT INTO worker_availability (worker_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3::time, $4::time)
         ON CONFLICT (worker_id, day_of_week, start_time)
         DO UPDATE SET end_time = EXCLUDED.end_time`,
        [wId, slot.day_of_week, slot.start_time, slot.end_time]
      );
    }

    await client.query('DELETE FROM availability_slots WHERE worker_id=$1 AND is_booked=false AND date >= CURRENT_DATE', [wId]);
    const today = new Date();
    for (let dayOffset = 0; dayOffset < 21; dayOffset++) {
      const d = new Date(today);
      d.setDate(today.getDate() + dayOffset);
      const dow = d.getDay();
      const dateText = d.toISOString().split('T')[0];
      const matching = slots.filter((slot) => slot.day_of_week === dow);
      for (const slot of matching) {
        await client.query(
          `INSERT INTO availability_slots (worker_id, date, start_time, end_time)
           VALUES ($1, $2, $3::time, $4::time)
           ON CONFLICT (worker_id, date, start_time)
           DO UPDATE SET end_time = EXCLUDED.end_time`,
          [wId, dateText, slot.start_time, slot.end_time]
        );
      }
    }
    await client.query('COMMIT');
    return res.json({ success: true, worker_id: wId });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});

router.get('/availability', requireAuth, requireRole('worker'), async (req, res) => {
  const workerRes = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [req.user!.userId]);
  const workerId = workerRes.rows[0]?.id;
  if (!workerId) return res.status(404).json({ error: 'Worker profile not found' });

  const recurring = await query(
    `SELECT day_of_week, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
     FROM worker_availability
     WHERE worker_id = $1
     ORDER BY day_of_week, start_time`,
    [workerId]
  );
  const blocked = await query(
    `SELECT id, date, time_slot
     FROM blocked_slots
     WHERE worker_id = $1 AND date >= CURRENT_DATE
     ORDER BY date, time_slot`,
    [workerId]
  );
  return res.json({ recurring: recurring.rows, blocked: blocked.rows });
});

router.put('/availability', requireAuth, requireRole('worker'), async (req, res) => {
  const schema = z.object({
    slots: z.array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
      }).refine((s) => s.start_time < s.end_time, { message: 'end_time must be after start_time' })
    ).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid availability data' });

  const workerRes = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [req.user!.userId]);
  const workerId = workerRes.rows[0]?.id;
  if (!workerId) return res.status(404).json({ error: 'Worker profile not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM worker_availability WHERE worker_id = $1', [workerId]);
    for (const slot of parsed.data.slots) {
      await client.query(
        `INSERT INTO worker_availability (worker_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3::time, $4::time)
         ON CONFLICT (worker_id, day_of_week, start_time)
         DO UPDATE SET end_time = EXCLUDED.end_time`,
        [workerId, slot.day_of_week, slot.start_time, slot.end_time]
      );
    }
    await client.query('DELETE FROM availability_slots WHERE worker_id = $1 AND is_booked = false AND date >= CURRENT_DATE', [workerId]);
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/blocked-slots', requireAuth, requireRole('worker'), async (req, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time_slot: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid blocked slot data' });

  const workerRes = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [req.user!.userId]);
  const workerId = workerRes.rows[0]?.id;
  if (!workerId) return res.status(404).json({ error: 'Worker profile not found' });

  try {
    const inserted = await query(
      `INSERT INTO blocked_slots (worker_id, date, time_slot)
       VALUES ($1, $2::date, $3)
       ON CONFLICT (worker_id, date, time_slot) DO NOTHING
       RETURNING *`,
      [workerId, parsed.data.date, parsed.data.time_slot]
    );
    if (!inserted.rows[0]) return res.status(409).json({ error: 'Slot already blocked' });
    await query(
      `DELETE FROM availability_slots
       WHERE worker_id = $1
         AND date = $2::date
         AND (to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI')) = $3
         AND is_booked = false`,
      [workerId, parsed.data.date, parsed.data.time_slot]
    );
    return res.status(201).json(inserted.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Could not block slot' });
  }
});

router.delete('/blocked-slots/:id', requireAuth, requireRole('worker'), async (req, res) => {
  const workerRes = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [req.user!.userId]);
  const workerId = workerRes.rows[0]?.id;
  if (!workerId) return res.status(404).json({ error: 'Worker profile not found' });

  const deleted = await query(
    'DELETE FROM blocked_slots WHERE id = $1 AND worker_id = $2 RETURNING id',
    [req.params.id, workerId]
  );
  if (!deleted.rows[0]) return res.status(404).json({ error: 'Blocked slot not found' });
  return res.json({ success: true });
});

router.get('/me', requireAuth, requireRole('worker'), async (req, res) => {
  const r = await query(`SELECT wp.*, c.name as category_name, COALESCE(json_agg(DISTINCT ws.skill) FILTER (WHERE ws.skill IS NOT NULL), '[]') as skills FROM worker_profiles wp LEFT JOIN categories c ON c.id=wp.category_id LEFT JOIN worker_skills ws ON ws.worker_id=wp.id WHERE wp.user_id=$1 GROUP BY wp.id, c.name`, [req.user!.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Worker profile not found' });
  return res.json(r.rows[0]);
});
export default router;
