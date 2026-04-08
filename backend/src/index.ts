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
import { requestIdMiddleware } from './middleware/requestId';
import { logger } from './utils/logger';
import { ensureSchemaCompatibility } from './db/client';
import authRoutes from './routes/auth';
import servicesRoutes from './routes/services';
import { ensureCategoriesSeeded } from './routes/services';
import bookingsRoutes from './routes/bookings';
import jobsRoutes from './routes/jobs';
import paymentsRoutes from './routes/payments';
import reviewsRoutes from './routes/reviews';
import workersRoutes from './routes/workers';
import adminRoutes from './routes/admin';
import notificationsRoutes from './routes/notifications';
import { registerSocketHandlers } from './socket/handlers';
import { initializeDemoUsers } from './services/demoService';
import { seedDevelopmentData } from './services/seedService';
import { startRealtimeSimulation } from './services/simulationService';

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
app.use(requestIdMiddleware);
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/workers', workersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('unhandled_error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return res.status(500).json({ error: 'Internal server error', request_id: req.requestId });
});

registerSocketHandlers(io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  logger.info('server_started', { port: PORT });
  try {
    await ensureSchemaCompatibility();
    logger.info('schema_compatibility_ready');
  } catch (err) {
    logger.warn('schema_compatibility_skipped', { error: err instanceof Error ? err.message : String(err) });
  }
  try {
    await ensureCategoriesSeeded();
    logger.info('categories_seeded');
  } catch (err) {
    logger.warn('category_seeding_skipped', { error: err instanceof Error ? err.message : String(err) });
  }
  try {
    await initializeDemoUsers();
    logger.info('demo_users_initialized');
  } catch (err) {
    logger.warn('demo_users_init_skipped', { error: err instanceof Error ? err.message : String(err) });
  }
  if (process.env.NODE_ENV === 'development') {
    try {
      await seedDevelopmentData();
    } catch (err) {
      logger.warn('seed_data_skipped', { error: err instanceof Error ? err.message : String(err) });
    }
    try {
      await startRealtimeSimulation(io);
    } catch (err) {
      logger.warn('simulation_startup_skipped', { error: err instanceof Error ? err.message : String(err) });
    }
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('uncaught_exception', { error: err.message, stack: err.stack });
});
