import { Router } from 'express';
import { query } from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('admin'));
router.get('/stats', async (_req, res) => {
  const [b,u,w,r] = await Promise.all([
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status='pending' THEN 1 END) as pending, COUNT(CASE WHEN status='in_progress' THEN 1 END) as in_progress, COUNT(CASE WHEN status='completed' THEN 1 END) as completed, COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as today FROM bookings`),
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN role='customer' THEN 1 END) as customers, COUNT(CASE WHEN role='worker' THEN 1 END) as workers, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_this_week FROM users`),
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN is_available=true THEN 1 END) as available, ROUND(AVG(rating)::numeric,2) as avg_rating FROM worker_profiles`),
    query(`SELECT COALESCE(SUM(amount),0) as total_gmv, COALESCE(SUM(CASE WHEN DATE_TRUNC('month',completed_at)=DATE_TRUNC('month',NOW()) THEN amount ELSE 0 END),0) as this_month_gmv FROM bookings WHERE status='completed' AND payment_status='paid'`),
  ]);
  return res.json({ bookings: b.rows[0], users: u.rows[0], workers: w.rows[0], revenue: r.rows[0] });
});
router.get('/bookings', async (req, res) => {
  const { status, limit=50, offset=0 } = req.query;
  let sql = `SELECT b.*, cu.name as customer_name, wu.name as worker_name, c.name as category_name FROM bookings b JOIN users cu ON cu.id=b.customer_id JOIN worker_profiles wp ON wp.id=b.worker_id JOIN users wu ON wu.id=wp.user_id JOIN categories c ON c.id=b.category_id`;
  const params: unknown[] = [];
  if (status) { sql += ' WHERE b.status=$1'; params.push(status); }
  sql += ` ORDER BY b.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`; params.push(Number(limit),Number(offset));
  return res.json((await query(sql,params)).rows);
});
router.get('/workers', async (_req, res) => res.json((await query(`SELECT wp.*, u.name, u.phone, u.email, u.is_active, c.name as category_name FROM worker_profiles wp JOIN users u ON u.id=wp.user_id JOIN categories c ON c.id=wp.category_id ORDER BY wp.created_at DESC`)).rows));
router.patch('/workers/:id/verify', async (req, res) => { await query('UPDATE worker_profiles SET is_background_verified=true WHERE id=$1', [req.params.id]); return res.json({ success: true }); });

router.get('/disputes', async (_req, res) => {
  const r = await query(
    `SELECT b.*, cu.name as customer_name, wu.name as worker_name, c.name as category_name
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN worker_profiles wp ON wp.id = b.worker_id
     JOIN users wu ON wu.id = wp.user_id
     JOIN categories c ON c.id = b.category_id
     WHERE b.status = 'disputed'
     ORDER BY b.updated_at DESC`
  );
  return res.json(r.rows);
});

router.patch('/bookings/:id/resolve', async (req, res) => {
  const resolution = req.body?.resolution === 'cancelled' ? 'cancelled' : 'completed';
  const r = await query(
    `UPDATE bookings
     SET status = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'disputed'
     RETURNING *`,
    [req.params.id, resolution]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Dispute not found' });
  return res.json(r.rows[0]);
});

export default router;
