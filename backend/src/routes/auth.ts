import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { storeOtp, getOtp, deleteOtp } from '../db/redis';
import { sendOtp, verifyOtp } from '../utils/msg91';
import { signToken, requireAuth } from '../middleware/auth';
import { otpLimiter } from '../middleware/rateLimiter';
import { resolvePincode } from '../utils/maps';

const router = Router();

router.post('/send-otp', otpLimiter, async (req: Request, res: Response) => {
  const schema = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid phone number' });
  const { phone } = parsed.data;
  if (process.env.NODE_ENV === 'development') {
    try {
      await storeOtp(phone, '123456');
    } catch (err) {
      console.warn('Dev OTP store failed, continuing with static fallback:', err);
    }
    return res.json({ success: true, dev_otp: '123456' });
  }
  const sent = await sendOtp(phone);
  if (!sent) return res.status(500).json({ error: 'Failed to send OTP' });
  return res.json({ success: true });
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      phone: z.string().regex(/^[6-9]\d{9}$/), otp: z.string().length(6),
      name: z.string().optional(), role: z.enum(['customer', 'worker']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { phone, otp, name, role } = parsed.data;
    let valid = false;
    if (process.env.NODE_ENV === 'development') {
      try {
        const storedOtp = await getOtp(phone);
        valid = storedOtp === otp || otp === '123456';
      } catch (err) {
        console.warn('Dev OTP verify fallback used because Redis read failed:', err);
        valid = otp === '123456';
      }
    } else {
      valid = await verifyOtp(phone, otp);
    }
    if (!valid) return res.status(401).json({ error: 'Invalid OTP' });
    try {
      await deleteOtp(phone);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Dev OTP cleanup skipped because Redis delete failed:', err);
      } else {
        throw err;
      }
    }
    const existing = await query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user = existing.rows[0];
    if (!user) {
      const result = await query('INSERT INTO users (phone, name, role) VALUES ($1,$2,$3) RETURNING *', [phone, name||null, role||'customer']);
      user = result.rows[0];
    }
    const token = signToken({ userId: user.id, phone: user.phone, role: user.role });
    return res.json({ token, user: { id: user.id, phone: user.phone, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Verify OTP failed:', err);
    return res.status(500).json({ error: 'Server error while verifying OTP' });
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    `SELECT u.*, wp.id as worker_profile_id, wp.is_available, wp.rating, wp.total_jobs
     FROM users u LEFT JOIN worker_profiles wp ON wp.user_id = u.id WHERE u.id = $1`,
    [req.user!.userId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  return res.json(result.rows[0]);
});

router.patch('/profile', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string().min(2).optional(), email: z.string().email().optional(), pincode: z.string().length(6).optional(), role: z.enum(['customer', 'worker', 'admin']).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' });
  const { name, email, pincode, role } = parsed.data;
  const updates: string[] = []; const values: unknown[] = []; let idx = 1;
  if (name) { updates.push(`name = $${idx++}`); values.push(name); }
  if (email) { updates.push(`email = $${idx++}`); values.push(email); }
  if (role) { updates.push(`role = $${idx++}`); values.push(role); }
  if (pincode) {
    updates.push(`pincode = $${idx++}`); values.push(pincode);
    const loc = await resolvePincode(pincode);
    if (loc) { updates.push(`city = $${idx++}`, `locality = $${idx++}`); values.push(loc.city, loc.locality); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(req.user!.userId);
  const result = await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
  return res.json(result.rows[0]);
});

export default router;
