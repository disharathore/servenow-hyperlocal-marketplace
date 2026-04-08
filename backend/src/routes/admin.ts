import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { getHeatmapData, getRealTimeDemandMap, getSupplyDistribution, getTopCitiesByDemand } from '../services/heatmapService';
import { io } from '../index';

const router = Router();
const bookingListQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled', 'disputed']).optional(),
  real_only: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
const workerVerifyParamsSchema = z.object({ id: z.string().uuid() });
const workerVerifyBodySchema = z.object({ approved: z.boolean().optional() });
const usersQuerySchema = z.object({ role: z.enum(['customer', 'worker']).optional() });
const userBanParamsSchema = z.object({ id: z.string().uuid() });
const userBanBodySchema = z.object({ is_active: z.boolean() });
const resolveParamsSchema = z.object({ id: z.string().uuid() });
const resolveBodySchema = z.object({ resolution: z.enum(['completed', 'cancelled']) });
router.use(requireAuth, requireRole('admin'));
router.get('/stats', async (_req, res) => {
  const [b,u,w,r] = await Promise.all([
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status='pending' THEN 1 END) as pending, COUNT(CASE WHEN status='in_progress' THEN 1 END) as in_progress, COUNT(CASE WHEN status='completed' THEN 1 END) as completed, COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as today FROM bookings`),
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN role='customer' THEN 1 END) as customers, COUNT(CASE WHEN role='worker' THEN 1 END) as workers, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_this_week FROM users`),
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN is_available=true THEN 1 END) as available, ROUND(AVG(rating)::numeric,2) as avg_rating FROM worker_profiles`),
    query(`SELECT COALESCE(SUM(amount),0) as total_gmv, COALESCE(SUM(CASE WHEN DATE_TRUNC('month',completed_at)=DATE_TRUNC('month',NOW()) THEN amount ELSE 0 END),0) as this_month_gmv FROM bookings WHERE status='completed' AND payment_status='paid'`),
  ]);
  return res.json({
    bookings: b.rows[0],
    users: u.rows[0],
    workers: w.rows[0],
    revenue: r.rows[0],
    dashboard_metrics: {
      total_bookings: Number(b.rows[0]?.total || 0),
      revenue: Number(r.rows[0]?.total_gmv || 0),
      active_workers: Number(w.rows[0]?.available || 0),
    },
  });
});

router.get('/showcase', async (_req, res) => {
  const [metricsResult, bookingsPerDayResult, topServicesResult] = await Promise.all([
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM users) AS total_users,
         (SELECT COUNT(*)::int FROM bookings) AS total_bookings,
         (SELECT COUNT(*)::int FROM bookings WHERE status IN ('accepted', 'arriving', 'in_progress')) AS active_jobs,
         (SELECT COALESCE(SUM(amount), 0)::bigint FROM bookings WHERE status='completed' AND payment_status='paid') AS revenue`
    ),
    query(
      `WITH days AS (
         SELECT generate_series((CURRENT_DATE - INTERVAL '6 days')::date, CURRENT_DATE::date, INTERVAL '1 day')::date AS day
       )
       SELECT
         TO_CHAR(d.day, 'DD Mon') AS label,
         COALESCE(COUNT(b.id), 0)::int AS count
       FROM days d
       LEFT JOIN bookings b ON DATE(b.created_at) = d.day
       GROUP BY d.day
       ORDER BY d.day ASC`
    ),
    query(
      `SELECT
         c.name AS service,
         COUNT(b.id)::int AS count,
         COALESCE(SUM(b.amount), 0)::bigint AS revenue
       FROM categories c
       LEFT JOIN bookings b ON b.category_id = c.id
       GROUP BY c.id, c.name
       ORDER BY count DESC, revenue DESC
       LIMIT 6`
    ),
  ]);

  return res.json({
    metrics: {
      total_users: Number(metricsResult.rows[0]?.total_users || 0),
      total_bookings: Number(metricsResult.rows[0]?.total_bookings || 0),
      active_jobs: Number(metricsResult.rows[0]?.active_jobs || 0),
      revenue: Number(metricsResult.rows[0]?.revenue || 0),
    },
    charts: {
      bookings_per_day: bookingsPerDayResult.rows.map((row) => ({
        label: row.label,
        count: Number(row.count || 0),
      })),
      top_services: topServicesResult.rows.map((row) => ({
        service: row.service,
        count: Number(row.count || 0),
        revenue: Number(row.revenue || 0),
      })),
    },
  });
});

router.post('/demo-scenario/run', async (_req, res) => {
  try {
    const [customerRes, workerRes] = await Promise.all([
      query(
        `SELECT id, name, locality, lat, lng
         FROM users
         WHERE role = 'customer' AND is_active = true
         ORDER BY RANDOM()
         LIMIT 1`
      ),
      query(
        `SELECT wp.id, wp.category_id, u.name as worker_name, c.name as category_name
         FROM worker_profiles wp
         JOIN users u ON u.id = wp.user_id
         JOIN categories c ON c.id = wp.category_id
         WHERE u.is_active = true
         ORDER BY RANDOM()
         LIMIT 1`
      ),
    ]);

    const customer = customerRes.rows[0];
    const worker = workerRes.rows[0];
    if (!customer || !worker) return res.status(400).json({ error: 'Not enough users/workers to run demo scenario' });

    const amount = 39900;
    const scheduledAt = new Date(Date.now() + 30 * 60 * 1000);

    const bookingResult = await query(
      `INSERT INTO bookings (
         customer_id, worker_id, category_id, status,
         requested_at, scheduled_at, address, lat, lng,
         amount, payment_status, description
       ) VALUES ($1, $2, $3, 'pending', NOW(), $4, $5, $6, $7, $8, 'pending', $9)
       RETURNING id, customer_id, worker_id, amount`,
      [
        customer.id,
        worker.id,
        worker.category_id,
        scheduledAt.toISOString(),
        `${customer.locality || 'Delhi'}`,
        customer.lat,
        customer.lng,
        amount,
        `Guided demo scenario booking`,
      ]
    );

    const booking = bookingResult.rows[0];
    const scenarioId = `scenario-${Date.now()}-${String(booking.id).slice(0, 6)}`;

    const emitStep = (step: string, message: string) => {
      io.to('admin:dashboard').emit('demo:scenario_step', {
        scenario_id: scenarioId,
        booking_id: booking.id,
        step,
        message,
        ts: new Date().toISOString(),
      });
    };

    emitStep('booking_created', 'Booking auto-created');
    emitStep('worker_assigned', `Worker assigned: ${worker.worker_name}`);
    io.to('admin:dashboard').emit('admin:activity', {
      type: 'new_booking',
      booking_id: booking.id,
      category: worker.category_name,
      amount,
      ts: new Date().toISOString(),
    });

    setTimeout(async () => {
      await query(`UPDATE bookings SET status='accepted', accepted_at=NOW(), updated_at=NOW() WHERE id=$1`, [booking.id]);
      io.to(`customer:${booking.customer_id}`).emit('booking_accepted', { booking_id: booking.id });
      io.to('admin:dashboard').emit('admin:activity', { type: 'booking_accepted', booking_id: booking.id, ts: new Date().toISOString() });
      emitStep('accepted', 'Worker accepted job');
    }, 4000);

    setTimeout(async () => {
      await query(`UPDATE bookings SET status='arriving', arriving_at=NOW(), updated_at=NOW() WHERE id=$1`, [booking.id]);
      io.to(`customer:${booking.customer_id}`).emit('worker_arriving', { booking_id: booking.id });
      emitStep('arrival', 'Worker marked as arriving');
    }, 8000);

    setTimeout(async () => {
      await query(`UPDATE bookings SET status='in_progress', started_at=NOW(), updated_at=NOW() WHERE id=$1`, [booking.id]);
      io.to(`customer:${booking.customer_id}`).emit('job_started', { booking_id: booking.id });
      emitStep('in_progress', 'Job started');
    }, 12000);

    setTimeout(async () => {
      await query(`UPDATE bookings SET status='completed', completed_at=NOW(), payment_status='paid', updated_at=NOW() WHERE id=$1`, [booking.id]);
      io.to(`customer:${booking.customer_id}`).emit('job_completed', { booking_id: booking.id });
      emitStep('completion', 'Job completed');
    }, 16000);

    return res.json({
      scenario_id: scenarioId,
      booking_id: booking.id,
      worker_name: worker.worker_name,
      category: worker.category_name,
    });
  } catch (err) {
    console.error('Demo scenario run error:', err);
    return res.status(500).json({ error: 'Failed to run demo scenario' });
  }
});

router.get('/bookings', async (req, res) => {
  const parsed = bookingListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid bookings query' });
  const { status, real_only, limit, offset } = parsed.data;
  let sql = `SELECT b.*, cu.name as customer_name, wu.name as worker_name, c.name as category_name FROM bookings b JOIN users cu ON cu.id=b.customer_id JOIN worker_profiles wp ON wp.id=b.worker_id JOIN users wu ON wu.id=wp.user_id JOIN categories c ON c.id=b.category_id`;
  const params: unknown[] = [];
  const whereClauses: string[] = [];
  if (status) {
    params.push(status);
    whereClauses.push(`b.status=$${params.length}`);
  }
  if (real_only) {
    whereClauses.push('(b.is_simulated = false OR b.is_simulated IS NULL)');
  }
  if (whereClauses.length) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }
  sql += ` ORDER BY b.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`; params.push(Number(limit),Number(offset));
  return res.json((await query(sql,params)).rows);
});
router.get('/workers', async (_req, res) => res.json((await query(`SELECT wp.*, u.name, u.phone, u.email, u.is_active, c.name as category_name FROM worker_profiles wp JOIN users u ON u.id=wp.user_id JOIN categories c ON c.id=wp.category_id ORDER BY wp.created_at DESC`)).rows));
router.patch('/workers/:id/verify', async (req, res) => {
  const parsedParams = workerVerifyParamsSchema.safeParse(req.params);
  const parsedBody = workerVerifyBodySchema.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) return res.status(400).json({ error: 'Invalid verify payload' });
  const approved = parsedBody.data.approved !== false;
  const updated = await query(
    `UPDATE worker_profiles
     SET is_background_verified = $2
     WHERE id = $1
     RETURNING id, is_background_verified`,
    [parsedParams.data.id, approved]
  );
  if (!updated.rows[0]) return res.status(404).json({ error: 'Worker not found' });
  return res.json(updated.rows[0]);
});

router.get('/users', async (req, res) => {
  const parsed = usersQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid users query' });
  const role = parsed.data.role;
  const params: unknown[] = [];
  let sql = `SELECT id, name, phone, email, role, is_active, created_at
             FROM users
             WHERE role != 'admin'`;
  if (role && ['customer', 'worker'].includes(role)) {
    sql += ' AND role = $1';
    params.push(role);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const users = await query(sql, params);
  return res.json(users.rows);
});

router.patch('/users/:id/ban', async (req, res) => {
  const parsedParams = userBanParamsSchema.safeParse(req.params);
  const parsedBody = userBanBodySchema.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) return res.status(400).json({ error: 'Invalid ban payload' });
  const isActive = parsedBody.data.is_active;
  const updated = await query(
    `UPDATE users
     SET is_active = $2
     WHERE id = $1 AND role != 'admin'
     RETURNING id, role, is_active`,
    [parsedParams.data.id, isActive]
  );
  if (!updated.rows[0]) return res.status(404).json({ error: 'User not found or cannot modify admin user' });
  return res.json(updated.rows[0]);
});

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
  const parsedParams = resolveParamsSchema.safeParse(req.params);
  const parsedBody = resolveBodySchema.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) return res.status(400).json({ error: 'Invalid resolve payload' });
  const resolution = parsedBody.data.resolution;
  const r = await query(
    `UPDATE bookings
     SET status = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'disputed'
     RETURNING *`,
    [parsedParams.data.id, resolution]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Dispute not found' });
  return res.json(r.rows[0]);
});

// Worker Heatmap - Analytics and demand/supply visualization
router.get('/heatmap/data', async (req, res) => {
  const schema = z.object({
    category: z.string().optional(),
    city: z.string().optional(),
    timeframe: z.enum(['today', 'week', 'month']).optional().default('today'),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid heatmap query' });

  try {
    const data = await getHeatmapData(parsed.data);
    return res.json(data);
  } catch (err) {
    console.error('Heatmap error:', err);
    return res.status(500).json({ error: 'Failed to get heatmap data' });
  }
});

// Real-time demand map - Current booking requests and status
router.get('/heatmap/realtime', async (_req, res) => {
  try {
    const data = await getRealTimeDemandMap();
    return res.json(data);
  } catch (err) {
    console.error('Realtime demand error:', err);
    return res.status(500).json({ error: 'Failed to get realtime demand' });
  }
});

// Supply distribution - Worker availability across locations
router.get('/heatmap/supply', async (_req, res) => {
  try {
    const data = await getSupplyDistribution();
    return res.json(data);
  } catch (err) {
    console.error('Supply distribution error:', err);
    return res.status(500).json({ error: 'Failed to get supply distribution' });
  }
});

// Top cities by demand
router.get('/heatmap/top-cities', async (req, res) => {
  const schema = z.object({ limit: z.coerce.number().optional().default(10) });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  try {
    const data = await getTopCitiesByDemand(parsed.data.limit);
    return res.json(data);
  } catch (err) {
    console.error('Top cities error:', err);
    return res.status(500).json({ error: 'Failed to get top cities' });
  }
});

export default router;
