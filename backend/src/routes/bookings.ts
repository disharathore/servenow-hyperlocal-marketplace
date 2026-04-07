import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import pool from '../db/client';
import { acquireLock, releaseLock } from '../db/redis';
import { requireAuth } from '../middleware/auth';
import { geocodeAddress } from '../utils/maps';
import { sendBookingConfirmation } from '../utils/resend';
import { io } from '../index';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ worker_id: z.string().uuid(), slot_id: z.string().uuid(), description: z.string().optional(), address: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking data' });
  const { worker_id, slot_id, description, address } = parsed.data;
  const locked = await acquireLock(`slot:${slot_id}`, 30);
  if (!locked) return res.status(409).json({ error: 'Slot is being booked. Try again.' });
  try {
    const slotResult = await query('SELECT * FROM availability_slots WHERE id = $1 AND is_booked = false', [slot_id]);
    if (!slotResult.rows[0]) return res.status(409).json({ error: 'Slot no longer available' });
    const slot = slotResult.rows[0];
    const workerResult = await query(`SELECT wp.*, c.name as category_name, c.id as category_id, u.name as worker_name FROM worker_profiles wp JOIN categories c ON c.id = wp.category_id JOIN users u ON u.id = wp.user_id WHERE wp.id = $1`, [worker_id]);
    if (!workerResult.rows[0]) return res.status(404).json({ error: 'Worker not found' });
    const worker = workerResult.rows[0];
    const coords = await geocodeAddress(address);
    const amount = worker.hourly_rate * 100;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bookingResult = await client.query(
        `INSERT INTO bookings (customer_id,worker_id,category_id,slot_id,description,address,lat,lng,scheduled_at,amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user!.userId, worker_id, worker.category_id, slot_id, description||null, address, coords?.lat||null, coords?.lng||null, `${slot.date}T${slot.start_time}`, amount]
      );
      await client.query('UPDATE availability_slots SET is_booked = true WHERE id = $1', [slot_id]);
      await client.query('COMMIT');
      const booking = bookingResult.rows[0];

      const customerResult = await query('SELECT name, email FROM users WHERE id = $1', [req.user!.userId]);
      const customer = customerResult.rows[0];
      if (customer?.email) {
        sendBookingConfirmation({
          customerName: customer.name || 'Customer',
          customerEmail: customer.email,
          workerName: worker.worker_name || 'Your worker',
          category: worker.category_name,
          scheduledAt: new Date(booking.scheduled_at).toLocaleString('en-IN'),
          address,
          bookingId: booking.id,
          amount,
        }).catch(console.error);
      }

      io.to(`worker:${worker_id}`).emit('new_booking', { booking_id: booking.id, category: worker.category_name, address, scheduled_at: booking.scheduled_at, amount });
      return res.status(201).json(booking);
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } finally { await releaseLock(`slot:${slot_id}`); }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query;
  const user = req.user!;
  const isWorker = user.role === 'worker';
  let userIdValue = user.userId;
  if (isWorker) {
    const wp = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [user.userId]);
    if (!wp.rows[0]) return res.json([]);
    userIdValue = wp.rows[0].id;
  }
  let sql = `SELECT b.*, cu.name as customer_name, cu.phone as customer_phone, wu.name as worker_name, wp.rating as worker_rating, c.name as category_name, c.icon as category_icon, c.slug as category_slug
    FROM bookings b JOIN users cu ON cu.id = b.customer_id JOIN worker_profiles wp ON wp.id = b.worker_id JOIN users wu ON wu.id = wp.user_id JOIN categories c ON c.id = b.category_id
    WHERE ${isWorker ? 'b.worker_id' : 'b.customer_id'} = $1`;
  const params: unknown[] = [userIdValue];
  if (status) { sql += ' AND b.status = $2'; params.push(status as string); }
  sql += ' ORDER BY b.created_at DESC';
  return res.json((await query(sql, params)).rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const r = await query(`SELECT b.*, cu.name as customer_name, cu.phone as customer_phone, wu.name as worker_name, wu.phone as worker_phone, wp.current_lat as worker_lat, wp.current_lng as worker_lng, wp.rating as worker_rating, c.name as category_name, c.icon as category_icon
    FROM bookings b JOIN users cu ON cu.id = b.customer_id JOIN worker_profiles wp ON wp.id = b.worker_id JOIN users wu ON wu.id = wp.user_id JOIN categories c ON c.id = b.category_id WHERE b.id = $1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  return res.json(r.rows[0]);
});

router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const { reason } = req.body;
  const booking = await query('SELECT * FROM bookings WHERE id = $1 AND customer_id = $2', [req.params.id, req.user!.userId]);
  if (!booking.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  if (['completed','cancelled'].includes(booking.rows[0].status)) return res.status(400).json({ error: 'Cannot cancel this booking' });
  await query(`UPDATE bookings SET status = 'cancelled', cancellation_reason = $1 WHERE id = $2`, [reason||null, req.params.id]);
  if (booking.rows[0].slot_id) await query('UPDATE availability_slots SET is_booked = false WHERE id = $1', [booking.rows[0].slot_id]);
  io.to(`worker:${booking.rows[0].worker_id}`).emit('booking_cancelled', { booking_id: req.params.id });
  return res.json({ success: true });
});

export default router;
