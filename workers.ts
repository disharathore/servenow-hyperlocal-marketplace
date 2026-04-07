import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ─── POST /api/workers/setup ──────────────────────────────
// Called by a new worker to complete their profile
router.post('/setup', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const schema = z.object({
    bio: z.string().min(20),
    experience_years: z.number().int().min(0).max(50),
    hourly_rate: z.number().int().min(100).max(10000),
    skills: z.array(z.string()).optional(),
    slots: z.array(z.object({
      day_of_week: z.number().int().min(0).max(6), // 0=Mon, 6=Sun
      start_time: z.string(),
      end_time: z.string(),
    })).min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });

  const { bio, experience_years, hourly_rate, skills, slots } = parsed.data;

  // Need category_id — get from user's existing worker profile or request it
  const userResult = await query(
    'SELECT * FROM users WHERE id = $1', [req.user!.userId]
  );
  if (!userResult.rows[0]) return res.status(404).json({ error: 'User not found' });

  // Check if worker profile already exists
  const existing = await query(
    'SELECT id FROM worker_profiles WHERE user_id = $1', [req.user!.userId]
  );

  // Use first category as default if none specified (worker can update later)
  const categoryResult = await query('SELECT id FROM categories LIMIT 1');
  const categoryId = categoryResult.rows[0]?.id;

  const client = await (await import('../db/client')).default.connect();
  try {
    await client.query('BEGIN');

    let workerId: string;

    if (existing.rows[0]) {
      // Update existing
      await client.query(
        `UPDATE worker_profiles
         SET bio = $1, experience_years = $2, hourly_rate = $3
         WHERE user_id = $4`,
        [bio, experience_years, hourly_rate, req.user!.userId]
      );
      workerId = existing.rows[0].id;
    } else {
      // Create new
      const wpResult = await client.query(
        `INSERT INTO worker_profiles (user_id, category_id, bio, experience_years, hourly_rate)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.user!.userId, categoryId, bio, experience_years, hourly_rate]
      );
      workerId = wpResult.rows[0].id;
    }

    // Add skills
    if (skills && skills.length > 0) {
      await client.query('DELETE FROM worker_skills WHERE worker_id = $1', [workerId]);
      for (const skill of skills) {
        await client.query(
          'INSERT INTO worker_skills (worker_id, skill) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [workerId, skill]
        );
      }
    }

    // Create availability slots for the next 4 weeks
    await client.query('DELETE FROM availability_slots WHERE worker_id = $1 AND is_booked = false', [workerId]);

    const today = new Date();
    for (let week = 0; week < 4; week++) {
      for (const slot of slots) {
        // Find the next occurrence of this day_of_week
        const date = new Date(today);
        const dayDiff = (slot.day_of_week - today.getDay() + 7) % 7;
        date.setDate(today.getDate() + dayDiff + week * 7);

        const dateStr = date.toISOString().split('T')[0];
        await client.query(
          `INSERT INTO availability_slots (worker_id, date, start_time, end_time)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (worker_id, date, start_time) DO NOTHING`,
          [workerId, dateStr, slot.start_time, slot.end_time]
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ success: true, worker_id: workerId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ─── GET /api/workers/me ──────────────────────────────────
router.get('/me', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const result = await query(
    `SELECT wp.*, c.name as category_name,
      COALESCE(json_agg(DISTINCT ws.skill) FILTER (WHERE ws.skill IS NOT NULL), '[]') as skills
     FROM worker_profiles wp
     LEFT JOIN categories c ON c.id = wp.category_id
     LEFT JOIN worker_skills ws ON ws.worker_id = wp.id
     WHERE wp.user_id = $1
     GROUP BY wp.id, c.name`,
    [req.user!.userId]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Worker profile not found' });
  return res.json(result.rows[0]);
});

// ─── PATCH /api/workers/availability ─────────────────────
router.patch('/availability', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const { is_available } = req.body;
  await query(
    'UPDATE worker_profiles SET is_available = $1 WHERE user_id = $2',
    [!!is_available, req.user!.userId]
  );
  return res.json({ success: true });
});

export default router;
