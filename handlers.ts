import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { setWorkerOnline, setWorkerOffline } from '../db/redis';
import { query } from '../db/client';

interface AuthPayload {
  userId: string;
  phone: string;
  role: string;
}

export function registerSocketHandlers(io: Server) {
  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Missing token'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user = (socket as any).user as AuthPayload;
    console.log(`Socket connected: ${user.userId} (${user.role})`);

    // Join personal room
    socket.join(`user:${user.userId}`);

    if (user.role === 'customer') {
      socket.join(`customer:${user.userId}`);
    }

    if (user.role === 'worker') {
      // Get worker profile id
      const wp = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [user.userId]);
      if (wp.rows[0]) {
        const workerId = wp.rows[0].id;
        (socket as any).workerId = workerId;
        socket.join(`worker:${workerId}`);
        await setWorkerOnline(workerId, socket.id);

        // Mark worker available
        await query(
          'UPDATE worker_profiles SET last_seen = NOW() WHERE id = $1',
          [workerId]
        );
      }
    }

    // ── Worker sends live location update ──────────────────
    socket.on('worker:location', async (data: { lat: number; lng: number; booking_id?: string }) => {
      const workerId = (socket as any).workerId;
      if (!workerId) return;

      // Update worker location in DB
      await query(
        'UPDATE worker_profiles SET current_lat = $1, current_lng = $2, last_seen = NOW() WHERE id = $3',
        [data.lat, data.lng, workerId]
      );

      // If tracking a live booking, push to customer room
      if (data.booking_id) {
        const booking = await query(
          'SELECT customer_id FROM bookings WHERE id = $1 AND worker_id = $2',
          [data.booking_id, workerId]
        );
        if (booking.rows[0]) {
          io.to(`customer:${booking.rows[0].customer_id}`).emit('worker:location', {
            lat: data.lat,
            lng: data.lng,
            booking_id: data.booking_id,
          });
        }
      }
    });

    // ── Customer joins tracking room for a booking ─────────
    socket.on('track:join', async (data: { booking_id: string }) => {
      const booking = await query(
        'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2',
        [data.booking_id, user.userId]
      );
      if (booking.rows[0]) {
        socket.join(`tracking:${data.booking_id}`);

        // Send last known worker location immediately
        const wp = await query(
          'SELECT current_lat, current_lng FROM worker_profiles WHERE id = $1',
          [booking.rows[0].worker_id]
        );
        if (wp.rows[0]?.current_lat) {
          socket.emit('worker:location', {
            lat: wp.rows[0].current_lat,
            lng: wp.rows[0].current_lng,
            booking_id: data.booking_id,
          });
        }
      }
    });

    // ── Worker toggles availability ────────────────────────
    socket.on('worker:availability', async (data: { available: boolean }) => {
      const workerId = (socket as any).workerId;
      if (!workerId) return;
      await query(
        'UPDATE worker_profiles SET is_available = $1 WHERE id = $2',
        [data.available, workerId]
      );
    });

    // ── Disconnect ─────────────────────────────────────────
    socket.on('disconnect', async () => {
      const workerId = (socket as any).workerId;
      if (workerId) {
        await setWorkerOffline(workerId);
        await query(
          'UPDATE worker_profiles SET last_seen = NOW() WHERE id = $1',
          [workerId]
        );
      }
      console.log(`Socket disconnected: ${user.userId}`);
    });
  });
}
