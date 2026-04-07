import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { sendJobStartedNotification } from '../utils/resend';
import { io } from '../index';

const router = Router();

// Helper to get worker profile id from user id
async function getWorkerProfileId(userId: string): Promise<string | null> {
  const r = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [userId]);
  return r.rows[0]?.id || null;
}

// ─── POST /api/jobs/:bookingId/accept ─────────────────────
router.post('/:bookingId/accept', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const workerId = await getWorkerProfileId(req.user!.userId);
  if (!workerId) return res.status(403).json({ error: 'Worker profile not found' });

  const result = await query(
    `UPDATE bookings
     SET status = 'accepted', accepted_at = NOW()
     WHERE id = $1 AND worker_id = $2 AND status = 'pending'
     RETURNING *`,
    [req.params.bookingId, workerId]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Booking not found or already actioned' });

  // Notify customer
  io.to(`customer:${result.rows[0].customer_id}`).emit('booking_accepted', {
    booking_id: result.rows[0].id,
    worker_id: workerId,
  });

  return res.json(result.rows[0]);
});

// ─── POST /api/jobs/:bookingId/start ──────────────────────
router.post('/:bookingId/start', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const workerId = await getWorkerProfileId(req.user!.userId);
  if (!workerId) return res.status(403).json({ error: 'Worker profile not found' });

  const result = await query(
    `UPDATE bookings
     SET status = 'in_progress', started_at = NOW()
     WHERE id = $1 AND worker_id = $2 AND status = 'accepted'
     RETURNING *`,
    [req.params.bookingId, workerId]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Booking not found or not in accepted state' });

  const booking = result.rows[0];

  // Notify customer via Socket.io (triggers live tracking UI)
  io.to(`customer:${booking.customer_id}`).emit('job_started', {
    booking_id: booking.id,
    worker_id: workerId,
  });

  // Send email with tracking link
  const customerResult = await query(
    'SELECT name, email FROM users WHERE id = $1',
    [booking.customer_id]
  );
  const workerUserResult = await query(
    'SELECT name FROM users WHERE id = $1',
    [req.user!.userId]
  );

  if (customerResult.rows[0]?.email) {
    sendJobStartedNotification({
      customerEmail: customerResult.rows[0].email,
      customerName: customerResult.rows[0].name || 'Customer',
      workerName: workerUserResult.rows[0]?.name || 'Worker',
      bookingId: booking.id,
      trackingUrl: `${process.env.FRONTEND_URL}/track/${booking.id}`,
    }).catch(console.error);
  }

  return res.json(booking);
});

// ─── POST /api/jobs/:bookingId/complete ───────────────────
router.post('/:bookingId/complete', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const workerId = await getWorkerProfileId(req.user!.userId);
  if (!workerId) return res.status(403).json({ error: 'Worker profile not found' });

  const client = await (await import('../db/client')).default.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE bookings
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1 AND worker_id = $2 AND status = 'in_progress'
       RETURNING *`,
      [req.params.bookingId, workerId]
    );

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found or not in progress' });
    }

    // Increment worker total_jobs
    await client.query(
      'UPDATE worker_profiles SET total_jobs = total_jobs + 1 WHERE id = $1',
      [workerId]
    );

    await client.query('COMMIT');

    const booking = result.rows[0];

    // Notify customer — prompt them to review
    io.to(`customer:${booking.customer_id}`).emit('job_completed', {
      booking_id: booking.id,
      worker_id: workerId,
    });

    return res.json(booking);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ─── GET /api/jobs/earnings ───────────────────────────────
router.get('/earnings', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const workerId = await getWorkerProfileId(req.user!.userId);
  if (!workerId) return res.status(404).json({ error: 'Worker profile not found' });

  const result = await query(
    `SELECT
       COUNT(*) as total_jobs,
       COALESCE(SUM(amount), 0) as total_earnings,
       COALESCE(SUM(CASE WHEN DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', NOW()) THEN amount ELSE 0 END), 0) as this_month,
       COALESCE(SUM(CASE WHEN DATE_TRUNC('week', completed_at) = DATE_TRUNC('week', NOW()) THEN amount ELSE 0 END), 0) as this_week
     FROM bookings
     WHERE worker_id = $1 AND status = 'completed' AND payment_status = 'paid'`,
    [workerId]
  );

  return res.json(result.rows[0]);
});

export default router;
