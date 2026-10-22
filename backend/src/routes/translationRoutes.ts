import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { parseTarget, parseTexts, translateForPatient } from '../services/translation/service.js';
import { rateLimit } from '../services/rateLimit.js';
import { apiError, serverError } from '../services/validation.js';
import { apiLimiter } from '../services/apiLimit.js';

/**
 * POST /api/translations  { texts: string[], target: 'ar' | 'en' }
 * Translations of what the signed-in patient typed, for the language the page is showing. Stored and reused; never done by
 * the assistant or any AI. Without a configured provider every foreign-language text comes back "unavailable" and the page
 * shows the original with a note.
 */
export const translationRouter = Router();
translationRouter.use(apiLimiter, authenticate, requirePatient);
translationRouter.use(rateLimit({ windowMs: 60_000, max: 60, key: (req) => `translations:${req.user!.id}`, code: 'RATE_LIMITED', message: 'Slow down a little and try again in a moment.' }));

translationRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const texts = parseTexts(req.body?.texts);
  const target = parseTarget(req.body?.target);
  if (!texts || !target) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Send 1 to 20 texts of at most 2000 characters and a target language (ar or en).'));
  try {
    res.json({ success: true, data: { items: await translateForPatient(req.user!.patientProfileId!, texts, target) } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
