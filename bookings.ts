import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { acquireLock, releaseLock } from '../db/redis';
import { requireAuth } from '../middleware/auth';
import { geocodeAddress } from '../utils/maps';
import { sendBookingConfirmation } from '../utils/resend';
import { io } from '../index';

const router = Router();

// ─── POST /api/bookings ───────────────────────────────────
// Create a new booking (customer only)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    worker_id: z.string().uuid(),
    slot_id: z.string().uuid(),
    description: z.string().optional(),
    address: z.string().min(10),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking data', details: parsed.error.issues });

  const { worker_id, slot_id, description, address } = parsed.data;
  const lockKey = `slot:${slot_id}`;

  // 1. Acquire distributed lock on the slot
  const locked = await acquireLock(lockKey, 30);
  if (!locked) return res.status(409).json({ error: 'Slot is being booked by another user. Try again.' });

  try {
    // 2. Verify slot is still free
    const slotResult = await query(
      'SELECT * FROM availability_slots WHERE id = $1 AND is_booked = false',
      [slot_id]
    );
    if (!slotResult.rows[0]) {
      return res.status(409).json({ error: 'Slot no longer available' });
    }
    const slot = slotResult.rows[0];

    // 3. Fetch worker and category
    const workerResult = await query(
      `SELECT wp.*, c.base_price, c.name as category_name, c.id as category_id,
              u.name as worker_name, u.email as worker_email
       FROM worker_profiles wp
       JOIN categories c ON c.id = wp.category_id
       JOIN users u ON u.id = wp.user_id
       WHERE wp.id = $1`,
      [worker_id]
    );
    if (!workerResult.rows[0]) return res.status(404).json({ error: 'Worker not found' });
    const worker = workerResult.rows[0];

    // 4. Geocode the address for live tracking
    const coords = await geocodeAddress(address);

    // 5. Calculate amount (base price × estimated hours = 1 for now)
    const amount = worker.hourly_rate * 100; // paise

    // 6. Create booking + lock slot (in a transaction)
    const client = await (await import('../db/client')).default.connect();
    try {
      await client.query('BEGIN');

      const bookingResult = await client.query(
        `INSERT INTO bookings
           (customer_id, worker_id, category_id, slot_id, description, address, lat, lng, scheduled_at, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          req.user!.userId,
          worker_id,
          worker.category_id,
          slot_id,
          description || null,
          address,
          coords?.lat || null,
          coords?.lng || null,
          `${slot.date}T${slot.start_time}`,
          amount,
        ]
      );

      await client.query(
        'UPDATE availability_slots SET is_booked = true WHERE id = $1',
        [slot_id]
      );

      await client.query('COMMIT');

      const booking = bookingResult.rows[0];

      // 7. Notify worker via Socket.io
      io.to(`worker:${worker_id}`).emit('new_booking', {
        booking_id: booking.id,
        category: worker.category_name,
        address: booking.address,
        scheduled_at: booking.scheduled_at,
        amount: booking.amount,
      });

      // 8. Send confirmation email if customer has email
      const customerResult = await query('SELECT * FROM users WHERE id = $1', [req.user!.userId]);
      const customer = customerResult.rows[0];
      if (customer.email) {
        sendBookingConfirmation({
          customerName: customer.name || 'Customer',
          customerEmail: customer.email,
          workerName: worker.worker_name,
          category: worker.category_name,
          scheduledAt: new Date(booking.scheduled_at).toLocaleString('en-IN'),
          address: booking.address,
          bookingId: booking.id,
          amount: booking.amount,
        }).catch(console.error);
      }

      return res.status(201).json(booking);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await releaseLock(lockKey);
  }
});

// ─── GET /api/bookings ────────────────────────────────────
// Get bookings for logged-in user (customer or worker)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query;
  const user = req.user!;

  const isWorker = user.role === 'worker';
  const idField = isWorker ? 'wp.id' : 'b.customer_id';
  const userIdValue = isWorker
    ? (await query('SELECT id FROM worker_profiles WHERE user_id = $1', [user.userId])).rows[0]?.id
    : user.userId;

  if (!userIdValue) return res.json([]);

  let sql = `
    SELECT
      b.*,
      cu.name as customer_name, cu.phone as customer_phone, cu.avatar_url as customer_avatar,
      wu.name as worker_name, wu.phone as worker_phone,
      wp.rating as worker_rating,
      c.name as category_name, c.icon as category_icon, c.slug as category_slug
    FROM bookings b
    JOIN users cu ON cu.id = b.customer_id
    JOIN worker_profiles wp ON wp.id = b.worker_id
    JOIN users wu ON wu.id = wp.user_id
    JOIN categories c ON c.id = b.category_id
    WHERE ${isWorker ? 'b.worker_id' : 'b.customer_id'} = $1
  `;

  const params: unknown[] = [userIdValue];

  if (status) {
    sql += ' AND b.status = $2';
    params.push(status as string);
  }

  sql += ' ORDER BY b.created_at DESC';

  const result = await query(sql, params);
  return res.json(result.rows);
});

// ─── GET /api/bookings/:id ────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    `SELECT
      b.*,
      cu.name as customer_name, cu.phone as customer_phone,
      wu.name as worker_name, wu.phone as worker_phone,
      wu.avatar_url as worker_avatar,
      wp.current_lat as worker_lat, wp.current_lng as worker_lng,
      wp.rating as worker_rating,
      c.name as category_name, c.icon as category_icon
    FROM bookings b
    JOIN users cu ON cu.id = b.customer_id
    JOIN worker_profiles wp ON wp.id = b.worker_id
    JOIN users wu ON wu.id = wp.user_id
    JOIN categories c ON c.id = b.category_id
    WHERE b.id = $1`,
    [req.params.id]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  return res.json(result.rows[0]);
});

// ─── PATCH /api/bookings/:id/cancel ──────────────────────
router.patch('/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  const { reason } = req.body;

  const booking = await query(
    'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2',
    [req.params.id, req.user!.userId]
  );

  if (!booking.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  if (['completed', 'cancelled'].includes(booking.rows[0].status)) {
    return res.status(400).json({ error: 'Cannot cancel a completed or already cancelled booking' });
  }

  await query(
    `UPDATE bookings SET status = 'cancelled', cancellation_reason = $1 WHERE id = $2`,
    [reason || null, req.params.id]
  );

  // Free up the slot
  if (booking.rows[0].slot_id) {
    await query('UPDATE availability_slots SET is_booked = false WHERE id = $1', [booking.rows[0].slot_id]);
  }

  // Notify worker
  io.to(`worker:${booking.rows[0].worker_id}`).emit('booking_cancelled', { booking_id: req.params.id });

  return res.json({ success: true });
});

export default router;
