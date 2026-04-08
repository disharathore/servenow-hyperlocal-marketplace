import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { setWorkerOnline, setWorkerOffline } from '../db/redis';
import { query } from '../db/client';
import { getEtaAndRoute } from '../utils/maps';
interface AuthPayload { userId: string; phone: string; role: string; }

async function buildTrackingPayload(bookingId: string, workerId: string) {
  const bookingResult = await query(
    `SELECT id, customer_id, worker_id, status, lat, lng
     FROM bookings
     WHERE id = $1 AND worker_id = $2`,
    [bookingId, workerId]
  );
  const booking = bookingResult.rows[0];
  if (!booking) return null;
  if (!['accepted', 'arriving', 'in_progress'].includes(String(booking.status))) return null;

  const workerResult = await query('SELECT current_lat, current_lng FROM worker_profiles WHERE id = $1', [workerId]);
  const wp = workerResult.rows[0];
  if (!wp?.current_lat || !wp?.current_lng || !booking.lat || !booking.lng) return null;

  const origin = { lat: Number(wp.current_lat), lng: Number(wp.current_lng) };
  const destination = { lat: Number(booking.lat), lng: Number(booking.lng) };
  const eta = await getEtaAndRoute(origin, destination);

  return {
    customerId: booking.customer_id as string,
    payload: {
      booking_id: bookingId,
      lat: origin.lat,
      lng: origin.lng,
      eta_text: eta.eta_text,
      eta_seconds: eta.eta_seconds,
      distance_text: eta.distance_text,
      route_polyline: eta.route_polyline,
      destination,
    },
  };
}

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
    if (user.role === 'admin') socket.join('admin:dashboard');
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
        const tracking = await buildTrackingPayload(data.booking_id, wId);
        if (tracking) {
          io.to(`customer:${tracking.customerId}`).emit('worker:location', tracking.payload);
          io.to(`tracking:${data.booking_id}`).emit('worker:location', tracking.payload);
        }
      }
    });
    socket.on('track:join', async (data: { booking_id: string }) => {
      const b = await query('SELECT * FROM bookings WHERE id=$1 AND customer_id=$2', [data.booking_id, user.userId]);
      if (b.rows[0]) {
        socket.join(`tracking:${data.booking_id}`);

        const emitTick = async () => {
          const tracking = await buildTrackingPayload(data.booking_id, b.rows[0].worker_id);
          if (!tracking) return;
          io.to(`customer:${tracking.customerId}`).emit('worker:location', tracking.payload);
          io.to(`tracking:${data.booking_id}`).emit('worker:location', tracking.payload);
        };

        await emitTick();
        const existing = (socket.data.trackTicker as ReturnType<typeof setInterval> | undefined);
        if (existing) clearInterval(existing);
        socket.data.trackTicker = setInterval(() => {
          emitTick().catch(() => undefined);
        }, 5000);
      }
    });
    socket.on('worker:availability', async (data: { available: boolean }) => {
      const wId = (socket as any).workerId; if (!wId) return;
      await query('UPDATE worker_profiles SET is_available=$1 WHERE id=$2', [data.available, wId]);
    });
    socket.on('disconnect', async () => {
      const ticker = socket.data.trackTicker as ReturnType<typeof setInterval> | undefined;
      if (ticker) clearInterval(ticker);
      const wId = (socket as any).workerId;
      if (wId) { await setWorkerOffline(wId); await query('UPDATE worker_profiles SET last_seen=NOW() WHERE id=$1', [wId]); }
    });
  });
}
