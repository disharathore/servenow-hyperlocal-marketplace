import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query } from '../db/client';
import { storeOtp, getOtp, deleteOtp } from '../db/redis';
import { sendOtp, verifyOtp } from '../utils/msg91';
import { signToken, requireAuth, signRefreshToken, verifyRefreshToken } from '../middleware/auth';
import { otpLimiter, otpVerifyLimiter } from '../middleware/rateLimiter';
import { resolvePincode } from '../utils/maps';
import { demoDemoLogin } from '../services/demoService';

const router = Router();
const isDemoOtpMode = process.env.OTP_MODE === 'demo' || process.env.NODE_ENV === 'development';

const refreshHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

async function issueAuthTokens(user: { id: string; phone: string; role: string }) {
  const accessToken = signToken({ userId: user.id, phone: user.phone, role: user.role });
  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ userId: user.id, tokenId, type: 'refresh' });

  const expiresInMs = (() => {
    const v = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
    if (v.endsWith('d')) return Number(v.slice(0, -1)) * 24 * 60 * 60 * 1000;
    if (v.endsWith('h')) return Number(v.slice(0, -1)) * 60 * 60 * 1000;
    if (v.endsWith('m')) return Number(v.slice(0, -1)) * 60 * 1000;
    return 30 * 24 * 60 * 60 * 1000;
  })();
  const expiresAt = new Date(Date.now() + expiresInMs);

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenId, user.id, refreshHash(refreshToken), expiresAt]
  );

  return { token: accessToken, refresh_token: refreshToken };
}

router.post('/send-otp', otpLimiter, async (req: Request, res: Response) => {
  const schema = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid phone number' });
  const { phone } = parsed.data;
  if (isDemoOtpMode) {
    try {
      await storeOtp(phone, '123456');
    } catch (err) {
      console.warn('Demo OTP store failed, continuing with static fallback:', err);
    }
    return res.json({ success: true, dev_otp: '123456' });
  }
  const sent = await sendOtp(phone);
  if (!sent) return res.status(500).json({ error: 'Failed to send OTP' });
  return res.json({ success: true });
});

router.post('/verify-otp', otpVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      phone: z.string().regex(/^[6-9]\d{9}$/), otp: z.string().length(6),
      name: z.string().optional(), role: z.enum(['customer', 'worker']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { phone, otp, name, role } = parsed.data;
    let valid = false;
    if (isDemoOtpMode) {
      try {
        const storedOtp = await getOtp(phone);
        valid = storedOtp === otp || otp === '123456';
      } catch (err) {
        console.warn('Demo OTP verify fallback used because Redis read failed:', err);
        valid = otp === '123456';
      }
    } else {
      valid = await verifyOtp(phone, otp);
    }
    if (!valid) return res.status(401).json({ error: 'Invalid OTP' });
    try {
      await deleteOtp(phone);
    } catch (err) {
      if (isDemoOtpMode) {
        console.warn('Demo OTP cleanup skipped because Redis delete failed:', err);
      } else {
        throw err;
      }
    }
    const existing = await query('SELECT * FROM users WHERE phone = $1', [phone]);
    let user = existing.rows[0];
    if (user && user.is_active === false) {
      return res.status(403).json({ error: 'Account is banned. Contact support.' });
    }
    if (!user) {
      const result = await query('INSERT INTO users (phone, name, role) VALUES ($1,$2,$3) RETURNING *', [phone, name||null, role||'customer']);
      user = result.rows[0];
    }
    const tokens = await issueAuthTokens({ id: user.id, phone: user.phone, role: user.role });
    return res.json({ ...tokens, user: { id: user.id, phone: user.phone, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Verify OTP failed:', err);
    return res.status(500).json({ error: 'Server error while verifying OTP' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  const schema = z.object({ refresh_token: z.string().min(20) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid refresh token request' });

  try {
    const payload = verifyRefreshToken(parsed.data.refresh_token);
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

    const tokenRow = await query(
      `SELECT * FROM refresh_tokens
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
      [payload.tokenId, payload.userId]
    );
    const stored = tokenRow.rows[0];
    if (!stored) return res.status(401).json({ error: 'Refresh token expired or revoked' });
    if (stored.token_hash !== refreshHash(parsed.data.refresh_token)) return res.status(401).json({ error: 'Refresh token mismatch' });

    const userResult = await query('SELECT id, phone, role, is_active FROM users WHERE id = $1', [payload.userId]);
    const user = userResult.rows[0];
    if (!user || user.is_active === false) return res.status(403).json({ error: 'User is not active' });

    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [payload.tokenId]);
    const tokens = await issueAuthTokens({ id: user.id, phone: user.phone, role: user.role });
    return res.json(tokens);
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ refresh_token: z.string().min(20) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid logout request' });

  try {
    const payload = verifyRefreshToken(parsed.data.refresh_token);
    if (payload.userId !== req.user!.userId) return res.status(403).json({ error: 'Token user mismatch' });
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND user_id = $2', [payload.tokenId, payload.userId]);
  } catch {
    return res.status(200).json({ success: true });
  }
  return res.json({ success: true });
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

// Demo Login - Skip OTP verification
router.post('/demo-login', async (req: Request, res: Response) => {
  const schema = z.object({ type: z.enum(['customer', 'worker']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid demo type' });

  try {
    const result = await demoDemoLogin(parsed.data.type);
    return res.json(result);
  } catch (err) {
    console.error('Demo login error:', err);
    return res.status(500).json({ error: (err as Error).message || 'Demo login failed' });
  }
});

export default router;
