import { rateLimit } from 'express-rate-limit';
import { apiError } from './validation.js';

/**
 * A generous ceiling per client address for the patient API routers, in front of authentication and the database.
 * The tighter limits (assistant, public share view) live in ./rateLimit.ts. Per process and in memory, like those:
 * behind several API instances use a shared store.
 */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(apiError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'));
  },
});
