import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
dotenv.config();

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'GOOGLE_MAPS_API_KEY',
];

const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key] || process.env[key]!.trim().length === 0);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:');
  for (const key of missingEnvVars) console.error(`- ${key}`);
  process.exit(1);
}

import { rateLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import servicesRoutes from './routes/services';
import { ensureCategoriesSeeded } from './routes/services';
import bookingsRoutes from './routes/bookings';
import jobsRoutes from './routes/jobs';
import paymentsRoutes from './routes/payments';
import reviewsRoutes from './routes/reviews';
import workersRoutes from './routes/workers';
import adminRoutes from './routes/admin';
import { registerSocketHandlers } from './socket/handlers';

const app = express();
const server = http.createServer(app);

const defaultLocalOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
];
const configuredOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.FRONTEND_URLS?.split(',').map((o) => o.trim()) || []),
].filter(Boolean) as string[];
const allowedOrigins = Array.from(new Set([...defaultLocalOrigins, ...configuredOrigins]));

const corsOrigin: cors.CorsOptions['origin'] = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error(`CORS blocked for origin: ${origin}`));
};

export const io = new SocketServer(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
  transports: ['websocket', 'polling'],
});

app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/workers', workersRoutes);
app.use('/api/admin', adminRoutes);

registerSocketHandlers(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  console.log(`🚀 ServeNow backend on port ${PORT}`);
  try {
    await ensureCategoriesSeeded();
    console.log('✅ Categories seeded');
  } catch (err) {
    console.warn('⚠️ Category seeding skipped:', err);
  }
});
