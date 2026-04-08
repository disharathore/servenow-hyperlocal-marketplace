import Razorpay from 'razorpay';
import crypto from 'crypto';
import { query } from '../db/client';
import { io } from '../index';
import { acquirePaymentHold, releasePaymentHold } from '../db/redis';
import { createNotification } from '../utils/notifications';
import { ServiceError } from './serviceError';
import { logger } from '../utils/logger';

const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
const isDemoPaymentMode = process.env.PAYMENT_MODE === 'demo' || process.env.NODE_ENV === 'development';

export async function createPaymentOrder(input: { bookingId: string; customerId: string }) {
  logger.info('payment_create_order_attempt', { bookingId: input.bookingId, customerId: input.customerId });
  const bRes = await query('SELECT * FROM bookings WHERE id=$1 AND customer_id=$2', [input.bookingId, input.customerId]);
  if (!bRes.rows[0]) throw new ServiceError(404, 'Booking not found');
  if (bRes.rows[0].payment_status === 'paid') throw new ServiceError(400, 'Already paid');

  const held = await acquirePaymentHold(input.bookingId, input.customerId, 120);
  if (!held) throw new ServiceError(409, 'Payment session already active. Try again shortly.');

  if (isDemoPaymentMode) {
    const demoOrderId = `demo_order_${input.bookingId.slice(0, 12)}`;
    await query('UPDATE bookings SET razorpay_order_id=$1 WHERE id=$2', [demoOrderId, input.bookingId]);
    logger.info('payment_create_order_demo', { bookingId: input.bookingId, orderId: demoOrderId, amount: bRes.rows[0].amount });
    return { order_id: demoOrderId, amount: bRes.rows[0].amount, currency: 'INR', key_id: 'demo', demo_mode: true };
  }

  const order = await razorpay.orders.create({
    amount: bRes.rows[0].amount,
    currency: 'INR',
    receipt: `bk_${input.bookingId.slice(0, 16)}`,
    notes: { booking_id: input.bookingId },
  });
  await query('UPDATE bookings SET razorpay_order_id=$1 WHERE id=$2', [order.id, input.bookingId]);
  logger.info('payment_create_order_success', { bookingId: input.bookingId, orderId: order.id, amount: order.amount });
  return { order_id: order.id, amount: order.amount, currency: order.currency, key_id: process.env.RAZORPAY_KEY_ID };
}

export async function verifyPayment(input: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  booking_id: string;
}) {
  logger.info('payment_verify_attempt', { bookingId: input.booking_id, orderId: input.razorpay_order_id });
  if (isDemoPaymentMode) {
    await query(`UPDATE bookings SET payment_status='paid', razorpay_payment_id=$1 WHERE id=$2`, [
      input.razorpay_payment_id || `demo_payment_${input.booking_id.slice(0, 12)}`,
      input.booking_id,
    ]);
    await releasePaymentHold(input.booking_id);
    const b = await query('SELECT * FROM bookings WHERE id=$1', [input.booking_id]);
    if (b.rows[0]) {
      io.to(`worker:${b.rows[0].worker_id}`).emit('payment_confirmed', { booking_id: input.booking_id });
      await createNotification({
        userId: b.rows[0].customer_id,
        type: 'payment_success',
        message: 'Demo payment successful for your booking.',
        bookingId: input.booking_id,
      });
    }
    logger.info('payment_verify_demo_success', { bookingId: input.booking_id });
    return { success: true, demo_mode: true };
  }
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest('hex');
  if (expected !== input.razorpay_signature) throw new ServiceError(400, 'Invalid signature');

  await query(`UPDATE bookings SET payment_status='paid', razorpay_payment_id=$1 WHERE id=$2`, [input.razorpay_payment_id, input.booking_id]);
  await releasePaymentHold(input.booking_id);
  const b = await query('SELECT * FROM bookings WHERE id=$1', [input.booking_id]);
  if (b.rows[0]) {
    io.to(`worker:${b.rows[0].worker_id}`).emit('payment_confirmed', { booking_id: input.booking_id });
    await createNotification({
      userId: b.rows[0].customer_id,
      type: 'payment_success',
      message: 'Payment successful for your booking.',
      bookingId: input.booking_id,
    });
  }
  logger.info('payment_verify_success', { bookingId: input.booking_id, paymentId: input.razorpay_payment_id });
  return { success: true };
}

export async function releasePaymentSession(input: { bookingId: string; customerId: string }) {
  logger.info('payment_release_lock', { bookingId: input.bookingId, customerId: input.customerId });
  const bRes = await query('SELECT * FROM bookings WHERE id=$1 AND customer_id=$2', [input.bookingId, input.customerId]);
  if (!bRes.rows[0]) throw new ServiceError(404, 'Booking not found');
  if (bRes.rows[0].payment_status !== 'paid') {
    await query("UPDATE bookings SET payment_status='failed' WHERE id=$1 AND payment_status='pending'", [input.bookingId]);
  }
  await releasePaymentHold(input.bookingId);
  return { success: true };
}

export async function processPaymentWebhook(input: { signature: string; body: Buffer }) {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(input.body).digest('hex');
  if (expected !== input.signature) throw new ServiceError(400, 'Invalid signature');

  const event = JSON.parse(input.body.toString());
  logger.info('payment_webhook_event', { event: event.event });
  if (event.event === 'payment.captured') {
    const notes = event.payload.payment.entity.notes;
    if (notes?.booking_id) {
      await query(`UPDATE bookings SET payment_status='paid' WHERE id=$1 AND payment_status!='paid'`, [notes.booking_id]);
      await releasePaymentHold(notes.booking_id);
      const booking = await query('SELECT customer_id FROM bookings WHERE id = $1', [notes.booking_id]);
      if (booking.rows[0]) {
        await createNotification({
          userId: booking.rows[0].customer_id,
          type: 'payment_success',
          message: 'Payment successful for your booking.',
          bookingId: notes.booking_id,
        });
      }
    }
  }
  if (event.event === 'payment.failed') {
    const notes = event.payload.payment.entity.notes;
    if (notes?.booking_id) {
      await query("UPDATE bookings SET payment_status='failed' WHERE id=$1 AND payment_status='pending'", [notes.booking_id]);
      await releasePaymentHold(notes.booking_id);
    }
  }
  if (event.event === 'refund.processed' || event.event === 'refund.failed') {
    const refund = event.payload?.refund?.entity;
    const bookingId = refund?.notes?.booking_id;
    if (bookingId) {
      const nextStatus = event.event === 'refund.processed' ? 'processed' : 'failed';
      await query(
        `UPDATE bookings
         SET refund_status = $2,
             razorpay_refund_id = COALESCE($3, razorpay_refund_id),
             refund_processed_at = CASE WHEN $2 = 'processed' THEN NOW() ELSE refund_processed_at END,
             payment_status = CASE
               WHEN $2 = 'processed' AND COALESCE(refund_amount, 0) > 0 THEN 'refunded'::payment_status
               ELSE payment_status
             END,
             updated_at = NOW()
         WHERE id = $1`,
        [bookingId, nextStatus, refund?.id || null]
      );
      logger.info('payment_refund_status_updated', { bookingId, status: nextStatus, refundId: refund?.id || null });
    }
  }
  return { received: true };
}
