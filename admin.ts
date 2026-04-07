import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// All admin routes require admin role
router.use(requireAuth, requireRole('admin'));

// ─── GET /api/admin/stats ─────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  const [bookings, users, workers, revenue] = await Promise.all([
    query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as today
      FROM bookings
    `),
    query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN role = 'customer' THEN 1 END) as customers,
        COUNT(CASE WHEN role = 'worker' THEN 1 END) as workers,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_this_week
      FROM users
    `),
    query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN is_available = true THEN 1 END) as available,
        ROUND(AVG(rating)::numeric, 2) as avg_rating
      FROM worker_profiles
    `),
    query(`
      SELECT
        COALESCE(SUM(amount), 0) as total_gmv,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', NOW()) THEN amount ELSE 0 END), 0) as this_month_gmv
      FROM bookings
      WHERE status = 'completed' AND payment_status = 'paid'
    `),
  ]);

  return res.json({
    bookings: bookings.rows[0],
    users: users.rows[0],
    workers: workers.rows[0],
    revenue: revenue.rows[0],
  });
});

// ─── GET /api/admin/bookings ──────────────────────────────
router.get('/bookings', async (req: Request, res: Response) => {
  const { status, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT
      b.*,
      cu.name as customer_name, cu.phone as customer_phone,
      wu.name as worker_name, wu.phone as worker_phone,
      c.name as category_name
    FROM bookings b
    JOIN users cu ON cu.id = b.customer_id
    JOIN worker_profiles wp ON wp.id = b.worker_id
    JOIN users wu ON wu.id = wp.user_id
    JOIN categories c ON c.id = b.category_id
  `;
  const params: unknown[] = [];
  if (status) { sql += ' WHERE b.status = $1'; params.push(status); }
  sql += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(Number(limit), Number(offset));

  const result = await query(sql, params);
  return res.json(result.rows);
});

// ─── GET /api/admin/workers ───────────────────────────────
router.get('/workers', async (_req: Request, res: Response) => {
  const result = await query(`
    SELECT wp.*, u.name, u.phone, u.email, u.is_active, c.name as category_name
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    JOIN categories c ON c.id = wp.category_id
    ORDER BY wp.created_at DESC
  `);
  return res.json(result.rows);
});

// ─── PATCH /api/admin/workers/:id/verify ─────────────────
router.patch('/workers/:id/verify', async (req: Request, res: Response) => {
  await query(
    'UPDATE worker_profiles SET is_background_verified = true WHERE id = $1',
    [req.params.id]
  );
  return res.json({ success: true });
});

// ─── PATCH /api/admin/bookings/:id/dispute ────────────────
router.patch('/bookings/:id/dispute', async (req: Request, res: Response) => {
  const { resolution } = req.body;
  await query(
    `UPDATE bookings SET status = $1 WHERE id = $2`,
    [resolution === 'complete' ? 'completed' : 'cancelled', req.params.id]
  );
  return res.json({ success: true });
});

export default router;
