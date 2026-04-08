import pool, { query } from '../db/client';
import { io } from '../index';
import { sendJobStartedNotification } from '../utils/resend';
import { canTransition, transitionTimestampColumn, type BookingStatus } from '../utils/bookingFsm';
import { createNotification } from '../utils/notifications';
import { ServiceError } from './serviceError';
import { logger } from '../utils/logger';

async function getWorkerProfileId(userId: string) {
  return (await query('SELECT id FROM worker_profiles WHERE user_id = $1', [userId])).rows[0]?.id || null;
}

async function transitionWorkerBooking(workerId: string, bookingId: string, toStatus: BookingStatus, reason?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bookingResult = await client.query('SELECT * FROM bookings WHERE id = $1 AND worker_id = $2 FOR UPDATE', [bookingId, workerId]);
    const booking = bookingResult.rows[0];
    if (!booking) throw new ServiceError(404, 'Booking not found');

    const fromStatus = booking.status as BookingStatus;
    if (!canTransition(fromStatus, toStatus)) throw new ServiceError(409, `Invalid transition: ${fromStatus} → ${toStatus}`);

    const tsCol = transitionTimestampColumn(toStatus);
    const setReason = toStatus === 'cancelled' ? ', cancellation_reason = $3' : '';
    const reasonParam = toStatus === 'cancelled' ? [reason || null] : [];

    const updated = await client.query(
      `UPDATE bookings
       SET status = $1,
           ${tsCol ? `${tsCol} = NOW(),` : ''}
           updated_at = NOW()
           ${setReason}
       WHERE id = $2
       RETURNING *`,
      toStatus === 'cancelled' ? [toStatus, bookingId, ...reasonParam] : [toStatus, bookingId]
    );

    if (toStatus === 'cancelled' && booking.slot_id) {
      await client.query('UPDATE availability_slots SET is_booked = false WHERE id = $1', [booking.slot_id]);
    }
    if (toStatus === 'completed') {
      await client.query('UPDATE worker_profiles SET total_jobs=total_jobs+1 WHERE id=$1', [workerId]);
    }

    await client.query('COMMIT');
    logger.info('job_state_changed', {
      bookingId,
      workerId,
      from: fromStatus,
      to: toStatus,
      reason: reason || null,
    });
    return { booking: updated.rows[0], fromStatus };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function acceptBooking(bookingId: string, userId: string) {
  logger.info('job_accept_attempt', { bookingId, userId });
  const wId = await getWorkerProfileId(userId);
  if (!wId) throw new ServiceError(403, 'Worker profile not found');

  const transitioned = await transitionWorkerBooking(wId, bookingId, 'accepted');
  const booking = transitioned.booking;
  io.to(`customer:${booking.customer_id}`).emit('booking_accepted', { booking_id: booking.id });
  io.to('admin:dashboard').emit('admin:activity', {
    type: 'booking_accepted',
    booking_id: booking.id,
    ts: new Date().toISOString(),
  });
  io.to(`customer:${booking.customer_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'accepted', changed_at: booking.updated_at });
  io.to(`worker:${booking.worker_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'accepted', changed_at: booking.updated_at });
  return booking;
}

export async function rejectBooking(bookingId: string, userId: string, reason?: string) {
  logger.info('job_reject_attempt', { bookingId, userId });
  const wId = await getWorkerProfileId(userId);
  if (!wId) throw new ServiceError(403, 'Worker profile not found');

  const resolvedReason = typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : 'Rejected by worker';
  const transitioned = await transitionWorkerBooking(wId, bookingId, 'cancelled', resolvedReason);
  const booking = transitioned.booking;

  io.to(`customer:${booking.customer_id}`).emit('booking_rejected', { booking_id: booking.id, reason: resolvedReason });
  io.to(`customer:${booking.customer_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'cancelled', changed_at: booking.updated_at, reason: resolvedReason });
  io.to(`worker:${booking.worker_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'cancelled', changed_at: booking.updated_at, reason: resolvedReason });
  return booking;
}

export async function markArriving(bookingId: string, userId: string) {
  logger.info('job_arriving_attempt', { bookingId, userId });
  const wId = await getWorkerProfileId(userId);
  if (!wId) throw new ServiceError(403, 'Worker profile not found');
  const transitioned = await transitionWorkerBooking(wId, bookingId, 'arriving');
  const booking = transitioned.booking;

  await createNotification({ userId: booking.customer_id, type: 'worker_arriving', message: 'Your worker is on the way.', bookingId: booking.id });
  io.to(`customer:${booking.customer_id}`).emit('worker_arriving', { booking_id: booking.id });
  io.to(`customer:${booking.customer_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'arriving', changed_at: booking.updated_at });
  io.to(`worker:${booking.worker_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'arriving', changed_at: booking.updated_at });
  return booking;
}

export async function startJob(bookingId: string, userId: string) {
  logger.info('job_start_attempt', { bookingId, userId });
  const wId = await getWorkerProfileId(userId);
  if (!wId) throw new ServiceError(403, 'Worker profile not found');
  const transitioned = await transitionWorkerBooking(wId, bookingId, 'in_progress');
  const booking = transitioned.booking;

  const emailData = await query(
    `SELECT cu.name AS customer_name, cu.email AS customer_email, wu.name AS worker_name
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN worker_profiles wp ON wp.id = b.worker_id
     JOIN users wu ON wu.id = wp.user_id
     WHERE b.id = $1`,
    [booking.id]
  );
  const row = emailData.rows[0];
  if (row?.customer_email) {
    sendJobStartedNotification({
      customerEmail: row.customer_email,
      customerName: row.customer_name || 'Customer',
      workerName: row.worker_name || 'Your worker',
      bookingId: booking.id,
      trackingUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${booking.id}`,
    }).catch(console.error);
  }

  io.to(`customer:${booking.customer_id}`).emit('job_started', { booking_id: booking.id });
  io.to(`customer:${booking.customer_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'in_progress', changed_at: booking.updated_at });
  io.to(`worker:${booking.worker_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'in_progress', changed_at: booking.updated_at });
  return booking;
}

export async function completeJob(bookingId: string, userId: string) {
  logger.info('job_complete_attempt', { bookingId, userId });
  const wId = await getWorkerProfileId(userId);
  if (!wId) throw new ServiceError(403, 'Worker profile not found');
  const transitioned = await transitionWorkerBooking(wId, bookingId, 'completed');
  const booking = transitioned.booking;

  io.to(`customer:${booking.customer_id}`).emit('job_completed', { booking_id: booking.id });
  io.to(`customer:${booking.customer_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'completed', changed_at: booking.updated_at });
  io.to(`worker:${booking.worker_id}`).emit('booking_status_changed', { booking_id: booking.id, from: transitioned.fromStatus, to: 'completed', changed_at: booking.updated_at });
  return booking;
}

export async function getWorkerEarnings(userId: string) {
  logger.info('job_earnings_fetch', { userId });
  const wId = await getWorkerProfileId(userId);
  if (!wId) throw new ServiceError(404, 'Worker profile not found');

  const r = await query(
    `SELECT
      COUNT(*)::int AS total_jobs,
      COALESCE(SUM(amount), 0) AS total_earnings,
      COALESCE(SUM(CASE WHEN DATE_TRUNC('day', completed_at) = DATE_TRUNC('day', NOW()) THEN amount ELSE 0 END), 0) AS today,
      COALESCE(SUM(CASE WHEN DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', NOW()) THEN amount ELSE 0 END), 0) AS this_month,
      COALESCE(SUM(CASE WHEN DATE_TRUNC('week', completed_at) = DATE_TRUNC('week', NOW()) THEN amount ELSE 0 END), 0) AS this_week,
      COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN amount ELSE 0 END), 0) AS pending_payouts
     FROM bookings
     WHERE worker_id = $1 AND status = 'completed'`,
    [wId]
  );
  return r.rows[0];
}

export async function getAvailableJobs(userId: string) {
  logger.info('job_available_fetch', { userId });
  const wId = await getWorkerProfileId(userId);
  if (!wId) throw new ServiceError(404, 'Worker profile not found');

  const result = await query(
    `SELECT
      b.id,
      'REQUESTED'::text AS status,
      b.scheduled_at,
      b.amount,
      b.address,
      b.created_at,
      cu.name AS customer_name,
      cu.phone AS customer_phone,
      c.name AS service_type,
      c.icon AS service_icon,
      to_char(s.start_time, 'HH24:MI') AS slot_start,
      to_char(s.end_time, 'HH24:MI') AS slot_end
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN categories c ON c.id = b.category_id
     LEFT JOIN availability_slots s ON s.id = b.slot_id
     WHERE b.worker_id = $1 AND b.status = 'pending'
     ORDER BY b.created_at DESC`,
    [wId]
  );

  return result.rows;
}
