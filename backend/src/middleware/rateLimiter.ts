import rateLimit from 'express-rate-limit';
export const rateLimiter = rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } });
export const otpLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 3,
	skip: () => process.env.NODE_ENV === 'development',
	message: { error: 'Too many OTP requests. Try after 10 minutes.' },
});
