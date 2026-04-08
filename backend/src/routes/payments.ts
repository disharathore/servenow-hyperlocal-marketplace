import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  createPaymentOrder,
  verifyPayment,
  releasePaymentSession,
  processPaymentWebhook,
} from '../services/paymentService';
import { asServiceError } from '../services/serviceError';

const router = Router();
const createOrderSchema = z.object({ booking_id: z.string().uuid() });
const verifySchema = z.object({
  razorpay_order_id: z.string().min(5),
  razorpay_payment_id: z.string().min(5),
  razorpay_signature: z.string().min(10),
  booking_id: z.string().uuid(),
});
const releaseLockSchema = z.object({ booking_id: z.string().uuid() });

router.post('/create-order', requireAuth, async (req: Request, res: Response) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payment order request' });
  try {
    const payload = await createPaymentOrder({ bookingId: parsed.data.booking_id, customerId: req.user!.userId });
    return res.json(payload);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /payments/create-order' });
    return res.status(e.status).json({ error: e.message });
  }
});

router.post('/verify', requireAuth, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payment verification request' });
  try {
    const result = await verifyPayment(parsed.data);
    return res.json(result);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /payments/verify', bookingId: parsed.data.booking_id });
    return res.status(e.status).json({ error: e.message });
  }
});

router.post('/release-lock', requireAuth, async (req: Request, res: Response) => {
  const parsed = releaseLockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid release-lock request' });
  try {
    const result = await releasePaymentSession({ bookingId: parsed.data.booking_id, customerId: req.user!.userId });
    return res.json(result);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /payments/release-lock', bookingId: parsed.data.booking_id });
    return res.status(e.status).json({ error: e.message });
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const result = await processPaymentWebhook({
      signature: req.headers['x-razorpay-signature'] as string,
      body: req.body as Buffer,
    });
    return res.json(result);
  } catch (err) {
    const e = asServiceError(err, { requestId: req.requestId, route: 'POST /payments/webhook' });
    return res.status(e.status).json({ error: e.message });
  }
});

export default router;
