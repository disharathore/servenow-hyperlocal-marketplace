import { query } from '../db/client';
import { io } from '../index';

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  message: string;
  read_status: boolean;
  booking_id: string | null;
  created_at: string;
}

export async function createNotification(params: {
  userId: string;
  type: string;
  message: string;
  bookingId?: string | null;
}) {
  const inserted = await query(
    `INSERT INTO notifications (user_id, type, message, booking_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, type, message, read_status, booking_id, created_at`,
    [params.userId, params.type, params.message, params.bookingId || null]
  );

  const notification = inserted.rows[0] as NotificationRecord;
  io.to(`user:${params.userId}`).emit('notification:new', notification);
  return notification;
}
