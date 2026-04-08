import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const notificationsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(50) });
const notificationIdParamsSchema = z.object({ id: z.string().uuid() });

router.get('/', requireAuth, async (req, res) => {
  const parsed = notificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid notifications query' });
  const { limit } = parsed.data;
  const items = await query(
    `SELECT id, user_id, type, message, read_status, booking_id, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [req.user!.userId, limit]
  );
  return res.json(items.rows);
});

router.get('/unread-count', requireAuth, async (req, res) => {
  const count = await query(
    'SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = $1 AND read_status = false',
    [req.user!.userId]
  );
  return res.json({ unread_count: count.rows[0]?.unread_count || 0 });
});

router.patch('/read-all', requireAuth, async (req, res) => {
  await query('UPDATE notifications SET read_status = true WHERE user_id = $1 AND read_status = false', [req.user!.userId]);
  return res.json({ success: true });
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  const parsed = notificationIdParamsSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid notification id' });
  const updated = await query(
    `UPDATE notifications
     SET read_status = true
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [parsed.data.id, req.user!.userId]
  );
  if (!updated.rows[0]) return res.status(404).json({ error: 'Notification not found' });
  return res.json({ success: true });
});

export default router;
