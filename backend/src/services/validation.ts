// Small, dependency-free request validators shared by the route modules.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Escapes the LIKE wildcards (% _ \\) so user text matches literally. Pair with `LIKE ... ESCAPE '\\'`. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const isTime = (v: unknown): v is string => typeof v === 'string' && TIME_RE.test(v);

/** Minutes since midnight for HH:MM or HH:MM:SS. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? Math.trunc(value) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export function trimmed(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t || t.length > max) return null;
  return t;
}

export function apiError(code: string, message: string, details?: unknown) {
  return { success: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/** Error body for unexpected failures: never echoes internals to the client outside development. */
export function serverError(err: unknown) {
  const message = process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : 'An unexpected error occurred.';
  return apiError('SERVER_ERROR', message);
}
