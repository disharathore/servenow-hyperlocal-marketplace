import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  createBooking,
  createAutoAssignedBooking,
  listBookings,
  getBookingById,
  cancelBooking,
  raiseDispute,
} from '../services/bookingService';
import { asServiceError } from '../services/serviceError';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    worker_id: z.string().uuid().optional(),
    slot_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    scheduled_at: z.string().datetime().optional(),
    description: z.string().optional(),
    address: z.string().min(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking data' });

  try {
    const isManualBooking = Boolean(parsed.data.worker_id && parsed.data.slot_id);
    const isAutoBooking = Boolean(parsed.data.category_id);

    if (!isManualBooking && !isAutoBooking) {
      return res.status(400).json({ error: 'Provide either worker_id+slot_id or category_id for auto assignment' });
    }

    const booking = isManualBooking
      ? await createBooking({
        customerId: req.user!.userId,
        workerId: parsed.data.worker_id!,
        slotId: parsed.data.slot_id!,
        description: parsed.data.description,
        address: parsed.data.address,
      })
      : await createAutoAssignedBooking({
        customerId: req.user!.userId,
        categoryId: parsed.data.category_id!,
        description: parsed.data.description,
        address: parsed.data.address,
        scheduledAt: parsed.data.scheduled_at,
      });

    return res.status(201).json(booking);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /bookings' });
    return res.status(e.status).json({ error: e.message });
  }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    status: z.enum(['pending', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled', 'disputed']).optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid bookings query' });
  const rows = await listBookings({ userId: req.user!.userId, role: req.user!.role, status: parsed.data.status });
  return res.json(rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const booking = await getBookingById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  return res.json(booking);
});

router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const schema = z.object({ reason: z.string().max(500).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid cancel payload' });
  try {
    const result = await cancelBooking({
      bookingId: req.params.id,
      customerId: req.user!.userId,
      actorRole: req.user!.role,
      reason: parsed.data.reason,
    });
    return res.json(result);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'PATCH /bookings/:id/cancel', bookingId: req.params.id });
    return res.status(e.status).json({ error: e.message });
  }
});

router.patch('/:id/dispute', requireAuth, async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length < 10) return res.status(400).json({ error: 'Please provide a dispute reason (min 10 chars)' });

  try {
    const updated = await raiseDispute({ bookingId: req.params.id, userId: req.user!.userId, reason });
    return res.json(updated);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'PATCH /bookings/:id/dispute', bookingId: req.params.id });
    return res.status(e.status).json({ error: e.message });
  }
});

export default router;
