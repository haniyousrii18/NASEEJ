import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { parseTarget, parseTexts, translateTexts, type TranslationItem } from '../services/health/translate.js';
import { rateLimit } from '../services/rateLimit.js';
import { apiError, serverError } from '../services/validation.js';
import { apiLimiter } from '../services/apiLimit.js';

/**
 * POST /api/translate  { texts: string[], target: 'ar' | 'en' }
 * Translates text the signed-in patient (or what they entered) wrote. The text goes to the configured AI provider, so it
 * needs the same permission as the assistant. Without it, or when AI is off, every item comes back "unavailable" and the
 * browser shows the original with a note: this never fails the page.
 */
export const translateRouter = Router();
translateRouter.use(apiLimiter, authenticate, requirePatient);
translateRouter.use(rateLimit({ windowMs: 60_000, max: 30, key: (req) => `translate:${req.user!.id}`, code: 'RATE_LIMITED', message: 'Slow down a little and try again in a moment.' }));

export async function patientHasConsented(patientId: string): Promise<boolean> {
  const r = await query('SELECT ai_assistant_consent_at FROM patient_profiles WHERE id = $1', [patientId]);
  return !!r.rows[0]?.ai_assistant_consent_at;
}

export const allUnavailable = (n: number, reason: 'consent' | 'not_allowed'): TranslationItem[] => Array.from({ length: n }, () => ({ status: 'unavailable', reason }));

translateRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const texts = parseTexts(req.body?.texts);
  const target = parseTarget(req.body?.target);
  if (!texts || !target) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Send 1 to 20 texts of at most 2000 characters and a target language (ar or en).'));
  try {
    const items = (await patientHasConsented(req.user!.patientProfileId!)) ? await translateTexts(texts, target) : allUnavailable(texts.length, 'consent');
    res.json({ success: true, data: { items } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
