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
export async function acquirePaymentHold(bookingId: string, customerId: string, ttlSeconds = 120): Promise<boolean> {
  const r = await redis.set(`payment_hold:${bookingId}`, customerId, 'EX', ttlSeconds, 'NX');
  return r === 'OK';
}
export async function releasePaymentHold(bookingId: string) {
  await redis.del(`payment_hold:${bookingId}`);
}
export async function storeOtp(phone: string, otp: string) { await redis.set(`otp:${phone}`, otp, 'EX', 300); }
export async function getOtp(phone: string) { return redis.get(`otp:${phone}`); }
export async function deleteOtp(phone: string) { await redis.del(`otp:${phone}`); }
export async function setWorkerOnline(wid: string, sid: string) { await redis.hset('workers:online', wid, sid); }
export async function setWorkerOffline(wid: string) { await redis.hdel('workers:online', wid); }
