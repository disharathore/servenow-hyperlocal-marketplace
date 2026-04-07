#!/bin/bash
set -e
BASE=~/Desktop/ServeNow

echo "📁 Creating folders..."
mkdir -p "$BASE/backend/src/db"
mkdir -p "$BASE/backend/src/middleware"
mkdir -p "$BASE/backend/src/routes"
mkdir -p "$BASE/backend/src/socket"
mkdir -p "$BASE/backend/src/utils"
mkdir -p "$BASE/frontend/lib"
mkdir -p "$BASE/frontend/public"
mkdir -p "$BASE/frontend/app/(auth)/login"
mkdir -p "$BASE/frontend/app/(customer)/services/[category]"
mkdir -p "$BASE/frontend/app/(customer)/book/[workerId]"
mkdir -p "$BASE/frontend/app/(customer)/track/[jobId]"
mkdir -p "$BASE/frontend/app/(customer)/review/[bookingId]"
mkdir -p "$BASE/frontend/app/(customer)/dashboard"
mkdir -p "$BASE/frontend/app/(worker)/worker/dashboard"
mkdir -p "$BASE/frontend/app/(worker)/worker/setup"
mkdir -p "$BASE/frontend/app/admin"

echo "✅ Folders done. Writing files..."

# ─── BACKEND ROOT ──────────────────────────────────────────

cat > "$BASE/backend/package.json" << 'EOF'
{
  "name": "servenow-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "axios": "^1.6.8",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.3",
    "express-rate-limit": "^7.2.0",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.2",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.11.5",
    "razorpay": "^2.9.2",
    "resend": "^3.2.0",
    "socket.io": "^4.7.5",
    "uuid": "^9.0.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.12.7",
    "@types/pg": "^8.11.5",
    "@types/uuid": "^9.0.8",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.5"
  }
}
EOF

cat > "$BASE/backend/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

cat > "$BASE/backend/.gitignore" << 'EOF'
node_modules/
dist/
.env
*.log
.DS_Store
EOF

cat > "$BASE/backend/railway.toml" << 'EOF'
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
restartPolicyType = "on_failure"
EOF

# ─── BACKEND SRC/INDEX ─────────────────────────────────────

cat > "$BASE/backend/src/index.ts" << 'EOF'
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
import workersRoutes from './routes/workers';
import adminRoutes from './routes/admin';
import { registerSocketHandlers } from './socket/handlers';

const app = express();
const server = http.createServer(app);

export const io = new SocketServer(server, {
  cors: { origin: process.env.FRONTEND_URL, methods: ['GET', 'POST'], credentials: true },
  transports: ['websocket', 'polling'],
});

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
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
server.listen(PORT, () => console.log(`🚀 ServeNow backend on port ${PORT}`));
EOF

# ─── DB FILES ──────────────────────────────────────────────

cat > "$BASE/backend/src/db/client.ts" << 'EOF'
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('Postgres error:', err));
export const query = (text: string, params?: unknown[]) => pool.query(text, params);
export default pool;
EOF

cat > "$BASE/backend/src/db/redis.ts" << 'EOF'
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));
export default redis;

export async function acquireLock(key: string, ttl = 10): Promise<boolean> {
  const r = await redis.set(`lock:${key}`, '1', 'EX', ttl, 'NX');
  return r === 'OK';
}
export async function releaseLock(key: string) { await redis.del(`lock:${key}`); }
export async function storeOtp(phone: string, otp: string) { await redis.set(`otp:${phone}`, otp, 'EX', 300); }
export async function getOtp(phone: string) { return redis.get(`otp:${phone}`); }
export async function deleteOtp(phone: string) { await redis.del(`otp:${phone}`); }
export async function setWorkerOnline(wid: string, sid: string) { await redis.hset('workers:online', wid, sid); }
export async function setWorkerOffline(wid: string) { await redis.hdel('workers:online', wid); }
EOF

cat > "$BASE/backend/src/db/schema.sql" << 'SQLEOF'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('customer', 'worker', 'admin');
CREATE TYPE job_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'disputed');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(15) UNIQUE NOT NULL,
  name VARCHAR(100),
  email VARCHAR(200),
  role user_role NOT NULL DEFAULT 'customer',
  avatar_url TEXT,
  pincode VARCHAR(10),
  city VARCHAR(100),
  locality VARCHAR(200),
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10),
  description TEXT,
  base_price INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO categories (slug, name, icon, description, base_price) VALUES
  ('plumber','Plumber','🔧','Pipe repairs, faucet fitting, drainage',299),
  ('electrician','Electrician','⚡','Wiring, switches, appliance repair',349),
  ('carpenter','Carpenter','🪚','Furniture repair, door fitting',399),
  ('ac-repair','AC Repair','❄️','Servicing, gas refill, installation',549),
  ('painter','Painter','🖌️','Wall painting, waterproofing',499),
  ('cleaner','Home Cleaner','🧹','Deep clean, bathroom, kitchen',299),
  ('tutor','Home Tutor','📚','School subjects, entrance prep',400),
  ('pest-control','Pest Control','🐛','Cockroach, termite, rodent treatment',699),
  ('cctv','CCTV / Security','📹','Installation, maintenance',799),
  ('appliance','Appliance Repair','🔌','Washing machine, fridge, microwave',399);

CREATE TABLE worker_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  bio TEXT,
  experience_years INT DEFAULT 0,
  hourly_rate INT NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  is_background_verified BOOLEAN DEFAULT FALSE,
  total_jobs INT DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0.00,
  rating_count INT DEFAULT 0,
  current_lat DECIMAL(10,8),
  current_lng DECIMAL(11,8),
  last_seen TIMESTAMPTZ,
  upi_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE worker_skills (
  worker_id UUID REFERENCES worker_profiles(id) ON DELETE CASCADE,
  skill VARCHAR(100) NOT NULL,
  PRIMARY KEY (worker_id, skill)
);

CREATE TABLE availability_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_booked BOOLEAN DEFAULT FALSE,
  UNIQUE (worker_id, date, start_time)
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id),
  worker_id UUID NOT NULL REFERENCES worker_profiles(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  slot_id UUID REFERENCES availability_slots(id),
  status job_status NOT NULL DEFAULT 'pending',
  description TEXT,
  address TEXT NOT NULL,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  scheduled_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  amount INT NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID UNIQUE NOT NULL REFERENCES bookings(id),
  customer_id UUID NOT NULL REFERENCES users(id),
  worker_id UUID NOT NULL REFERENCES worker_profiles(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_worker ON bookings(worker_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_worker_profiles_category ON worker_profiles(category_id);
CREATE INDEX idx_availability_slots_worker_date ON availability_slots(worker_id, date);
SQLEOF

# ─── MIDDLEWARE ────────────────────────────────────────────

cat > "$BASE/backend/src/middleware/auth.ts" << 'EOF'
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload { userId: string; phone: string; role: string; }
declare global { namespace Express { interface Request { user?: AuthPayload; } } }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AuthPayload;
    req.user = payload; next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions);
}
EOF

cat > "$BASE/backend/src/middleware/rateLimiter.ts" << 'EOF'
import rateLimit from 'express-rate-limit';
export const rateLimiter = rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } });
export const otpLimiter = rateLimit({ windowMs: 10*60*1000, max: 3, message: { error: 'Too many OTP requests. Try after 10 minutes.' } });
EOF

# ─── UTILS ─────────────────────────────────────────────────

cat > "$BASE/backend/src/utils/msg91.ts" << 'EOF'
import axios from 'axios';
export async function sendOtp(phone: string): Promise<boolean> {
  try {
    const formatted = phone.startsWith('91') ? phone : `91${phone}`;
    const res = await axios.post('https://api.msg91.com/api/v5/otp', { template_id: process.env.MSG91_TEMPLATE_ID, mobile: formatted, authkey: process.env.MSG91_AUTH_KEY, otp_expiry: 5, otp_length: 6 }, { headers: { 'Content-Type': 'application/json' } });
    return res.data?.type === 'success';
  } catch { return false; }
}
export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  try {
    const formatted = phone.startsWith('91') ? phone : `91${phone}`;
    const res = await axios.get('https://api.msg91.com/api/v5/otp/verify', { params: { authkey: process.env.MSG91_AUTH_KEY, mobile: formatted, otp } });
    return res.data?.type === 'success';
  } catch { return false; }
}
EOF

cat > "$BASE/backend/src/utils/maps.ts" << 'EOF'
import axios from 'axios';
export interface LatLng { lat: number; lng: number; }
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  try {
    const res = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', { params: { address, key: process.env.GOOGLE_MAPS_API_KEY, region: 'in' } });
    if (res.data.status !== 'OK') return null;
    return res.data.results[0].geometry.location;
  } catch { return null; }
}
export async function resolvePincode(pincode: string): Promise<{ city: string; locality: string } | null> {
  try {
    const res = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`);
    if (res.data[0]?.Status !== 'Success') return null;
    const post = res.data[0].PostOffice[0];
    return { city: post.District, locality: post.Name };
  } catch { return null; }
}
export function getDistanceKm(a: LatLng, b: LatLng): number {
  const R = 6371, dLat = ((b.lat-a.lat)*Math.PI)/180, dLng = ((b.lng-a.lng)*Math.PI)/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
EOF

cat > "$BASE/backend/src/utils/resend.ts" << 'EOF'
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
export async function sendBookingConfirmation(data: { customerName: string; customerEmail: string; workerName: string; category: string; scheduledAt: string; address: string; bookingId: string; amount: number; }) {
  await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to: data.customerEmail, subject: `Booking Confirmed — ${data.category}`, html: `<div style="font-family:sans-serif"><h2>Booking Confirmed ✅</h2><p>Hi ${data.customerName}, your <b>${data.category}</b> booking is confirmed.</p><p>Worker: ${data.workerName}</p><p>When: ${data.scheduledAt}</p><p>Address: ${data.address}</p><p>Amount: ₹${(data.amount/100).toFixed(0)}</p></div>` });
}
export async function sendJobStartedNotification(data: { customerEmail: string; customerName: string; workerName: string; bookingId: string; trackingUrl: string; }) {
  await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to: data.customerEmail, subject: `${data.workerName} is on the way 🚶`, html: `<div style="font-family:sans-serif"><h2>Worker heading to you!</h2><p>Hi ${data.customerName}, ${data.workerName} has started.</p><a href="${data.trackingUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0">Track Live →</a></div>` });
}
EOF

echo "✅ Backend files done. Writing routes..."

# ─── ROUTES ────────────────────────────────────────────────

cat > "$BASE/backend/src/routes/auth.ts" << 'EOF'
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { storeOtp, getOtp, deleteOtp } from '../db/redis';
import { sendOtp, verifyOtp } from '../utils/msg91';
import { signToken, requireAuth } from '../middleware/auth';
import { otpLimiter } from '../middleware/rateLimiter';
import { resolvePincode } from '../utils/maps';

const router = Router();

router.post('/send-otp', otpLimiter, async (req: Request, res: Response) => {
  const schema = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid phone number' });
  const { phone } = parsed.data;
  if (process.env.NODE_ENV === 'development') {
    await storeOtp(phone, '123456');
    return res.json({ success: true, dev_otp: '123456' });
  }
  const sent = await sendOtp(phone);
  if (!sent) return res.status(500).json({ error: 'Failed to send OTP' });
  return res.json({ success: true });
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  const schema = z.object({
    phone: z.string().regex(/^[6-9]\d{9}$/), otp: z.string().length(6),
    name: z.string().optional(), role: z.enum(['customer', 'worker']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { phone, otp, name, role } = parsed.data;
  let valid = false;
  if (process.env.NODE_ENV === 'development') {
    valid = (await getOtp(phone)) === otp;
  } else {
    valid = await verifyOtp(phone, otp);
  }
  if (!valid) return res.status(401).json({ error: 'Invalid OTP' });
  await deleteOtp(phone);
  const existing = await query('SELECT * FROM users WHERE phone = $1', [phone]);
  let user = existing.rows[0];
  if (!user) {
    const result = await query('INSERT INTO users (phone, name, role) VALUES ($1,$2,$3) RETURNING *', [phone, name||null, role||'customer']);
    user = result.rows[0];
  }
  const token = signToken({ userId: user.id, phone: user.phone, role: user.role });
  return res.json({ token, user: { id: user.id, phone: user.phone, name: user.name, role: user.role } });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const result = await query(
    `SELECT u.*, wp.id as worker_profile_id, wp.is_available, wp.rating, wp.total_jobs
     FROM users u LEFT JOIN worker_profiles wp ON wp.user_id = u.id WHERE u.id = $1`,
    [req.user!.userId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  return res.json(result.rows[0]);
});

router.patch('/profile', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string().min(2).optional(), email: z.string().email().optional(), pincode: z.string().length(6).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' });
  const { name, email, pincode } = parsed.data;
  const updates: string[] = []; const values: unknown[] = []; let idx = 1;
  if (name) { updates.push(`name = $${idx++}`); values.push(name); }
  if (email) { updates.push(`email = $${idx++}`); values.push(email); }
  if (pincode) {
    updates.push(`pincode = $${idx++}`); values.push(pincode);
    const loc = await resolvePincode(pincode);
    if (loc) { updates.push(`city = $${idx++}`, `locality = $${idx++}`); values.push(loc.city, loc.locality); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(req.user!.userId);
  const result = await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
  return res.json(result.rows[0]);
});

export default router;
EOF

cat > "$BASE/backend/src/routes/services.ts" << 'EOF'
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { getDistanceKm } from '../utils/maps';

const router = Router();

router.get('/categories', async (_req, res) => {
  const r = await query('SELECT * FROM categories WHERE is_active = true ORDER BY name');
  return res.json(r.rows);
});

router.get('/workers', async (req: Request, res: Response) => {
  const schema = z.object({ category: z.string().optional(), lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), date: z.string().optional(), pincode: z.string().optional() });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });
  const { category, lat, lng, date, pincode } = parsed.data;
  let sql = `SELECT wp.*, u.name, u.phone, u.avatar_url, u.city, u.locality, u.pincode, u.lat as user_lat, u.lng as user_lng,
    c.name as category_name, c.slug as category_slug, c.icon as category_icon, c.base_price
    FROM worker_profiles wp JOIN users u ON u.id = wp.user_id JOIN categories c ON c.id = wp.category_id
    WHERE wp.is_available = true AND u.is_active = true`;
  const params: unknown[] = []; let idx = 1;
  if (category) { sql += ` AND c.slug = $${idx++}`; params.push(category); }
  if (pincode) { sql += ` AND u.pincode = $${idx++}`; params.push(pincode); }
  if (date) { sql += ` AND EXISTS (SELECT 1 FROM availability_slots s WHERE s.worker_id = wp.id AND s.date = $${idx++} AND s.is_booked = false)`; params.push(date); }
  sql += ' ORDER BY wp.rating DESC, wp.total_jobs DESC LIMIT 50';
  const result = await query(sql, params);
  let workers = result.rows;
  if (lat && lng) {
    workers = workers.map(w => ({ ...w, distance_km: w.user_lat && w.user_lng ? parseFloat(getDistanceKm({ lat, lng }, { lat: w.user_lat, lng: w.user_lng }).toFixed(1)) : null })).sort((a,b) => (a.distance_km??999)-(b.distance_km??999));
  }
  return res.json(workers);
});

router.get('/workers/:id', async (req, res) => {
  const r = await query(`SELECT wp.*, u.name, u.phone, u.avatar_url, u.city, u.locality, u.lat as user_lat, u.lng as user_lng,
    c.name as category_name, c.slug as category_slug, c.icon, c.base_price,
    COALESCE(json_agg(DISTINCT ws.skill) FILTER (WHERE ws.skill IS NOT NULL), '[]') as skills
    FROM worker_profiles wp JOIN users u ON u.id = wp.user_id JOIN categories c ON c.id = wp.category_id
    LEFT JOIN worker_skills ws ON ws.worker_id = wp.id WHERE wp.id = $1
    GROUP BY wp.id, u.name, u.phone, u.avatar_url, u.city, u.locality, u.lat, u.lng, c.name, c.slug, c.icon, c.base_price`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Worker not found' });
  return res.json(r.rows[0]);
});

router.get('/workers/:id/slots', async (req, res) => {
  const { date } = req.query;
  let sql = `SELECT * FROM availability_slots WHERE worker_id = $1 AND is_booked = false AND date >= CURRENT_DATE`;
  const params: unknown[] = [req.params.id];
  if (date) { sql += ' AND date = $2'; params.push(date as string); }
  else { sql += " AND date <= CURRENT_DATE + INTERVAL '14 days'"; }
  sql += ' ORDER BY date, start_time';
  return res.json((await query(sql, params)).rows);
});

router.get('/workers/:id/reviews', async (req, res) => {
  const r = await query(`SELECT r.*, u.name as customer_name FROM reviews r JOIN users u ON u.id = r.customer_id WHERE r.worker_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [req.params.id]);
  return res.json(r.rows);
});

export default router;
EOF

echo "✅ Routes auth + services done"

cat > "$BASE/backend/src/routes/bookings.ts" << 'EOF'
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import pool from '../db/client';
import { acquireLock, releaseLock } from '../db/redis';
import { requireAuth } from '../middleware/auth';
import { geocodeAddress } from '../utils/maps';
import { io } from '../index';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ worker_id: z.string().uuid(), slot_id: z.string().uuid(), description: z.string().optional(), address: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking data' });
  const { worker_id, slot_id, description, address } = parsed.data;
  const locked = await acquireLock(`slot:${slot_id}`, 30);
  if (!locked) return res.status(409).json({ error: 'Slot is being booked. Try again.' });
  try {
    const slotResult = await query('SELECT * FROM availability_slots WHERE id = $1 AND is_booked = false', [slot_id]);
    if (!slotResult.rows[0]) return res.status(409).json({ error: 'Slot no longer available' });
    const slot = slotResult.rows[0];
    const workerResult = await query(`SELECT wp.*, c.name as category_name, c.id as category_id, u.name as worker_name FROM worker_profiles wp JOIN categories c ON c.id = wp.category_id JOIN users u ON u.id = wp.user_id WHERE wp.id = $1`, [worker_id]);
    if (!workerResult.rows[0]) return res.status(404).json({ error: 'Worker not found' });
    const worker = workerResult.rows[0];
    const coords = await geocodeAddress(address);
    const amount = worker.hourly_rate * 100;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bookingResult = await client.query(
        `INSERT INTO bookings (customer_id,worker_id,category_id,slot_id,description,address,lat,lng,scheduled_at,amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user!.userId, worker_id, worker.category_id, slot_id, description||null, address, coords?.lat||null, coords?.lng||null, `${slot.date}T${slot.start_time}`, amount]
      );
      await client.query('UPDATE availability_slots SET is_booked = true WHERE id = $1', [slot_id]);
      await client.query('COMMIT');
      const booking = bookingResult.rows[0];
      io.to(`worker:${worker_id}`).emit('new_booking', { booking_id: booking.id, category: worker.category_name, address, scheduled_at: booking.scheduled_at, amount });
      return res.status(201).json(booking);
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } finally { await releaseLock(`slot:${slot_id}`); }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { status } = req.query;
  const user = req.user!;
  const isWorker = user.role === 'worker';
  let userIdValue = user.userId;
  if (isWorker) {
    const wp = await query('SELECT id FROM worker_profiles WHERE user_id = $1', [user.userId]);
    if (!wp.rows[0]) return res.json([]);
    userIdValue = wp.rows[0].id;
  }
  let sql = `SELECT b.*, cu.name as customer_name, cu.phone as customer_phone, wu.name as worker_name, wp.rating as worker_rating, c.name as category_name, c.icon as category_icon, c.slug as category_slug
    FROM bookings b JOIN users cu ON cu.id = b.customer_id JOIN worker_profiles wp ON wp.id = b.worker_id JOIN users wu ON wu.id = wp.user_id JOIN categories c ON c.id = b.category_id
    WHERE ${isWorker ? 'b.worker_id' : 'b.customer_id'} = $1`;
  const params: unknown[] = [userIdValue];
  if (status) { sql += ' AND b.status = $2'; params.push(status as string); }
  sql += ' ORDER BY b.created_at DESC';
  return res.json((await query(sql, params)).rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const r = await query(`SELECT b.*, cu.name as customer_name, cu.phone as customer_phone, wu.name as worker_name, wu.phone as worker_phone, wp.current_lat as worker_lat, wp.current_lng as worker_lng, wp.rating as worker_rating, c.name as category_name, c.icon as category_icon
    FROM bookings b JOIN users cu ON cu.id = b.customer_id JOIN worker_profiles wp ON wp.id = b.worker_id JOIN users wu ON wu.id = wp.user_id JOIN categories c ON c.id = b.category_id WHERE b.id = $1`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  return res.json(r.rows[0]);
});

router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const { reason } = req.body;
  const booking = await query('SELECT * FROM bookings WHERE id = $1 AND customer_id = $2', [req.params.id, req.user!.userId]);
  if (!booking.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  if (['completed','cancelled'].includes(booking.rows[0].status)) return res.status(400).json({ error: 'Cannot cancel this booking' });
  await query(`UPDATE bookings SET status = 'cancelled', cancellation_reason = $1 WHERE id = $2`, [reason||null, req.params.id]);
  if (booking.rows[0].slot_id) await query('UPDATE availability_slots SET is_booked = false WHERE id = $1', [booking.rows[0].slot_id]);
  io.to(`worker:${booking.rows[0].worker_id}`).emit('booking_cancelled', { booking_id: req.params.id });
  return res.json({ success: true });
});

export default router;
EOF

cat > "$BASE/backend/src/routes/jobs.ts" << 'EOF'
import { Router } from 'express';
import { query } from '../db/client';
import pool from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { io } from '../index';

const router = Router();

async function getWId(userId: string) { return (await query('SELECT id FROM worker_profiles WHERE user_id = $1', [userId])).rows[0]?.id || null; }

router.post('/:bookingId/accept', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(403).json({ error: 'Worker profile not found' });
  const r = await query(`UPDATE bookings SET status='accepted', accepted_at=NOW() WHERE id=$1 AND worker_id=$2 AND status='pending' RETURNING *`, [req.params.bookingId, wId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  io.to(`customer:${r.rows[0].customer_id}`).emit('booking_accepted', { booking_id: r.rows[0].id });
  return res.json(r.rows[0]);
});

router.post('/:bookingId/start', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(403).json({ error: 'Worker profile not found' });
  const r = await query(`UPDATE bookings SET status='in_progress', started_at=NOW() WHERE id=$1 AND worker_id=$2 AND status='accepted' RETURNING *`, [req.params.bookingId, wId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not in accepted state' });
  io.to(`customer:${r.rows[0].customer_id}`).emit('job_started', { booking_id: r.rows[0].id });
  return res.json(r.rows[0]);
});

router.post('/:bookingId/complete', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(403).json({ error: 'Worker profile not found' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`UPDATE bookings SET status='completed', completed_at=NOW() WHERE id=$1 AND worker_id=$2 AND status='in_progress' RETURNING *`, [req.params.bookingId, wId]);
    if (!r.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not in progress' }); }
    await client.query('UPDATE worker_profiles SET total_jobs=total_jobs+1 WHERE id=$1', [wId]);
    await client.query('COMMIT');
    io.to(`customer:${r.rows[0].customer_id}`).emit('job_completed', { booking_id: r.rows[0].id });
    return res.json(r.rows[0]);
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});

router.get('/earnings', requireAuth, requireRole('worker'), async (req, res) => {
  const wId = await getWId(req.user!.userId);
  if (!wId) return res.status(404).json({ error: 'Worker profile not found' });
  const r = await query(`SELECT COUNT(*) as total_jobs, COALESCE(SUM(amount),0) as total_earnings, COALESCE(SUM(CASE WHEN DATE_TRUNC('month',completed_at)=DATE_TRUNC('month',NOW()) THEN amount ELSE 0 END),0) as this_month, COALESCE(SUM(CASE WHEN DATE_TRUNC('week',completed_at)=DATE_TRUNC('week',NOW()) THEN amount ELSE 0 END),0) as this_week FROM bookings WHERE worker_id=$1 AND status='completed' AND payment_status='paid'`, [wId]);
  return res.json(r.rows[0]);
});

export default router;
EOF

cat > "$BASE/backend/src/routes/payments.ts" << 'EOF'
import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { query } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';

const router = Router();
const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });

router.post('/create-order', requireAuth, async (req: Request, res: Response) => {
  const { booking_id } = req.body;
  const bRes = await query('SELECT * FROM bookings WHERE id=$1 AND customer_id=$2', [booking_id, req.user!.userId]);
  if (!bRes.rows[0]) return res.status(404).json({ error: 'Booking not found' });
  if (bRes.rows[0].payment_status === 'paid') return res.status(400).json({ error: 'Already paid' });
  const order = await razorpay.orders.create({ amount: bRes.rows[0].amount, currency: 'INR', receipt: `bk_${booking_id.slice(0,16)}`, notes: { booking_id } });
  await query('UPDATE bookings SET razorpay_order_id=$1 WHERE id=$2', [order.id, booking_id]);
  return res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: process.env.RAZORPAY_KEY_ID });
});

router.post('/verify', requireAuth, async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (expected !== razorpay_signature) return res.status(400).json({ error: 'Invalid signature' });
  await query(`UPDATE bookings SET payment_status='paid', razorpay_payment_id=$1 WHERE id=$2`, [razorpay_payment_id, booking_id]);
  const b = await query('SELECT * FROM bookings WHERE id=$1', [booking_id]);
  if (b.rows[0]) io.to(`worker:${b.rows[0].worker_id}`).emit('payment_confirmed', { booking_id });
  return res.json({ success: true });
});

router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['x-razorpay-signature'] as string;
  const body = req.body as Buffer;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');
  if (expected !== sig) return res.status(400).json({ error: 'Invalid signature' });
  const event = JSON.parse(body.toString());
  if (event.event === 'payment.captured') {
    const notes = event.payload.payment.entity.notes;
    if (notes?.booking_id) await query(`UPDATE bookings SET payment_status='paid' WHERE id=$1 AND payment_status!='paid'`, [notes.booking_id]);
  }
  return res.json({ received: true });
});

export default router;
EOF

cat > "$BASE/backend/src/routes/reviews.ts" << 'EOF'
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import pool from '../db/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ booking_id: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid review data' });
  const { booking_id, rating, comment } = parsed.data;
  const bRes = await query(`SELECT * FROM bookings WHERE id=$1 AND customer_id=$2 AND status='completed'`, [booking_id, req.user!.userId]);
  if (!bRes.rows[0]) return res.status(403).json({ error: 'Can only review a completed booking' });
  if ((await query('SELECT id FROM reviews WHERE booking_id=$1', [booking_id])).rows[0]) return res.status(409).json({ error: 'Already reviewed' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO reviews (booking_id,customer_id,worker_id,rating,comment) VALUES ($1,$2,$3,$4,$5)`, [booking_id, req.user!.userId, bRes.rows[0].worker_id, rating, comment||null]);
    await client.query(`UPDATE worker_profiles SET rating=(SELECT ROUND(AVG(rating)::numeric,2) FROM reviews WHERE worker_id=$1), rating_count=(SELECT COUNT(*) FROM reviews WHERE worker_id=$1) WHERE id=$1`, [bRes.rows[0].worker_id]);
    await client.query('COMMIT');
    return res.status(201).json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});
export default router;
EOF

cat > "$BASE/backend/src/routes/workers.ts" << 'EOF'
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import pool from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.post('/setup', requireAuth, requireRole('worker'), async (req: Request, res: Response) => {
  const schema = z.object({ bio: z.string().min(10), experience_years: z.number().int().min(0).max(50), hourly_rate: z.number().int().min(100).max(10000), skills: z.array(z.string()).optional(), slots: z.array(z.object({ day_of_week: z.number().int().min(0).max(6), start_time: z.string(), end_time: z.string() })).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid data' });
  const { bio, experience_years, hourly_rate, skills, slots } = parsed.data;
  const catId = (await query('SELECT id FROM categories LIMIT 1')).rows[0]?.id;
  const existing = await query('SELECT id FROM worker_profiles WHERE user_id=$1', [req.user!.userId]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let wId: string;
    if (existing.rows[0]) {
      await client.query(`UPDATE worker_profiles SET bio=$1,experience_years=$2,hourly_rate=$3 WHERE user_id=$4`, [bio, experience_years, hourly_rate, req.user!.userId]);
      wId = existing.rows[0].id;
    } else {
      wId = (await client.query(`INSERT INTO worker_profiles (user_id,category_id,bio,experience_years,hourly_rate) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.user!.userId, catId, bio, experience_years, hourly_rate])).rows[0].id;
    }
    if (skills?.length) {
      await client.query('DELETE FROM worker_skills WHERE worker_id=$1', [wId]);
      for (const skill of skills) await client.query('INSERT INTO worker_skills (worker_id,skill) VALUES ($1,$2) ON CONFLICT DO NOTHING', [wId, skill]);
    }
    await client.query('DELETE FROM availability_slots WHERE worker_id=$1 AND is_booked=false', [wId]);
    const today = new Date();
    for (let week = 0; week < 4; week++) for (const slot of slots) {
      const d = new Date(today); d.setDate(today.getDate() + (slot.day_of_week - today.getDay() + 7) % 7 + week * 7);
      await client.query(`INSERT INTO availability_slots (worker_id,date,start_time,end_time) VALUES ($1,$2,$3,$4) ON CONFLICT (worker_id,date,start_time) DO NOTHING`, [wId, d.toISOString().split('T')[0], slot.start_time, slot.end_time]);
    }
    await client.query('COMMIT');
    return res.json({ success: true, worker_id: wId });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});
router.get('/me', requireAuth, requireRole('worker'), async (req, res) => {
  const r = await query(`SELECT wp.*, c.name as category_name, COALESCE(json_agg(DISTINCT ws.skill) FILTER (WHERE ws.skill IS NOT NULL), '[]') as skills FROM worker_profiles wp LEFT JOIN categories c ON c.id=wp.category_id LEFT JOIN worker_skills ws ON ws.worker_id=wp.id WHERE wp.user_id=$1 GROUP BY wp.id, c.name`, [req.user!.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Worker profile not found' });
  return res.json(r.rows[0]);
});
export default router;
EOF

cat > "$BASE/backend/src/routes/admin.ts" << 'EOF'
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
export default router;
EOF

cat > "$BASE/backend/src/socket/handlers.ts" << 'EOF'
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
EOF

echo "✅ All backend routes + socket done"

echo "📝 Writing frontend files..."

# ─── FRONTEND ROOT FILES ───────────────────────────────────

cat > "$BASE/frontend/package.json" << 'EOF'
{
  "name": "servenow-frontend",
  "version": "1.0.0",
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },
  "dependencies": {
    "@googlemaps/js-api-loader": "^1.16.6",
    "axios": "^1.6.8",
    "clsx": "^2.1.1",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.383.0",
    "next": "14.2.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "socket.io-client": "^4.7.5",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@types/node": "^20.12.7",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5"
  }
}
EOF

cat > "$BASE/frontend/next.config.js" << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = { images: { domains: ['res.cloudinary.com'] } };
module.exports = nextConfig;
EOF

cat > "$BASE/frontend/tailwind.config.js" << 'EOF'
/** @type {import('tailwindcss').Config} */
module.exports = { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] };
EOF

cat > "$BASE/frontend/postcss.config.js" << 'EOF'
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
EOF

cat > "$BASE/frontend/tsconfig.json" << 'EOF'
{
  "compilerOptions": {
    "target": "es5","lib":["dom","dom.iterable","esnext"],"allowJs":true,"skipLibCheck":true,"strict":true,
    "noEmit":true,"esModuleInterop":true,"module":"esnext","moduleResolution":"bundler","resolveJsonModule":true,
    "isolatedModules":true,"jsx":"preserve","incremental":true,"plugins":[{"name":"next"}],"paths":{"@/*":["./*"]}
  },
  "include":["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"],"exclude":["node_modules"]
}
EOF

cat > "$BASE/frontend/.gitignore" << 'EOF'
node_modules/
.next/
.env
.env.local
*.log
.DS_Store
EOF

cat > "$BASE/frontend/vercel.json" << 'EOF'
{ "framework": "nextjs" }
EOF

cat > "$BASE/frontend/public/manifest.json" << 'EOF'
{ "name":"ServeNow","short_name":"ServeNow","description":"Local services on demand","start_url":"/","display":"standalone","background_color":"#f9fafb","theme_color":"#2563eb","icons":[{"src":"/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"/icon-512.png","sizes":"512x512","type":"image/png"}] }
EOF

# ─── LIB FILES ─────────────────────────────────────────────

cat > "$BASE/frontend/lib/api.ts" << 'EOF'
import axios from 'axios';
const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => { if (typeof window !== 'undefined') { const t = localStorage.getItem('sn_token'); if (t) config.headers.Authorization = `Bearer ${t}`; } return config; });
api.interceptors.response.use(r => r, err => { if (err.response?.status === 401 && typeof window !== 'undefined') { localStorage.removeItem('sn_token'); window.location.href = '/login'; } return Promise.reject(err); });
export default api;
export const authApi = { sendOtp: (phone: string) => api.post('/auth/send-otp', { phone }), verifyOtp: (phone: string, otp: string, name?: string, role?: string) => api.post('/auth/verify-otp', { phone, otp, name, role }), me: () => api.get('/auth/me'), updateProfile: (data: Record<string, unknown>) => api.patch('/auth/profile', data) };
export const servicesApi = { categories: () => api.get('/services/categories'), workers: (params: Record<string, unknown>) => api.get('/services/workers', { params }), worker: (id: string) => api.get(`/services/workers/${id}`), slots: (wId: string, date?: string) => api.get(`/services/workers/${wId}/slots`, { params: date ? { date } : {} }), reviews: (wId: string) => api.get(`/services/workers/${wId}/reviews`) };
export const bookingsApi = { create: (data: Record<string, unknown>) => api.post('/bookings', data), list: (status?: string) => api.get('/bookings', { params: status ? { status } : {} }), get: (id: string) => api.get(`/bookings/${id}`), cancel: (id: string, reason?: string) => api.patch(`/bookings/${id}/cancel`, { reason }) };
export const paymentsApi = { createOrder: (booking_id: string) => api.post('/payments/create-order', { booking_id }), verify: (data: Record<string, unknown>) => api.post('/payments/verify', data) };
export const jobsApi = { accept: (id: string) => api.post(`/jobs/${id}/accept`), start: (id: string) => api.post(`/jobs/${id}/start`), complete: (id: string) => api.post(`/jobs/${id}/complete`), earnings: () => api.get('/jobs/earnings') };
export const reviewsApi = { submit: (data: { booking_id: string; rating: number; comment?: string }) => api.post('/reviews', data) };
export const adminApi = { stats: () => api.get('/admin/stats'), bookings: (s?: string) => api.get('/admin/bookings', { params: s ? { status: s } : {} }), workers: () => api.get('/admin/workers'), verifyWorker: (id: string) => api.patch(`/admin/workers/${id}/verify`) };
EOF

cat > "$BASE/frontend/lib/socket.ts" << 'EOF'
import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('sn_token') : null;
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, { auth: { token }, transports: ['websocket','polling'], autoConnect: false });
  }
  return socket;
}
export function connectSocket() { const s = getSocket(); if (!s.connected) s.connect(); return s; }
export function disconnectSocket() { socket?.disconnect(); socket = null; }
EOF

cat > "$BASE/frontend/lib/store.ts" << 'EOF'
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
interface User { id: string; phone: string; name: string | null; email: string | null; role: 'customer'|'worker'|'admin'; is_verified: boolean; worker_profile_id?: string; }
interface AuthStore { user: User|null; token: string|null; setAuth: (u: User, t: string) => void; clearAuth: () => void; updateUser: (u: Partial<User>) => void; }
export const useAuthStore = create<AuthStore>()(persist((set) => ({
  user: null, token: null,
  setAuth: (user, token) => { localStorage.setItem('sn_token', token); set({ user, token }); },
  clearAuth: () => { localStorage.removeItem('sn_token'); set({ user: null, token: null }); },
  updateUser: (updates) => set(s => ({ user: s.user ? { ...s.user, ...updates } : null })),
}), { name: 'sn_auth', partialize: s => ({ user: s.user, token: s.token }) }));
EOF

echo "✅ Frontend lib files done"

# ─── APP FILES ─────────────────────────────────────────────

cat > "$BASE/frontend/app/layout.tsx" << 'EOF'
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
export const metadata: Metadata = { title: 'ServeNow — Local Services On Demand', description: 'Book verified local services instantly.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={inter.variable}><head><link rel="manifest" href="/manifest.json" /></head><body className="bg-gray-50 text-gray-900 antialiased">{children}</body></html>;
}
EOF

cat > "$BASE/frontend/app/globals.css" << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn-primary { @apply bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed; }
  .btn-secondary { @apply bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-medium px-5 py-2.5 rounded-xl transition-colors duration-150; }
  .btn-ghost { @apply text-blue-600 hover:bg-blue-50 font-medium px-4 py-2 rounded-xl transition-colors duration-150; }
  .card { @apply bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden; }
  .input { @apply w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-150; }
  .badge { @apply inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium; }
  .badge-pending { @apply bg-yellow-100 text-yellow-800; }
  .badge-accepted { @apply bg-blue-100 text-blue-800; }
  .badge-in_progress { @apply bg-purple-100 text-purple-800; }
  .badge-completed { @apply bg-green-100 text-green-800; }
  .badge-cancelled { @apply bg-red-100 text-red-800; }
}
EOF

cat > "$BASE/frontend/app/(auth)/login/page.tsx" << 'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);
  const [step, setStep] = useState<'phone'|'otp'|'profile'>('phone');
  const [phone, setPhone] = useState(''); const [otp, setOtp] = useState('');
  const [name, setName] = useState(''); const [role, setRole] = useState<'customer'|'worker'>('customer');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [tempToken, setTempToken] = useState('');

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (phone.length !== 10) return setError('Enter valid 10-digit number');
    setError(''); setLoading(true);
    try { await authApi.sendOtp(phone); setStep('otp'); }
    catch { setError('Failed to send OTP. Try again.'); }
    finally { setLoading(false); }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return setError('Enter 6-digit OTP');
    setError(''); setLoading(true);
    try {
      const res = await authApi.verifyOtp(phone, otp);
      const { token, user } = res.data;
      if (!user.name) { setTempToken(token); localStorage.setItem('sn_token', token); setStep('profile'); }
      else { setAuth(user, token); router.push(user.role === 'worker' ? '/worker/dashboard' : '/'); }
    } catch { setError('Incorrect OTP. Try again.'); }
    finally { setLoading(false); }
  }

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter your name');
    setError(''); setLoading(true);
    try {
      await authApi.updateProfile({ name, role });
      const meRes = await authApi.me();
      setAuth(meRes.data, tempToken);
      router.push(role === 'worker' ? '/worker/dashboard' : '/');
    } catch { setError('Setup failed. Try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4"><span className="text-white text-2xl">⚡</span></div>
          <h1 className="text-2xl font-bold text-gray-900">ServeNow</h1>
          <p className="text-gray-500 text-sm mt-1">Local services, instantly booked</p>
        </div>
        <div className="card p-6">
          {step === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone number</label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium">🇮🇳 +91</span>
                  <input className="input flex-1" type="tel" placeholder="9876543210" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,''))} autoFocus />
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Sending…' : 'Get OTP'}</button>
            </form>
          )}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OTP sent to +91 {phone}</label>
                <input className="input tracking-[0.5em] text-center text-xl font-bold" type="text" placeholder="● ● ● ● ● ●" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} autoFocus />
                <p className="text-xs text-gray-400 mt-1">Dev mode OTP: <strong>123456</strong></p>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify OTP'}</button>
              <button type="button" className="btn-ghost w-full text-sm" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>← Change number</button>
            </form>
          )}
          {step === 'profile' && (
            <form onSubmit={handleProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
                <input className="input" placeholder="Rahul Sharma" value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">I am a</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['customer','worker'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setRole(r)} className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${role===r ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                      {r === 'customer' ? '🙋 Customer' : '🔧 Worker'}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Setting up…' : 'Get Started →'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
EOF

echo "✅ Auth page done"

cat > "$BASE/frontend/app/(customer)/page.tsx" << 'EOF'
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { servicesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Search, ChevronRight, LogOut } from 'lucide-react';
import Link from 'next/link';

interface Category { id: string; slug: string; name: string; icon: string; description: string; base_price: number; }

export default function HomePage() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role === 'worker') { router.push('/worker/dashboard'); return; }
    servicesApi.categories().then(r => { setCategories(r.data); setLoading(false); });
  }, [user, router]);

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-xl">⚡</span><span className="font-bold text-gray-900">ServeNow</span></div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-blue-600 font-medium">My Bookings</Link>
            <button onClick={() => { clearAuth(); router.push('/login'); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
          <p className="text-blue-100 text-sm mb-1">Hello, {user?.name?.split(' ')[0] || 'there'} 👋</p>
          <h2 className="text-2xl font-bold mb-4">What service do you need?</h2>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-3 rounded-xl text-gray-900 bg-white text-sm focus:outline-none" placeholder="plumber, electrician, tutor…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-3">All Services</h3>
          {loading ? <div className="grid grid-cols-2 gap-3">{Array.from({length:6}).map((_,i) => <div key={i} className="card p-4 animate-pulse h-24 bg-gray-100" />)}</div> : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map(cat => (
                <Link key={cat.id} href={`/services/${cat.slug}`} className="card p-4 hover:shadow-md transition-shadow group">
                  <div className="flex items-start justify-between mb-2"><span className="text-2xl">{cat.icon}</span><ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" /></div>
                  <p className="font-semibold text-gray-900 text-sm">{cat.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">From ₹{cat.base_price}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="grid grid-cols-3 gap-3 text-center">
          {[{icon:'✅',label:'Verified workers'},{icon:'🔒',label:'Secure payments'},{icon:'📍',label:'Live tracking'}].map(b => (
            <div key={b.label} className="card p-3"><div className="text-xl mb-1">{b.icon}</div><p className="text-xs text-gray-600 font-medium">{b.label}</p></div>
          ))}
        </section>
      </main>
    </div>
  );
}
EOF

cat > "$BASE/frontend/app/(customer)/services/[category]/page.tsx" << 'EOF'
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { servicesApi } from '@/lib/api';
import { Star, MapPin, ArrowLeft, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface Worker { id: string; name: string; rating: number; rating_count: number; total_jobs: number; hourly_rate: number; experience_years: number; city: string; locality: string; is_available: boolean; is_background_verified: boolean; distance_km: number|null; category_name: string; }

export default function CategoryPage() {
  const { category } = useParams() as { category: string };
  const router = useRouter();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => servicesApi.workers({ category, lat: pos.coords.latitude, lng: pos.coords.longitude }).then(r => { setWorkers(r.data); setLoading(false); }),
      () => servicesApi.workers({ category }).then(r => { setWorkers(r.data); setLoading(false); })
    );
  }, [category]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <div><h1 className="font-bold text-gray-900 capitalize">{category.replace('-',' ')}</h1><p className="text-xs text-gray-400">{workers.length} workers available</p></div>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-4">
        {loading ? <div className="space-y-3">{Array.from({length:4}).map((_,i) => <div key={i} className="card p-4 animate-pulse h-28 bg-gray-100" />)}</div>
          : workers.length === 0 ? <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">🔍</p><p className="font-medium">No workers available</p></div>
          : <div className="space-y-3">
            {workers.map(w => (
              <Link key={w.id} href={`/book/${w.id}`} className="card p-4 flex gap-4 hover:shadow-md transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">{w.name?.[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="font-semibold text-gray-900 truncate">{w.name}</p>
                    {w.is_background_verified && <CheckCircle size={14} className="text-green-500 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
                    <span className="flex items-center gap-1"><Star size={13} className="text-yellow-400 fill-yellow-400" /><span className="font-medium text-gray-700">{w.rating||'—'}</span><span>({w.rating_count})</span></span>
                    <span>·</span><span>{w.total_jobs} jobs</span>
                    {w.distance_km !== null && <><span>·</span><span className="flex items-center gap-0.5"><MapPin size={12}/>{w.distance_km} km</span></>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{w.locality||w.city} · {w.experience_years}y exp</span>
                    <span className="font-bold text-blue-600 text-sm">₹{w.hourly_rate}/hr</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        }
      </div>
    </div>
  );
}
EOF

echo "✅ Home + services pages done"

cat > "$BASE/frontend/app/(customer)/book/[workerId]/page.tsx" << 'EOF'
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { servicesApi, bookingsApi, paymentsApi } from '@/lib/api';
import { Star, MapPin, ArrowLeft, Calendar, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
declare global { interface Window { Razorpay: any; } }

export default function BookPage() {
  const { workerId } = useParams() as { workerId: string };
  const router = useRouter();
  const [worker, setWorker] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([servicesApi.worker(workerId), servicesApi.slots(workerId)]).then(([wRes, sRes]) => { setWorker(wRes.data); setSlots(sRes.data); });
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; document.body.appendChild(script);
  }, [workerId]);

  const slotsByDate = slots.reduce((acc: Record<string, any[]>, slot: any) => {
    const d = slot.date.split('T')[0]; if (!acc[d]) acc[d] = []; acc[d].push(slot); return acc;
  }, {});

  async function handleBook() {
    if (!selectedSlot || !address.trim()) return;
    setError(''); setLoading(true);
    try {
      const bookingRes = await bookingsApi.create({ worker_id: workerId, slot_id: selectedSlot.id, address, description });
      const booking = bookingRes.data;
      const orderRes = await paymentsApi.createOrder(booking.id);
      const { order_id, amount, currency, key_id } = orderRes.data;
      const rzp = new window.Razorpay({
        key: key_id, amount, currency, name: 'ServeNow', order_id,
        handler: async (response: any) => {
          await paymentsApi.verify({ razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature, booking_id: booking.id });
          router.push(`/track/${booking.id}`);
        },
        theme: { color: '#2563eb' },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.open();
    } catch (err: any) { setError(err.response?.data?.error || 'Booking failed. Try again.'); setLoading(false); }
  }

  if (!worker) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading…</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <h1 className="font-bold text-gray-900">Book {worker.category_name}</h1>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div className="card p-4 flex gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">{worker.name[0]}</div>
          <div>
            <div className="flex items-center gap-1.5"><p className="font-semibold text-gray-900">{worker.name}</p>{worker.is_background_verified && <CheckCircle size={14} className="text-green-500" />}</div>
            <div className="flex items-center gap-1 mt-1"><Star size={13} className="text-yellow-400 fill-yellow-400" /><span className="text-sm font-medium">{worker.rating||'—'}</span><span className="text-sm text-gray-400">({worker.rating_count}) · ₹{worker.hourly_rate}/hr</span></div>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Calendar size={16} className="text-blue-600" /> Select date & time</h2>
          {Object.keys(slotsByDate).length === 0 ? <p className="text-gray-400 text-sm">No slots available.</p> : (
            <div className="space-y-4">
              {Object.entries(slotsByDate).map(([date, dateSlots]: [string, any[]]) => (
                <div key={date}>
                  <p className="text-xs font-medium text-gray-500 mb-2">{format(new Date(date), 'EEE, dd MMM yyyy')}</p>
                  <div className="flex flex-wrap gap-2">
                    {dateSlots.map((slot: any) => (
                      <button key={slot.id} onClick={() => setSelectedSlot(slot)} className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${selectedSlot?.id===slot.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                        {slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><MapPin size={16} className="text-blue-600" /> Service address</h2>
          <textarea className="input resize-none" rows={3} placeholder="Flat 4B, Tower A, Sector 62, Noida, UP 201301" value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Describe the problem <span className="text-gray-400 font-normal">(optional)</span></h2>
          <textarea className="input resize-none" rows={2} placeholder="e.g. Kitchen tap is leaking since morning…" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div><p className="font-bold text-gray-900 text-lg">₹{worker.hourly_rate}</p><p className="text-xs text-gray-400">per hour</p></div>
          <button className="btn-primary px-8" onClick={handleBook} disabled={!selectedSlot||!address.trim()||loading}>{loading ? 'Processing…' : 'Pay & Book →'}</button>
        </div>
      </div>
    </div>
  );
}
EOF

cat > "$BASE/frontend/app/(customer)/track/[jobId]/page.tsx" << 'EOF'
'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { bookingsApi } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { Loader } from '@googlemaps/js-api-loader';
import { Clock, MapPin, Phone, Star } from 'lucide-react';

const STATUS_STEPS = ['pending','accepted','in_progress','completed'];
const STATUS_LABELS: Record<string,string> = { pending:'Waiting for worker to accept', accepted:'Worker accepted — heading your way', in_progress:'Worker is at your location', completed:'Job completed! 🎉', cancelled:'Booking cancelled' };

export default function TrackPage() {
  const { jobId } = useParams() as { jobId: string };
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const workerMarker = useRef<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { bookingsApi.get(jobId).then(r => { setBooking(r.data); setLoading(false); }); }, [jobId]);

  useEffect(() => {
    if (!booking || !mapRef.current) return;
    const loader = new Loader({ apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!, version: 'weekly' });
    loader.load().then(() => {
      const center = { lat: booking.lat||28.6139, lng: booking.lng||77.2090 };
      mapInstance.current = new google.maps.Map(mapRef.current!, { center, zoom: 15, disableDefaultUI: true, zoomControl: true });
      new google.maps.Marker({ position: center, map: mapInstance.current, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png', scaledSize: new google.maps.Size(40,40) }, title: 'Your location' });
      if (booking.worker_lat && booking.worker_lng) updateWorker(booking.worker_lat, booking.worker_lng);
    });
  }, [booking]);

  function updateWorker(lat: number, lng: number) {
    if (!mapInstance.current) return;
    const pos = { lat, lng };
    if (workerMarker.current) { workerMarker.current.setPosition(pos); }
    else { workerMarker.current = new google.maps.Marker({ position: pos, map: mapInstance.current, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png', scaledSize: new google.maps.Size(48,48) }, title: 'Worker' }); }
    if (booking?.lat && booking?.lng) { const b = new google.maps.LatLngBounds(); b.extend(pos); b.extend({lat: booking.lat, lng: booking.lng}); mapInstance.current.fitBounds(b, 80); }
  }

  useEffect(() => {
    const socket = connectSocket();
    socket.emit('track:join', { booking_id: jobId });
    socket.on('worker:location', (data: { lat: number; lng: number }) => updateWorker(data.lat, data.lng));
    socket.on('job_started', () => setBooking((b: any) => b ? {...b, status:'in_progress'} : b));
    socket.on('job_completed', () => setBooking((b: any) => b ? {...b, status:'completed'} : b));
    return () => { socket.off('worker:location'); socket.off('job_started'); socket.off('job_completed'); };
  }, [jobId]);

  if (loading||!booking) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading tracking…</div></div>;
  const stepIndex = STATUS_STEPS.indexOf(booking.status);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div ref={mapRef} className="w-full h-[45vh] bg-gray-200" />
      <div className="flex-1 bg-white rounded-t-3xl -mt-4 relative z-10 p-5 space-y-5 overflow-auto">
        <div className={`rounded-xl p-3 text-sm font-medium ${booking.status==='completed'?'bg-green-50 text-green-800':booking.status==='cancelled'?'bg-red-50 text-red-800':'bg-blue-50 text-blue-800'}`}>{STATUS_LABELS[booking.status]||booking.status}</div>
        {booking.status !== 'cancelled' && (
          <div className="flex items-center gap-1">
            {STATUS_STEPS.map((_, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i<=stepIndex?'bg-blue-600 text-white':'bg-gray-200 text-gray-400'}`}>{i<stepIndex?'✓':i+1}</div>
                {i<STATUS_STEPS.length-1 && <div className={`h-1 flex-1 mx-1 rounded ${i<stepIndex?'bg-blue-600':'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-lg font-bold text-blue-600">{booking.worker_name[0]}</div>
          <div className="flex-1"><p className="font-semibold text-gray-900">{booking.worker_name}</p><div className="flex items-center gap-1"><Star size={12} className="text-yellow-400 fill-yellow-400" /><span className="text-sm text-gray-500">{booking.worker_rating}</span></div></div>
          <a href={`tel:+91${booking.worker_phone}`} className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white"><Phone size={18} /></a>
        </div>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex gap-2"><MapPin size={16} className="text-gray-400 flex-shrink-0 mt-0.5" /><span>{booking.address}</span></div>
          <div className="flex gap-2"><Clock size={16} className="text-gray-400 flex-shrink-0 mt-0.5" /><span>{new Date(booking.scheduled_at).toLocaleString('en-IN')}</span></div>
        </div>
        {booking.status === 'completed' && <a href={`/review/${booking.id}`} className="btn-primary w-full text-center block">⭐ Rate & Review</a>}
      </div>
    </div>
  );
}
EOF

cat > "$BASE/frontend/app/(customer)/dashboard/page.tsx" << 'EOF'
'use client';
import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string,string> = { pending:'badge-pending', accepted:'badge-accepted', in_progress:'badge-in_progress', completed:'badge-completed', cancelled:'badge-cancelled' };

export default function DashboardPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { bookingsApi.list(filter||undefined).then(r => { setBookings(r.data); setLoading(false); }); }, [filter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <h1 className="font-bold text-gray-900">My Bookings</h1>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {['','pending','accepted','in_progress','completed','cancelled'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${filter===s?'bg-blue-600 text-white':'bg-white text-gray-600 border border-gray-200'}`}>{s===''?'All':s.replace('_',' ')}</button>
          ))}
        </div>
        {loading ? <div className="space-y-3">{Array.from({length:3}).map((_,i) => <div key={i} className="card p-4 animate-pulse h-28 bg-gray-100" />)}</div>
          : bookings.length===0 ? <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">📋</p><p className="font-medium">No bookings yet</p><Link href="/" className="btn-primary inline-block mt-4 text-sm">Book a Service</Link></div>
          : <div className="space-y-3">{bookings.map((b:any) => (
            <Link key={b.id} href={`/track/${b.id}`} className="card p-4 block hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2"><span className="text-xl">{b.category_icon}</span><div><p className="font-semibold text-gray-900">{b.category_name}</p><p className="text-xs text-gray-400">{b.worker_name}</p></div></div>
                <span className={`badge ${STATUS_COLORS[b.status]||''}`}>{b.status.replace('_',' ')}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400 mt-2">
                <span className="flex items-center gap-1"><Clock size={12} />{new Date(b.scheduled_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">₹{(b.amount/100).toFixed(0)} · {b.payment_status}</span>
                {['accepted','in_progress'].includes(b.status) && <span className="text-xs text-blue-600 font-medium">Track live →</span>}
              </div>
            </Link>
          ))}</div>
        }
      </div>
    </div>
  );
}
EOF

cat > "$BASE/frontend/app/(customer)/review/[bookingId]/page.tsx" << 'EOF'
'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { reviewsApi } from '@/lib/api';
import { Star, ArrowLeft } from 'lucide-react';

export default function ReviewPage() {
  const { bookingId } = useParams() as { bookingId: string };
  const router = useRouter();
  const [rating, setRating] = useState(0); const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState(''); const [loading, setLoading] = useState(false); const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (rating === 0) return;
    setLoading(true);
    try { await reviewsApi.submit({ booking_id: bookingId, rating, comment }); setSubmitted(true); setTimeout(() => router.push('/dashboard'), 2000); }
    catch { alert('Failed to submit. You may have already reviewed this booking.'); }
    finally { setLoading(false); }
  }

  if (submitted) return <div className="min-h-screen flex items-center justify-center text-center px-4"><div><p className="text-5xl mb-4">🎉</p><h2 className="text-xl font-bold text-gray-900">Thanks for your review!</h2><p className="text-gray-500 mt-2">Redirecting…</p></div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100"><div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3"><button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button><h1 className="font-bold text-gray-900">Rate your experience</h1></div></header>
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="card p-6 text-center">
          <p className="text-gray-500 mb-4 text-sm">How was the service?</p>
          <div className="flex justify-center gap-3 mb-6">
            {[1,2,3,4,5].map(s => <button key={s} onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)} onClick={() => setRating(s)}><Star size={36} className={`transition-colors ${s<=(hovered||rating)?'text-yellow-400 fill-yellow-400':'text-gray-300'}`} /></button>)}
          </div>
          <textarea className="input resize-none text-sm" rows={3} placeholder="Share your experience (optional)…" value={comment} onChange={e => setComment(e.target.value)} />
          <button className="btn-primary w-full mt-4" onClick={handleSubmit} disabled={rating===0||loading}>{loading?'Submitting…':'Submit Review'}</button>
        </div>
      </div>
    </div>
  );
}
EOF

echo "✅ Customer pages done"

cat > "$BASE/frontend/app/(worker)/worker/dashboard/page.tsx" << 'EOF'
'use client';
import { useEffect, useState } from 'react';
import { bookingsApi, jobsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { connectSocket } from '@/lib/socket';
import { useRouter } from 'next/navigation';
import { MapPin, Clock, CheckCircle, ToggleLeft, ToggleRight, Phone } from 'lucide-react';

export default function WorkerDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'worker') { router.push('/'); return; }
    Promise.all([bookingsApi.list(), jobsApi.earnings()]).then(([bRes, eRes]) => { setBookings(bRes.data); setEarnings(eRes.data); setLoading(false); });
    const socket = connectSocket();
    socket.on('new_booking', () => bookingsApi.list().then(r => setBookings(r.data)));
    const locationInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(pos => socket.emit('worker:location', { lat: pos.coords.latitude, lng: pos.coords.longitude }));
    }, 15000);
    return () => { socket.off('new_booking'); clearInterval(locationInterval); };
  }, [user, router]);

  async function toggleAvailability() { const socket = connectSocket(); socket.emit('worker:availability', { available: !available }); setAvailable(!available); }

  async function handleAction(bookingId: string, action: 'accept'|'start'|'complete') {
    const actions = { accept: jobsApi.accept, start: jobsApi.start, complete: jobsApi.complete };
    await actions[action](bookingId);
    const res = await bookingsApi.list();
    setBookings(res.data);
  }

  const pending = bookings.filter(b => b.status === 'pending');
  const active = bookings.filter(b => ['accepted','in_progress'].includes(b.status));
  const done = bookings.filter(b => b.status === 'completed').slice(0,5);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div><p className="font-bold text-gray-900">Hey, {user?.name?.split(' ')[0]} 👋</p><p className="text-xs text-gray-400">Worker dashboard</p></div>
          <button onClick={toggleAvailability} className="flex items-center gap-2 text-sm font-medium">
            {available ? <><ToggleRight size={28} className="text-green-500" /><span className="text-green-600">Available</span></> : <><ToggleLeft size={28} className="text-gray-400" /><span className="text-gray-500">Off</span></>}
          </button>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
        {earnings && (
          <div className="grid grid-cols-2 gap-3">
            {[{label:'This week',val:`₹${Math.floor(Number(earnings.this_week)/100)}`},{label:'This month',val:`₹${Math.floor(Number(earnings.this_month)/100)}`},{label:'Total earned',val:`₹${Math.floor(Number(earnings.total_earnings)/100)}`},{label:'Total jobs',val:earnings.total_jobs}].map(s => (
              <div key={s.label} className="card p-4"><p className="text-xs text-gray-400 mb-1">{s.label}</p><p className="text-xl font-bold text-gray-900">{s.val}</p></div>
            ))}
          </div>
        )}
        {pending.length > 0 && <section><h2 className="font-semibold text-gray-900 mb-2">New requests ({pending.length})</h2><div className="space-y-3">{pending.map((b:any) => <BookingCard key={b.id} booking={b} onAccept={() => handleAction(b.id,'accept')} />)}</div></section>}
        {active.length > 0 && <section><h2 className="font-semibold text-gray-900 mb-2">Active jobs</h2><div className="space-y-3">{active.map((b:any) => <BookingCard key={b.id} booking={b} onStart={b.status==='accepted'?() => handleAction(b.id,'start'):undefined} onComplete={b.status==='in_progress'?() => handleAction(b.id,'complete'):undefined} />)}</div></section>}
        {done.length > 0 && <section><h2 className="font-semibold text-gray-900 mb-2">Recent completions</h2><div className="space-y-2">{done.map((b:any) => <div key={b.id} className="card p-3 flex items-center gap-3 opacity-75"><CheckCircle size={18} className="text-green-500 flex-shrink-0" /><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-700 truncate">{b.customer_name}</p><p className="text-xs text-gray-400">{new Date(b.scheduled_at).toLocaleDateString('en-IN')}</p></div><span className="text-sm font-bold text-gray-700">₹{Math.floor(b.amount/100)}</span></div>)}</div></section>}
        {pending.length===0 && active.length===0 && !loading && <div className="text-center py-16 text-gray-400"><p className="text-4xl mb-3">⏳</p><p className="font-medium">No pending bookings</p><p className="text-sm mt-1">Stay online to receive requests</p></div>}
      </div>
    </div>
  );
}

function BookingCard({ booking, onAccept, onStart, onComplete }: { booking: any; onAccept?: ()=>void; onStart?: ()=>void; onComplete?: ()=>void; }) {
  const [loading, setLoading] = useState(false);
  async function handle(fn: ()=>void) { setLoading(true); await fn(); setLoading(false); }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2"><span className="text-xl">{booking.category_icon}</span><div><p className="font-semibold text-gray-900">{booking.category_name}</p><p className="text-xs text-gray-400">{booking.customer_name}</p></div></div>
        <span className="font-bold text-blue-600">₹{Math.floor(booking.amount/100)}</span>
      </div>
      <div className="space-y-1 text-xs text-gray-500 mb-3">
        <div className="flex gap-1.5"><Clock size={12} className="flex-shrink-0 mt-0.5" />{new Date(booking.scheduled_at).toLocaleString('en-IN')}</div>
        <div className="flex gap-1.5"><MapPin size={12} className="flex-shrink-0 mt-0.5" />{booking.address}</div>
      </div>
      <div className="flex gap-2">
        <a href={`tel:+91${booking.customer_phone}`} className="btn-secondary flex-shrink-0 px-3 py-2 flex items-center gap-1 text-sm"><Phone size={14} /> Call</a>
        {onAccept && <button onClick={() => handle(onAccept)} disabled={loading} className="btn-primary flex-1 text-sm py-2">{loading?'…':'Accept Job'}</button>}
        {onStart && <button onClick={() => handle(onStart)} disabled={loading} className="btn-primary flex-1 text-sm py-2 bg-purple-600 hover:bg-purple-700">{loading?'…':'Start Job'}</button>}
        {onComplete && <button onClick={() => handle(onComplete)} disabled={loading} className="btn-primary flex-1 text-sm py-2 bg-green-600 hover:bg-green-700">{loading?'…':'Mark Complete'}</button>}
      </div>
    </div>
  );
}
EOF

cat > "$BASE/frontend/app/(worker)/worker/setup/page.tsx" << 'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const TIMES = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

export default function WorkerSetupPage() {
  const router = useRouter();
  const [bio, setBio] = useState(''); const [exp, setExp] = useState(1); const [rate, setRate] = useState(300);
  const [skills, setSkills] = useState(''); const [pincode, setPincode] = useState(''); const [pincodeInfo, setPincodeInfo] = useState<any>(null);
  const [slots, setSlots] = useState([{day:'Monday',start:'09:00',end:'17:00'},{day:'Tuesday',start:'09:00',end:'17:00'}]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');

  async function lookupPincode() {
    if (pincode.length !== 6) return;
    try { const r = await fetch(`https://api.postalpincode.in/pincode/${pincode}`); const d = await r.json(); if (d[0]?.Status==='Success') setPincodeInfo({ city: d[0].PostOffice[0].District, locality: d[0].PostOffice[0].Name }); } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bio.trim()) return setError('Please add a bio');
    if (slots.length === 0) return setError('Add at least one slot');
    setError(''); setLoading(true);
    try {
      if (pincode) await api.patch('/auth/profile', { pincode });
      await api.post('/workers/setup', { bio, experience_years: exp, hourly_rate: rate, skills: skills.split(',').map(s=>s.trim()).filter(Boolean), slots: slots.map(s => ({ day_of_week: DAYS.indexOf(s.day), start_time: s.start, end_time: s.end })) });
      router.push('/worker/dashboard');
    } catch (err: any) { setError(err.response?.data?.error || 'Setup failed. Try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white border-b border-gray-100"><div className="max-w-2xl mx-auto px-4 py-4"><h1 className="font-bold text-xl text-gray-900">Complete your worker profile</h1><p className="text-sm text-gray-500 mt-1">This is shown to customers before they book you</p></div></header>
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">About you</h2>
          <div><label className="block text-sm text-gray-600 mb-1">Short bio</label><textarea className="input resize-none" rows={3} placeholder="Experienced plumber with 5 years in residential repairs…" value={bio} onChange={e=>setBio(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm text-gray-600 mb-1">Experience (years)</label><input type="number" min={0} max={50} className="input" value={exp} onChange={e=>setExp(Number(e.target.value))} /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Hourly rate (₹)</label><input type="number" min={100} max={5000} step={50} className="input" value={rate} onChange={e=>setRate(Number(e.target.value))} /></div>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Skills (comma separated)</label><input className="input" placeholder="Pipe fitting, drain cleaning" value={skills} onChange={e=>setSkills(e.target.value)} /></div>
        </div>
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Service area</h2>
          <div className="flex gap-2"><input className="input flex-1" placeholder="Pincode e.g. 201301" maxLength={6} value={pincode} onChange={e=>setPincode(e.target.value.replace(/\D/g,''))} onBlur={lookupPincode} /><button type="button" onClick={lookupPincode} className="btn-secondary px-4 text-sm">Lookup</button></div>
          {pincodeInfo && <p className="text-sm text-green-600 font-medium">✅ {pincodeInfo.locality}, {pincodeInfo.city}</p>}
        </div>
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900">Availability slots</h2><button type="button" onClick={() => setSlots([...slots,{day:'Wednesday',start:'09:00',end:'17:00'}])} className="text-sm text-blue-600 font-medium">+ Add slot</button></div>
          <div className="space-y-3">
            {slots.map((slot,i) => (
              <div key={i} className="flex gap-2 items-center">
                <select className="input flex-1 text-sm" value={slot.day} onChange={e=>{const s=[...slots];s[i].day=e.target.value;setSlots(s);}}>{DAYS.map(d=><option key={d}>{d}</option>)}</select>
                <select className="input w-24 text-sm" value={slot.start} onChange={e=>{const s=[...slots];s[i].start=e.target.value;setSlots(s);}}>{TIMES.map(t=><option key={t}>{t}</option>)}</select>
                <span className="text-gray-400">–</span>
                <select className="input w-24 text-sm" value={slot.end} onChange={e=>{const s=[...slots];s[i].end=e.target.value;setSlots(s);}}>{TIMES.map(t=><option key={t}>{t}</option>)}</select>
                <button type="button" onClick={()=>setSlots(slots.filter((_,idx)=>idx!==i))} className="text-red-400 hover:text-red-600 px-2 text-lg">×</button>
              </div>
            ))}
          </div>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">{error}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-3">{loading?'Saving…':'Save Profile & Go Live →'}</button>
      </form>
    </div>
  );
}
EOF

cat > "$BASE/frontend/app/admin/page.tsx" << 'EOF'
'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { CheckCircle, Clock, AlertCircle, TrendingUp, ShieldCheck } from 'lucide-react';

type Tab = 'overview'|'bookings'|'workers';

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!user) { router.push('/login'); return; } if (user.role !== 'admin') { router.push('/'); return; } adminApi.stats().then(r => { setStats(r.data); setLoading(false); }); }, [user,router]);
  useEffect(() => { if (tab==='bookings'&&bookings.length===0) adminApi.bookings().then(r=>setBookings(r.data)); if (tab==='workers'&&workers.length===0) adminApi.workers().then(r=>setWorkers(r.data)); }, [tab]);

  if (loading||!stats) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-gray-400">Loading…</div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="text-xl">⚡</span><span className="font-bold text-gray-900">ServeNow Admin</span></div>
          <span className="badge bg-red-100 text-red-700">Admin</span>
        </div>
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pb-0">
          {(['overview','bookings','workers'] as Tab[]).map(t => <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${tab===t?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>)}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {tab==='overview' && <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-5"><p className="text-xs text-gray-400 mb-1">Total GMV</p><p className="text-2xl font-bold text-gray-900">₹{Math.floor(Number(stats.revenue.total_gmv)/100).toLocaleString('en-IN')}</p></div>
            <div className="card p-5"><p className="text-xs text-gray-400 mb-1">This month</p><p className="text-2xl font-bold text-blue-600">₹{Math.floor(Number(stats.revenue.this_month_gmv)/100).toLocaleString('en-IN')}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[{label:'Today',value:stats.bookings.today,icon:Clock,color:'text-blue-600'},{label:'Completed',value:stats.bookings.completed,icon:CheckCircle,color:'text-green-600'},{label:'Cancelled',value:stats.bookings.cancelled,icon:AlertCircle,color:'text-red-500'},{label:'Pending',value:stats.bookings.pending,icon:Clock,color:'text-yellow-600'},{label:'In progress',value:stats.bookings.in_progress,icon:TrendingUp,color:'text-purple-600'},{label:'Total',value:stats.bookings.total,icon:CheckCircle,color:'text-gray-700'}].map(s => (
              <div key={s.label} className="card p-4"><s.icon size={16} className={`${s.color} mb-2`} /><p className="text-xl font-bold text-gray-900">{s.value}</p><p className="text-xs text-gray-400">{s.label}</p></div>
            ))}
          </div>
        </div>}
        {tab==='bookings' && <div className="space-y-3">{bookings.map((b:any) => <div key={b.id} className="card p-4"><div className="flex items-center justify-between mb-2"><div><p className="font-semibold text-gray-900 text-sm">{b.category_name}</p><p className="text-xs text-gray-400">{b.customer_name} → {b.worker_name}</p></div><div className="text-right"><span className={`badge badge-${b.status}`}>{b.status.replace('_',' ')}</span><p className="text-xs text-gray-400 mt-1">₹{Math.floor(b.amount/100)}</p></div></div><p className="text-xs text-gray-400">{new Date(b.scheduled_at).toLocaleString('en-IN')} · ID: {b.id.slice(0,8)}</p></div>)}</div>}
        {tab==='workers' && <div className="space-y-3">{workers.map((w:any) => <div key={w.id} className="card p-4 flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-lg font-bold text-blue-600 flex-shrink-0">{w.name[0]}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="font-semibold text-gray-900 text-sm">{w.name}</p>{w.is_background_verified&&<ShieldCheck size={14} className="text-green-500" />}</div><p className="text-xs text-gray-400">{w.category_name} · ⭐ {w.rating} · {w.total_jobs} jobs</p></div><div className="flex flex-col items-end gap-2"><span className={`text-xs font-medium ${w.is_available?'text-green-600':'text-gray-400'}`}>{w.is_available?'Online':'Offline'}</span>{!w.is_background_verified&&<button onClick={()=>adminApi.verifyWorker(w.id).then(()=>setWorkers(ws=>ws.map(x=>x.id===w.id?{...x,is_background_verified:true}:x)))} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg">Verify</button>}</div></div>)}</div>}
      </main>
    </div>
  );
}
EOF

echo "✅ Worker + admin pages done"
echo ""
echo "🎉 ALL FILES CREATED SUCCESSFULLY!"
echo ""
echo "Now run:"
echo "  cd $BASE/backend && npm install"
echo "  cd $BASE/frontend && npm install"
