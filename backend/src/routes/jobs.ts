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
