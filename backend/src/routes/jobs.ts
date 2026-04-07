import { Router } from 'express';
import { query } from '../db/client';
import pool from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { io } from '../index';
import { sendJobStartedNotification } from '../utils/resend';

const router = Router();

async function getWId(userId: string) { return (await query('SELECT id FROM worker_profiles WHERE user_id = $1', [userId])).rows[0]?.id || null; }

router.post('/:bookingId/accept', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(403).json({ error: 'Worker profile not found' });
  const r = await query(`UPDATE bookings SET status='accepted', accepted_at=NOW() WHERE id=$1 AND worker_id=$2 AND status='pending' RETURNING *`, [req.params.bookingId, wId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  io.to(`customer:${r.rows[0].customer_id}`).emit('booking_accepted', { booking_id: r.rows[0].id });
  return res.json(r.rows[0]);
});

router.post('/:bookingId/reject', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(403).json({ error: 'Worker profile not found' });

  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
    ? req.body.reason.trim()
    : 'Rejected by worker';

  const r = await query(
    `UPDATE bookings
     SET status='cancelled', cancellation_reason=$3, updated_at=NOW()
     WHERE id=$1 AND worker_id=$2 AND status='pending'
     RETURNING *`,
    [req.params.bookingId, wId, reason]
  );

  if (!r.rows[0]) return res.status(404).json({ error: 'Pending booking not found' });

  if (r.rows[0].slot_id) {
    await query('UPDATE availability_slots SET is_booked=false WHERE id=$1', [r.rows[0].slot_id]);
  }

  io.to(`customer:${r.rows[0].customer_id}`).emit('booking_rejected', {
    booking_id: r.rows[0].id,
    reason,
  });

  return res.json(r.rows[0]);
});

router.post('/:bookingId/start', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(403).json({ error: 'Worker profile not found' });
  const r = await query(`UPDATE bookings SET status='in_progress', started_at=NOW() WHERE id=$1 AND worker_id=$2 AND status='accepted' RETURNING *`, [req.params.bookingId, wId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not in accepted state' });
  const emailData = await query(
    `SELECT cu.name AS customer_name, cu.email AS customer_email, wu.name AS worker_name
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN worker_profiles wp ON wp.id = b.worker_id
     JOIN users wu ON wu.id = wp.user_id
     WHERE b.id = $1`,
    [r.rows[0].id]
  );
  const row = emailData.rows[0];
  if (row?.customer_email) {
    sendJobStartedNotification({
      customerEmail: row.customer_email,
      customerName: row.customer_name || 'Customer',
      workerName: row.worker_name || 'Your worker',
      bookingId: r.rows[0].id,
      trackingUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${r.rows[0].id}`,
    }).catch(console.error);
  }
  io.to(`customer:${r.rows[0].customer_id}`).emit('job_started', { booking_id: r.rows[0].id });
  return res.json(r.rows[0]);
});

router.post('/:bookingId/complete', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(403).json({ error: 'Worker profile not found' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`UPDATE bookings SET status='completed', completed_at=NOW() WHERE id=$1 AND worker_id=$2 AND status='in_progress' RETURNING *`, [req.params.bookingId, wId]);
    if (!r.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not in progress' }); }
    await client.query('UPDATE worker_profiles SET total_jobs=total_jobs+1 WHERE id=$1', [wId]);
    await client.query('COMMIT');
    io.to(`customer:${r.rows[0].customer_id}`).emit('job_completed', { booking_id: r.rows[0].id });
    return res.json(r.rows[0]);
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});

router.get('/earnings', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(404).json({ error: 'Worker profile not found' });
  const r = await query(`SELECT COUNT(*) as total_jobs, COALESCE(SUM(amount),0) as total_earnings, COALESCE(SUM(CASE WHEN DATE_TRUNC('month',completed_at)=DATE_TRUNC('month',NOW()) THEN amount ELSE 0 END),0) as this_month, COALESCE(SUM(CASE WHEN DATE_TRUNC('week',completed_at)=DATE_TRUNC('week',NOW()) THEN amount ELSE 0 END),0) as this_week FROM bookings WHERE worker_id=$1 AND status='completed' AND payment_status='paid'`, [wId]);
  return res.json(r.rows[0]);
});

export default router;
