import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { query } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';

const router = Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// ─── POST /api/payments/create-order ─────────────────────
// Called after booking is created; creates a Razorpay order
router.post('/create-order', requireAuth, async (req: Request, res: Response) => {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const bookingResult = await query(
    'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2',
    [booking_id, req.user!.userId]
  );
  if (!bookingResult.rows[0]) return res.status(404).json({ error: 'Booking not found' });

  const booking = bookingResult.rows[0];
  if (booking.payment_status === 'paid') return res.status(400).json({ error: 'Already paid' });

  const order = await razorpay.orders.create({
    amount: booking.amount, // already in paise
    currency: 'INR',
    receipt: `booking_${booking.id.slice(0, 16)}`,
    notes: { booking_id: booking.id },
  });

  // Store razorpay order id
  await query(
    'UPDATE bookings SET razorpay_order_id = $1 WHERE id = $2',
    [order.id, booking_id]
  );

  return res.json({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: process.env.RAZORPAY_KEY_ID,
  });
});

// ─── POST /api/payments/verify ────────────────────────────
// Called from frontend after successful payment
router.post('/verify', requireAuth, async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;

  // Verify signature
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  await query(
    `UPDATE bookings
     SET payment_status = 'paid',
         razorpay_payment_id = $1
     WHERE id = $2`,
    [razorpay_payment_id, booking_id]
  );

  // Notify worker that payment is confirmed
  const booking = await query('SELECT * FROM bookings WHERE id = $1', [booking_id]);
  if (booking.rows[0]) {
    io.to(`worker:${booking.rows[0].worker_id}`).emit('payment_confirmed', { booking_id });
  }

  return res.json({ success: true });
});

// ─── POST /api/payments/webhook ───────────────────────────
// Razorpay server-to-server webhook (raw body)
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  const body = req.body as Buffer;

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');

  if (expected !== signature) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = JSON.parse(body.toString());

  if (event.event === 'payment.captured') {
    const notes = event.payload.payment.entity.notes;
    if (notes?.booking_id) {
      await query(
        `UPDATE bookings SET payment_status = 'paid' WHERE id = $1 AND payment_status != 'paid'`,
        [notes.booking_id]
      );
    }
  }

  if (event.event === 'payment.failed') {
    const notes = event.payload.payment.entity.notes;
    if (notes?.booking_id) {
      await query(
        `UPDATE bookings SET payment_status = 'failed' WHERE id = $1`,
        [notes.booking_id]
      );
    }
  }

  return res.json({ received: true });
});

export default router;
