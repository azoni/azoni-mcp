import rateLimit from 'express-rate-limit';

// Global rate limit: 100 requests per minute per IP
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Write rate limit: 10 requests per minute per IP (POST/PATCH/DELETE)
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests, please try again later' },
  skip: (req) => req.method === 'GET',
});
