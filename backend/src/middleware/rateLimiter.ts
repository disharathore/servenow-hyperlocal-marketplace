import rateLimit from 'express-rate-limit';
export const rateLimiter = rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests.' } });

const otpKey = (req: { ip?: string; body?: Record<string, unknown> }) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone : 'unknown-phone';
  return `${req.ip || 'unknown-ip'}:${phone}`;
};

export const otpLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 2,
	keyGenerator: otpKey,
	skip: () => process.env.NODE_ENV === 'development',
	message: { error: 'Too many OTP requests. Try after 15 minutes.' },
});

export const otpVerifyLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 5,
	keyGenerator: otpKey,
	skip: () => process.env.NODE_ENV === 'development',
	message: { error: 'Too many OTP verification attempts. Try again later.' },
});
