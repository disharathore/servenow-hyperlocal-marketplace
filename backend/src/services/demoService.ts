/**
 * Demo Mode Service
 * Handles demo user creation and authentication
 */

import { query } from '../db/client';
import crypto from 'crypto';
import { signToken, signRefreshToken } from '../middleware/auth';

const DEMO_USERS = {
  customer: {
    phone: '9999999991',
    name: 'Demo Customer',
    role: 'customer',
  },
  worker: {
    phone: '9999999992',
    name: 'Demo Worker',
    role: 'worker',
  },
};

const refreshHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Initialize demo users in database
 */
export async function initializeDemoUsers() {
  try {
    for (const [type, userData] of Object.entries(DEMO_USERS)) {
      const existing = await query('SELECT id FROM users WHERE phone = $1', [userData.phone]);

      if (existing.rows[0]) {
        console.log(`Demo ${type} already exists`);
        continue;
      }

      // Create demo user
      const userResult = await query(
        `INSERT INTO users (phone, name, role, is_verified, pincode, city, locality, lat, lng)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          userData.phone,
          userData.name,
          userData.role,
          '400001', // Mumbai pincode
          'Mumbai',
          'Demo Location',
          19.0760, // Mumbai latitude
          72.8777, // Mumbai longitude
        ]
      );

      const userId = userResult.rows[0].id;

      // If worker, create worker profile
      if (type === 'worker') {
        const categoryResult = await query(
          "SELECT id FROM categories WHERE slug = 'plumber' LIMIT 1"
        );

        if (categoryResult.rows[0]) {
          const categoryId = categoryResult.rows[0].id;

          const workerProfileResult = await query(
            `INSERT INTO worker_profiles 
             (user_id, category_id, bio, experience_years, hourly_rate, 
              is_available, is_background_verified, total_jobs, rating, rating_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (user_id) DO UPDATE SET
               category_id = EXCLUDED.category_id,
               bio = EXCLUDED.bio,
               experience_years = EXCLUDED.experience_years,
               hourly_rate = EXCLUDED.hourly_rate,
               is_available = EXCLUDED.is_available,
               is_background_verified = EXCLUDED.is_background_verified,
               total_jobs = EXCLUDED.total_jobs,
               rating = EXCLUDED.rating,
               rating_count = EXCLUDED.rating_count
             RETURNING id`,
            [
              userId,
              categoryId,
              'Demo worker - try the platform for free!',
              5,
              299, // base price for plumber
              true,
              true,
              25,
              4.5,
              12,
            ]
          );

          const workerProfileId = workerProfileResult.rows[0]?.id;
          if (!workerProfileId) continue;

          // Create sample availability slots (9 AM to 6 PM, Mon-Fri)
          const today = new Date();
          for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
            const date = new Date(today);
            date.setDate(today.getDate() + dayOffset);
            const dayOfWeek = date.getDay();

            // Skip weekends for demo
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            const dateStr = date.toISOString().split('T')[0];

            // Create 3 time slots per day
            const slots = [
              { start: '09:00', end: '11:00' },
              { start: '14:00', end: '16:00' },
              { start: '16:00', end: '18:00' },
            ];

            for (const slot of slots) {
              await query(
                `INSERT INTO availability_slots 
                 (worker_id, date, start_time, end_time, is_booked)
                 VALUES ($1, $2, $3::time, $4::time, false)
                 ON CONFLICT (worker_id, date, start_time) DO NOTHING`,
                [workerProfileId, dateStr, slot.start, slot.end]
              );
            }
          }
        }
      }

      console.log(`✅ Created demo ${type}: ${userData.phone}`);
    }
  } catch (err) {
    console.error('Failed to initialize demo users:', err);
    throw err;
  }
}

/**
 * Issue auth tokens for demo user
 */
async function issueAuthTokens(user: { id: string; phone: string; role: string }) {
  const accessToken = signToken({ userId: user.id, phone: user.phone, role: user.role });
  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ userId: user.id, tokenId, type: 'refresh' });

  const expiresInMs = (() => {
    const v = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
    if (v.endsWith('d')) return Number(v.slice(0, -1)) * 24 * 60 * 60 * 1000;
    if (v.endsWith('h')) return Number(v.slice(0, -1)) * 60 * 60 * 1000;
    if (v.endsWith('m')) return Number(v.slice(0, -1)) * 60 * 1000;
    return 30 * 24 * 60 * 60 * 1000;
  })();
  const expiresAt = new Date(Date.now() + expiresInMs);

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [tokenId, user.id, refreshHash(refreshToken), expiresAt]
  );

  return { token: accessToken, refresh_token: refreshToken };
}

/**
 * Demo login - skip OTP, auto-login as demo user
 */
export async function demoDemoLogin(type: 'customer' | 'worker') {
  const userData = DEMO_USERS[type];

  if (!userData) {
    throw new Error('Invalid demo user type');
  }

  const userResult = await query('SELECT * FROM users WHERE phone = $1', [userData.phone]);

  if (!userResult.rows[0]) {
    throw new Error('Demo user not found. Please initialize demo users first.');
  }

  const user = userResult.rows[0];

  if (!user.is_active) {
    throw new Error('Demo account is disabled');
  }

  const tokens = await issueAuthTokens({
    id: user.id,
    phone: user.phone,
    role: user.role,
  });

  return {
    ...tokens,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      pincode: user.pincode,
      is_demo: true,
    },
  };
}
