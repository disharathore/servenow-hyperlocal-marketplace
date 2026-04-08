import Razorpay from 'razorpay';
import pool, { query } from '../db/client';
import { acquireLock, releaseLock } from '../db/redis';
import { geocodeAddress } from '../utils/maps';
import { sendBookingConfirmation } from '../utils/resend';
import { canTransition, transitionTimestampColumn, type BookingStatus } from '../utils/bookingFsm';
import { io } from '../index';
import { createNotification } from '../utils/notifications';
import { ServiceError } from './serviceError';
import { calculateSurgePrice } from './pricingService';

const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
const PARTIAL_REFUND_PERCENT = Number(process.env.CANCELLATION_PARTIAL_REFUND_PERCENT || 50);

function calculateRefundAmount(bookingAmount: number, status: BookingStatus): number {
  if (status === 'pending') return bookingAmount;
  if (status === 'accepted' || status === 'arriving') return Math.floor((bookingAmount * PARTIAL_REFUND_PERCENT) / 100);
  return 0;
}

export async function createBooking(input: {
  customerId: string;
  workerId: string;
  slotId: string;
  description?: string;
  address: string;
}) {
  const locked = await acquireLock(`slot:${input.slotId}`, 30);
  if (!locked) throw new ServiceError(409, 'Slot is being booked. Try again.');

  try {
    const workerResult = await query(
      `SELECT wp.*, c.name as category_name, c.id as category_id, u.name as worker_name
       FROM worker_profiles wp
       JOIN categories c ON c.id = wp.category_id
       JOIN users u ON u.id = wp.user_id
       WHERE wp.id = $1`,
      [input.workerId]
    );
    const worker = workerResult.rows[0];
    if (!worker) throw new ServiceError(404, 'Worker not found');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const slotResult = await client.query(
        'SELECT * FROM availability_slots WHERE id = $1 AND worker_id = $2 FOR UPDATE',
        [input.slotId, input.workerId]
      );
      if (!slotResult.rows[0]) throw new ServiceError(404, 'Slot not found');

      const slot = slotResult.rows[0];
      if (slot.is_booked) throw new ServiceError(409, 'Slot already booked');

      const slotDate = Number.isNaN(new Date(slot.date).getTime())
        ? String(slot.date).slice(0, 10)
        : new Date(slot.date).toISOString().slice(0, 10);
      const slotStart = String(slot.start_time).slice(0, 5);
      const slotEnd = String(slot.end_time).slice(0, 5);
      const slotLabel = `${slotStart}-${slotEnd}`;

      const availabilityCheck = await client.query(
        `SELECT 1
         FROM worker_availability wa
         WHERE wa.worker_id = $1
           AND wa.day_of_week = EXTRACT(DOW FROM $2::date)::int
           AND wa.start_time <= $3::time
           AND wa.end_time >= $4::time
         LIMIT 1`,
        [input.workerId, slotDate, slotStart, slotEnd]
      );
      if (!availabilityCheck.rows[0]) throw new ServiceError(409, 'Selected slot is outside worker availability');

      const blockedCheck = await client.query(
        'SELECT 1 FROM blocked_slots WHERE worker_id = $1 AND date = $2::date AND time_slot = $3 LIMIT 1',
        [input.workerId, slotDate, slotLabel]
      );
      if (blockedCheck.rows[0]) throw new ServiceError(409, 'Slot already booked');

      const coords = await geocodeAddress(input.address);
      const basePrice = worker.hourly_rate * 100;
      
      // Calculate surge pricing
      const customerPincode = (await client.query('SELECT pincode FROM users WHERE id = $1', [input.customerId])).rows[0]?.pincode;
      const pricingData = await calculateSurgePrice(basePrice, worker.category_id, customerPincode);
      const amount = pricingData.finalPrice;

      const bookingResult = await client.query(
        `INSERT INTO bookings (customer_id,worker_id,category_id,slot_id,description,address,lat,lng,scheduled_at,amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,($9::date + $10::time),$11)
         RETURNING *`,
        [input.customerId, input.workerId, worker.category_id, input.slotId, input.description || null, input.address, coords?.lat || null, coords?.lng || null, slotDate, slot.start_time, amount]
      );
      await client.query('UPDATE availability_slots SET is_booked = true WHERE id = $1', [input.slotId]);
      await client.query('COMMIT');

      const booking = bookingResult.rows[0];
      const customerResult = await query('SELECT name, email FROM users WHERE id = $1', [input.customerId]);
      const customer = customerResult.rows[0];
      if (customer?.email) {
        sendBookingConfirmation({
          customerName: customer.name || 'Customer',
          customerEmail: customer.email,
          workerName: worker.worker_name || 'Your worker',
          category: worker.category_name,
          scheduledAt: new Date(booking.scheduled_at).toLocaleString('en-IN'),
          address: input.address,
          bookingId: booking.id,
          amount,
        }).catch(console.error);
      }

      io.to(`worker:${input.workerId}`).emit('new_booking', {
        booking_id: booking.id,
        category: worker.category_name,
        address: input.address,
        scheduled_at: booking.scheduled_at,
        amount,
      });
      io.to('admin:dashboard').emit('admin:activity', {
        type: 'new_booking',
        booking_id: booking.id,
        category: worker.category_name,
        amount,
        ts: new Date().toISOString(),
      });
      await createNotification({
        userId: input.customerId,
        type: 'booking_confirmed',
        message: `Booking confirmed for ${worker.category_name} on ${new Date(booking.scheduled_at).toLocaleString('en-IN')}`,
        bookingId: booking.id,
      });
      io.to(`worker:${input.workerId}`).emit('booking_status_changed', {
        booking_id: booking.id,
        from: null,
        to: 'pending',
        changed_at: booking.requested_at || booking.created_at,
      });
      io.to(`customer:${input.customerId}`).emit('booking_status_changed', {
        booking_id: booking.id,
        from: null,
        to: 'pending',
        changed_at: booking.requested_at || booking.created_at,
      });

      return booking;
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      if (err instanceof ServiceError) throw err;
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505') {
        throw new ServiceError(409, 'Slot already booked');
      }
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await releaseLock(`slot:${input.slotId}`);
  }
}

export async function createAutoAssignedBooking(input: {
  customerId: string;
  categoryId: string;
  description?: string;
  address: string;
  scheduledAt?: string;
}) {
  const coords = await geocodeAddress(input.address);
  const requestedSchedule = input.scheduledAt ? new Date(input.scheduledAt) : new Date(Date.now() + 60 * 60 * 1000);
  const scheduledAt = Number.isNaN(requestedSchedule.getTime()) ? new Date(Date.now() + 60 * 60 * 1000) : requestedSchedule;

  const customerRow = await query('SELECT pincode FROM users WHERE id = $1', [input.customerId]);
  const customerPincode = customerRow.rows[0]?.pincode;

  const hasGeo = coords?.lat != null && coords?.lng != null;
  const distanceExpr = hasGeo
    ? `(6371 * acos(
        cos(radians(${coords!.lat}))
        * cos(radians(COALESCE(wp.current_lat, u.lat)))
        * cos(radians(COALESCE(wp.current_lng, u.lng)) - radians(${coords!.lng}))
        + sin(radians(${coords!.lat}))
        * sin(radians(COALESCE(wp.current_lat, u.lat)))
      ))`
    : 'NULL';

  const workerResult = await query(
    `SELECT
      wp.id,
      wp.hourly_rate,
      wp.category_id,
      u.name AS worker_name,
      c.name AS category_name,
      ${distanceExpr} AS distance_km
     FROM worker_profiles wp
     JOIN users u ON u.id = wp.user_id
     JOIN categories c ON c.id = wp.category_id
     WHERE wp.is_available = true
       AND u.is_active = true
       AND wp.category_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM bookings b
         WHERE b.worker_id = wp.id
           AND b.status IN ('pending', 'accepted', 'arriving', 'in_progress')
           AND ABS(EXTRACT(EPOCH FROM (b.scheduled_at - $2::timestamptz))) < 3600
       )
     ORDER BY distance_km ASC NULLS LAST, COALESCE(wp.rating, 0) DESC, wp.total_jobs DESC
     LIMIT 1`,
    [input.categoryId, scheduledAt.toISOString()]
  );

  const worker = workerResult.rows[0];
  if (!worker) throw new ServiceError(404, 'No available worker found nearby for this service');

  const basePrice = Number(worker.hourly_rate) * 100;
  const pricingData = await calculateSurgePrice(basePrice, worker.category_id, customerPincode);

  const bookingResult = await query(
    `INSERT INTO bookings (
       customer_id, worker_id, category_id, slot_id,
       description, address, lat, lng, scheduled_at, amount, status
     ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING *`,
    [
      input.customerId,
      worker.id,
      worker.category_id,
      input.description || null,
      input.address,
      coords?.lat || null,
      coords?.lng || null,
      scheduledAt.toISOString(),
      pricingData.finalPrice,
    ]
  );

  const booking = bookingResult.rows[0];
  io.to(`worker:${worker.id}`).emit('new_booking', {
    booking_id: booking.id,
    category: worker.category_name,
    address: input.address,
    scheduled_at: booking.scheduled_at,
    amount: booking.amount,
    status: 'REQUESTED',
  });
  io.to(`worker:${worker.id}`).emit('booking_status_changed', {
    booking_id: booking.id,
    from: null,
    to: 'pending',
    changed_at: booking.requested_at || booking.created_at,
  });

  io.to(`customer:${input.customerId}`).emit('booking_status_changed', {
    booking_id: booking.id,
    from: null,
    to: 'pending',
    changed_at: booking.requested_at || booking.created_at,
  });

  await createNotification({
    userId: input.customerId,
    type: 'booking_confirmed',
    message: `Worker request sent for ${worker.category_name}. We'll notify you once accepted.`,
    bookingId: booking.id,
  });

  return booking;
}

export async function listBookings(input: { userId: string; role: string; status?: string }) {
  const isWorker = input.role === 'worker';
  let userIdValue = input.userId;
  if (isWorker) {
    const wp = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [input.userId]);
    if (!wp.rows[0]) return [];
    userIdValue = wp.rows[0].id;
  }

  let sql = `SELECT b.*, cu.name as customer_name, cu.phone as customer_phone, wu.name as worker_name, wp.rating as worker_rating, c.name as category_name, c.icon as category_icon, c.slug as category_slug
    FROM bookings b JOIN users cu ON cu.id = b.customer_id JOIN worker_profiles wp ON wp.id = b.worker_id JOIN users wu ON wu.id = wp.user_id JOIN categories c ON c.id = b.category_id
    WHERE ${isWorker ? 'b.worker_id' : 'b.customer_id'} = $1`;
  const params: unknown[] = [userIdValue];
  if (input.status) {
    sql += ' AND b.status = $2';
    params.push(input.status);
  }
  sql += ' ORDER BY b.created_at DESC';
  return (await query(sql, params)).rows;
}

export async function getBookingById(id: string) {
  const r = await query(
    `SELECT b.*, cu.name as customer_name, cu.phone as customer_phone, wu.name as worker_name, wu.phone as worker_phone, wu.avatar_url as worker_avatar_url, wp.current_lat as worker_lat, wp.current_lng as worker_lng, wp.rating as worker_rating, c.name as category_name, c.icon as category_icon
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN worker_profiles wp ON wp.id = b.worker_id
     JOIN users wu ON wu.id = wp.user_id
     JOIN categories c ON c.id = b.category_id
     WHERE b.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

export async function cancelBooking(input: {
  bookingId: string;
  customerId: string;
  actorRole: string;
  reason?: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bookingResult = await client.query('SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 FOR UPDATE', [input.bookingId, input.customerId]);
    const booking = bookingResult.rows[0];
    if (!booking) throw new ServiceError(404, 'Booking not found');

    const fromStatus = booking.status as BookingStatus;
    const allowedCustomerStatuses: BookingStatus[] = ['pending', 'accepted', 'arriving', 'in_progress'];
    if (!allowedCustomerStatuses.includes(fromStatus)) throw new ServiceError(409, `Cannot cancel booking in ${fromStatus} state`);
    if (!canTransition(fromStatus, 'cancelled')) throw new ServiceError(409, `Invalid transition: ${fromStatus} → cancelled`);

    const refundAmount = calculateRefundAmount(Number(booking.amount || 0), fromStatus);
    let refundStatus: 'processed' | 'failed' | 'not_applicable' = 'not_applicable';
    let refundId: string | null = null;
    let refundError: string | null = null;

    if (Number(booking.amount || 0) > 0 && refundAmount > 0 && booking.payment_status === 'paid' && booking.razorpay_payment_id) {
      try {
        const refund = await razorpay.payments.refund(booking.razorpay_payment_id, {
          amount: refundAmount,
          notes: {
            booking_id: String(booking.id),
            cancellation_stage: fromStatus,
            cancelled_by: 'customer',
          },
        });
        refundStatus = 'processed';
        refundId = refund.id;
      } catch (err) {
        refundStatus = 'failed';
        refundError = err instanceof Error ? err.message : 'Refund failed';
      }
    }

    const tsCol = transitionTimestampColumn('cancelled');
    const updated = await client.query(
      `UPDATE bookings
       SET status = 'cancelled',
           cancellation_reason = $1,
           refund_amount = $3,
           refund_status = $4,
           razorpay_refund_id = $5,
           refund_processed_at = CASE WHEN $4 = 'processed' THEN NOW() ELSE refund_processed_at END,
           payment_status = CASE
             WHEN $4 = 'processed' AND $3 > 0 THEN 'refunded'::payment_status
             ELSE payment_status
           END,
           ${tsCol} = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [input.reason || null, input.bookingId, refundAmount, refundStatus, refundId]
    );

    await client.query(
      `INSERT INTO booking_audit_logs (booking_id, actor_user_id, actor_role, action, from_status, to_status, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        input.bookingId,
        input.customerId,
        input.actorRole,
        'booking.cancelled',
        fromStatus,
        'cancelled',
        input.reason || null,
        JSON.stringify({
          refund_rule: fromStatus,
          refund_amount: refundAmount,
          refund_status: refundStatus,
          razorpay_refund_id: refundId,
          refund_error: refundError,
          partial_refund_percent: PARTIAL_REFUND_PERCENT,
        }),
      ]
    );

    if (booking.slot_id) await client.query('UPDATE availability_slots SET is_booked = false WHERE id = $1', [booking.slot_id]);
    await client.query('COMMIT');

    io.to(`worker:${booking.worker_id}`).emit('booking_cancelled', { booking_id: input.bookingId, reason: input.reason || null });
    io.to(`worker:${booking.worker_id}`).emit('booking_status_changed', {
      booking_id: input.bookingId,
      from: fromStatus,
      to: 'cancelled',
      changed_at: updated.rows[0].updated_at,
      reason: input.reason || null,
    });
    io.to(`customer:${booking.customer_id}`).emit('booking_status_changed', {
      booking_id: input.bookingId,
      from: fromStatus,
      to: 'cancelled',
      changed_at: updated.rows[0].updated_at,
      reason: input.reason || null,
    });

    return {
      success: true,
      refund: {
        status: updated.rows[0].refund_status,
        amount: Number(updated.rows[0].refund_amount || 0),
        refund_id: updated.rows[0].razorpay_refund_id,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function raiseDispute(input: { bookingId: string; userId: string; reason: string }) {
  const bookingResult = await query('SELECT * FROM bookings WHERE id = $1', [input.bookingId]);
  const booking = bookingResult.rows[0];
  if (!booking) throw new ServiceError(404, 'Booking not found');
  if (booking.status === 'disputed') throw new ServiceError(400, 'Booking is already disputed');

  const isCustomer = booking.customer_id === input.userId;
  let isWorker = false;
  if (!isCustomer) {
    const workerProfile = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [input.userId]);
    isWorker = workerProfile.rows[0]?.id === booking.worker_id;
  }
  if (!isCustomer && !isWorker) throw new ServiceError(403, 'Not allowed to dispute this booking');

  const updated = await query(
    `UPDATE bookings
     SET status = 'disputed', cancellation_reason = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [input.bookingId, input.reason]
  );

  io.to(`worker:${booking.worker_id}`).emit('booking_disputed', { booking_id: input.bookingId, reason: input.reason });
  io.to(`customer:${booking.customer_id}`).emit('booking_disputed', { booking_id: input.bookingId, reason: input.reason });
  return updated.rows[0];
}
