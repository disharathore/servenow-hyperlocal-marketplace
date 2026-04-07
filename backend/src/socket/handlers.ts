import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { setWorkerOnline, setWorkerOffline } from '../db/redis';
import { query } from '../db/client';
interface AuthPayload { userId: string; phone: string; role: string; }
export function registerSocketHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Missing token'));
    try { (socket as any).user = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload; next(); }
    catch { next(new Error('Invalid token')); }
  });
  io.on('connection', async (socket: Socket) => {
    const user = (socket as any).user as AuthPayload;
    socket.join(`user:${user.userId}`);
    if (user.role === 'customer') socket.join(`customer:${user.userId}`);
    if (user.role === 'worker') {
      const wp = await query('SELECT id FROM worker_profiles WHERE user_id=$1', [user.userId]);
      if (wp.rows[0]) {
        const wId = wp.rows[0].id; (socket as any).workerId = wId;
        socket.join(`worker:${wId}`); await setWorkerOnline(wId, socket.id);
        await query('UPDATE worker_profiles SET last_seen=NOW() WHERE id=$1', [wId]);
      }
    }
    socket.on('worker:location', async (data: { lat: number; lng: number; booking_id?: string }) => {
      const wId = (socket as any).workerId; if (!wId) return;
      await query('UPDATE worker_profiles SET current_lat=$1,current_lng=$2,last_seen=NOW() WHERE id=$3', [data.lat, data.lng, wId]);
      if (data.booking_id) {
        const b = await query('SELECT customer_id FROM bookings WHERE id=$1 AND worker_id=$2', [data.booking_id, wId]);
        if (b.rows[0]) io.to(`customer:${b.rows[0].customer_id}`).emit('worker:location', data);
      }
    });
    socket.on('track:join', async (data: { booking_id: string }) => {
      const b = await query('SELECT * FROM bookings WHERE id=$1 AND customer_id=$2', [data.booking_id, user.userId]);
      if (b.rows[0]) {
        socket.join(`tracking:${data.booking_id}`);
        const wp = await query('SELECT current_lat,current_lng FROM worker_profiles WHERE id=$1', [b.rows[0].worker_id]);
        if (wp.rows[0]?.current_lat) socket.emit('worker:location', { lat: wp.rows[0].current_lat, lng: wp.rows[0].current_lng, booking_id: data.booking_id });
      }
    });
    socket.on('worker:availability', async (data: { available: boolean }) => {
      const wId = (socket as any).workerId; if (!wId) return;
      await query('UPDATE worker_profiles SET is_available=$1 WHERE id=$2', [data.available, wId]);
    });
    socket.on('disconnect', async () => {
      const wId = (socket as any).workerId;
      if (wId) { await setWorkerOffline(wId); await query('UPDATE worker_profiles SET last_seen=NOW() WHERE id=$1', [wId]); }
    });
  });
}
