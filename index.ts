import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
dotenv.config();

import { rateLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import servicesRoutes from './routes/services';
import bookingsRoutes from './routes/bookings';
import jobsRoutes from './routes/jobs';
import paymentsRoutes from './routes/payments';
import reviewsRoutes from './routes/reviews';
import adminRoutes from './routes/admin';
import workersRoutes from './routes/workers';
import { registerSocketHandlers } from './socket/handlers';

const app = express();
const server = http.createServer(app);

// ─── Socket.io ───────────────────────────────────────────
export const io = new SocketServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// ─── Middleware ───────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));

// Razorpay webhook needs raw body
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// ─── Health check ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workers', workersRoutes);

// ─── Socket handlers ─────────────────────────────────────
registerSocketHandlers(io);

// ─── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 ServeNow backend running on port ${PORT}`);
});
