import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ booking_id: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid review data' });
  const { booking_id, rating, comment } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bookingResult = await client.query(
      `SELECT id, customer_id, worker_id, status
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [booking_id]
    );
    const booking = bookingResult.rows[0];
    if (!booking || booking.customer_id !== req.user!.userId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.status !== 'completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Review allowed only after booking is completed' });
    }

    await client.query(
      `INSERT INTO reviews (booking_id, customer_id, worker_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [booking_id, req.user!.userId, booking.worker_id, rating, comment || null]
    );

    await client.query('COMMIT');
    return res.status(201).json({ success: true });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Only one review allowed per booking' });
    }
    throw err;
  }
  finally { client.release(); }
});
export default router;
