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

// ─── Helpers ─────────────────────────────────────────────

// Acquire a distributed lock (for slot booking)
export async function acquireLock(key: string, ttlSeconds = 10): Promise<boolean> {
  const result = await redis.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`);
}

// OTP store
export async function storeOtp(phone: string, otp: string): Promise<void> {
  await redis.set(`otp:${phone}`, otp, 'EX', 300); // 5 min
}

export async function getOtp(phone: string): Promise<string | null> {
  return redis.get(`otp:${phone}`);
}

export async function deleteOtp(phone: string): Promise<void> {
  await redis.del(`otp:${phone}`);
}

// Worker online status
export async function setWorkerOnline(workerId: string, socketId: string): Promise<void> {
  await redis.hset('workers:online', workerId, socketId);
  await redis.expire('workers:online', 86400);
}

export async function setWorkerOffline(workerId: string): Promise<void> {
  await redis.hdel('workers:online', workerId);
}

export async function getWorkerSocket(workerId: string): Promise<string | null> {
  return redis.hget('workers:online', workerId);
}
