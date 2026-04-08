import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  getAvailableJobs,
  acceptBooking,
  rejectBooking,
  markArriving,
  startJob,
  completeJob,
  getWorkerEarnings,
} from '../services/jobService';
import { asServiceError } from '../services/serviceError';
import { createNotification } from '../utils/notifications';
import { query } from '../db/client';

const router = Router();
const bookingIdParamsSchema = z.object({ bookingId: z.string().uuid() });
const rejectBodySchema = z.object({ reason: z.string().max(300).optional() });

router.get('/available', requireAuth, requireRole('worker'), async (req, res) => {
  try {
    const jobs = await getAvailableJobs(req.user!.userId);
    return res.json(jobs);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'GET /jobs/available' });
    return res.status(e.status).json({ error: e.message });
  }
});

router.post('/:bookingId/accept', requireAuth, requireRole('worker'), async (req, res) => {
  const parsedParams = bookingIdParamsSchema.safeParse(req.params);
  if (!parsedParams.success) return res.status(400).json({ error: 'Invalid booking id' });
  try {
    const booking = await acceptBooking(parsedParams.data.bookingId, req.user!.userId);

    const categoryResult = await query('SELECT name FROM categories WHERE id = $1', [booking.category_id]);
    const categoryName = categoryResult.rows[0]?.name || 'service';
    createNotification({
      userId: booking.customer_id,
      type: 'booking_accepted',
      message: `Your ${categoryName} booking has been accepted. The worker is on the way soon.`,
      bookingId: booking.id,
    }).catch(console.error);

    return res.json(booking);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /jobs/:bookingId/accept', bookingId: req.params.bookingId });
    return res.status(e.status).json({ error: e.message });
  }
});

router.post('/:bookingId/reject', requireAuth, requireRole('worker'), async (req, res) => {
  const parsedParams = bookingIdParamsSchema.safeParse(req.params);
  if (!parsedParams.success) return res.status(400).json({ error: 'Invalid booking id' });
  const parsedBody = rejectBodySchema.safeParse(req.body);
  if (!parsedBody.success) return res.status(400).json({ error: 'Invalid reject payload' });
  try {
    const booking = await rejectBooking(parsedParams.data.bookingId, req.user!.userId, parsedBody.data.reason);
    return res.json(booking);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /jobs/:bookingId/reject', bookingId: req.params.bookingId });
    return res.status(e.status).json({ error: e.message });
  }
});

router.post('/:bookingId/arriving', requireAuth, requireRole('worker'), async (req, res) => {
  const parsedParams = bookingIdParamsSchema.safeParse(req.params);
  if (!parsedParams.success) return res.status(400).json({ error: 'Invalid booking id' });
  try {
    const booking = await markArriving(parsedParams.data.bookingId, req.user!.userId);
    return res.json(booking);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /jobs/:bookingId/arriving', bookingId: req.params.bookingId });
    return res.status(e.status).json({ error: e.message });
  }
});

router.post('/:bookingId/start', requireAuth, requireRole('worker'), async (req, res) => {
  const parsedParams = bookingIdParamsSchema.safeParse(req.params);
  if (!parsedParams.success) return res.status(400).json({ error: 'Invalid booking id' });
  try {
    const booking = await startJob(parsedParams.data.bookingId, req.user!.userId);
    createNotification({
      userId: booking.customer_id,
      type: 'job_started',
      message: 'Your worker has started and is heading to your location.',
      bookingId: booking.id,
    }).catch(console.error);
    return res.json(booking);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /jobs/:bookingId/start', bookingId: req.params.bookingId });
    return res.status(e.status).json({ error: e.message });
  }
});

router.post('/:bookingId/complete', requireAuth, requireRole('worker'), async (req, res) => {
  const parsedParams = bookingIdParamsSchema.safeParse(req.params);
  if (!parsedParams.success) return res.status(400).json({ error: 'Invalid booking id' });
  try {
    const booking = await completeJob(parsedParams.data.bookingId, req.user!.userId);
    createNotification({
      userId: booking.customer_id,
      type: 'job_completed',
      message: 'Job completed! Please rate your experience.',
      bookingId: booking.id,
    }).catch(console.error);
    return res.json(booking);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /jobs/:bookingId/complete', bookingId: req.params.bookingId });
    return res.status(e.status).json({ error: e.message });
  }
});

router.get('/earnings', requireAuth, requireRole('worker'), async (req, res) => {
  try {
    const earnings = await getWorkerEarnings(req.user!.userId);
    return res.json(earnings);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'GET /jobs/earnings' });
    return res.status(e.status).json({ error: e.message });
  }
});

export default router;
