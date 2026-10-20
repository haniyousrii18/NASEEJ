import { NextFunction, Request, Response } from 'express';
import { apiError } from './validation.js';

/**
 * A small in-memory sliding-window limiter. It is per process: behind several API instances use a shared store
 * (Redis) instead. Keys are never logged. Used for the public share endpoints and AI routes.
 */
export interface LimitOptions {
  windowMs: number;
  max: number;
  /** Derives the bucket key from the request. Defaults to the client address. */
  key?: (req: Request) => string;
  code?: string;
  message?: string;
}

export class SlidingWindow {
  private hits = new Map<string, number[]>();
  constructor(private windowMs: number, private max: number) {}

  /** Records a hit and tells whether it is within the limit; `retryAfterSec` is set when it is not. */
  hit(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const cutoff = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000)) };
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 5000) this.sweep(now);
    return { allowed: true, retryAfterSec: 0 };
  }

  /** Counts without recording. */
  count(key: string, now = Date.now()): number {
    return (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs).length;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => t > now - this.windowMs)) this.hits.delete(k);
  }
}

export function rateLimit(options: LimitOptions) {
  const window = new SlidingWindow(options.windowMs, options.max);
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.key ? options.key(req) : req.ip || 'unknown';
    const result = window.hit(key);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      res.status(429).json(apiError(options.code ?? 'RATE_LIMITED', options.message ?? 'Too many requests. Please wait a moment and try again.', { retryAfterSec: result.retryAfterSec }));
      return;
    }
    next();
  };
}
