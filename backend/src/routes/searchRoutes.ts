import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { apiLimiter } from '../services/apiLimit.js';
import { cleanQuery } from '../services/search/normalize.js';
import { MAX_QUERY, MIN_QUERY, SEARCH_TYPES, searchRecords } from '../services/search/searchService.js';
import { apiError, clampInt, serverError } from '../services/validation.js';

/**
 * GET /api/search?q=&types=&limit=&offset=&lang=
 * Bilingual, typo-tolerant search over the signed-in patient's own record. The patient is the one in the session; nothing in
 * the request can name another patient. The results are always read live (no cache, no index), so they can never show a
 * deleted record or miss a new one. `lang` only chooses which stored name is used as a title; it does not limit what matches.
 */
export const searchRouter = Router();
searchRouter.use(apiLimiter, authenticate, requirePatient);

searchRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const q = cleanQuery(req.query.q, MAX_QUERY + 1);
  if (q.length < MIN_QUERY || q.length > MAX_QUERY) return void res.status(400).json(apiError('VALIDATION_ERROR', `Search for ${MIN_QUERY} to ${MAX_QUERY} characters.`));
  const types = typeof req.query.types === 'string' && req.query.types ? req.query.types.split(',').map((t) => t.trim()).filter(Boolean).slice(0, SEARCH_TYPES.length) : undefined;
  if (types && types.some((t) => !(SEARCH_TYPES as readonly string[]).includes(t))) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Unknown search type.'));
  const limit = clampInt(req.query.limit, 20, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 1000);
  try {
    const { hits, total } = await searchRecords(req.user!.patientProfileId!, q, { types, limit, offset, lang: req.query.lang === 'en' ? 'en' : 'ar' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: hits, meta: { total, limit, offset, hasMore: offset + hits.length < total } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});
