import { createHash, createHmac, randomBytes } from 'crypto';
import { ENV } from '../../config/env.js';

/**
 * Share tokens: 256 random bits, URL-safe, shown once and never stored. The database keeps only the SHA-256 of the token, so a
 * database leak does not give access to any share. Nothing in a token encodes the patient, the record or a time.
 */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const generateToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const isTokenShape = (v: unknown): v is string => typeof v === 'string' && TOKEN_RE.test(v);

/** A keyed, truncated hash of the client address: it can tell "same device again", it cannot be turned back into an address. */
export const hashIp = (ip: string | undefined): string | null =>
  ip ? createHmac('sha256', `share-ip:${ENV.JWT_SECRET}`).update(ip).digest('hex').slice(0, 16) : null;

export function deviceClass(userAgent: string | undefined): 'mobile' | 'desktop' | 'other' {
  if (!userAgent) return 'other';
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return 'mobile';
  if (/mozilla|chrome|safari|firefox|edge/i.test(userAgent)) return 'desktop';
  return 'other';
}

/** Lifetime in hours, within 1 hour and the configured maximum. */
export function parseLifetimeHours(v: unknown, max = ENV.SHARE_MAX_HOURS): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > max) return null;
  return v;
}
