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

export async function ensureSchemaCompatibility() {
  await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await query(`
    CREATE TABLE IF NOT EXISTS blocked_slots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      worker_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      time_slot VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_slots_worker_date_time_slot ON blocked_slots(worker_id, date, time_slot)');
  await query('CREATE INDEX IF NOT EXISTS idx_blocked_slots_worker_date ON blocked_slots(worker_id, date)');
}

export default pool;
