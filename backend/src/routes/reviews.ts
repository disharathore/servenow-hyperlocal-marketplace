import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import pool from '../db/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ booking_id: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid review data' });
  const { booking_id, rating, comment } = parsed.data;
  const bRes = await query(`SELECT * FROM bookings WHERE id=$1 AND customer_id=$2 AND status='completed'`, [booking_id, req.user!.userId]);
  if (!bRes.rows[0]) return res.status(403).json({ error: 'Can only review a completed booking' });
  if ((await query('SELECT id FROM reviews WHERE booking_id=$1', [booking_id])).rows[0]) return res.status(409).json({ error: 'Already reviewed' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO reviews (booking_id,customer_id,worker_id,rating,comment) VALUES ($1,$2,$3,$4,$5)`, [booking_id, req.user!.userId, bRes.rows[0].worker_id, rating, comment||null]);
    await client.query(`UPDATE worker_profiles SET rating=(SELECT ROUND(AVG(rating)::numeric,2) FROM reviews WHERE worker_id=$1), rating_count=(SELECT COUNT(*) FROM reviews WHERE worker_id=$1) WHERE id=$1`, [bRes.rows[0].worker_id]);
    await client.query('COMMIT');
    return res.status(201).json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});
export default router;
