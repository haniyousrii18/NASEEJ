import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { buildTimeline, parseTimelineQuery } from '../services/recordService.js';
import { buildPatientSummary } from '../services/patientSummary.js';
import { apiError, serverError } from '../services/validation.js';

export const portalRouter = Router();

portalRouter.use(authenticate, requirePatient);

// GET /api/portal/summary (Longitudinal summary of APPROVED health information)
portalRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await buildPatientSummary(req.user!.patientProfileId!) });
  } catch (err: any) {
    console.error('Portal summary error:', err);
    res.status(500).json(serverError(err));
  }
});

// GET /api/portal/timeline (the patient's longitudinal record: approved and released items only, every center)
portalRouter.get('/timeline', async (req: Request, res: Response): Promise<void> => {
  const parsed = parseTimelineQuery(req.query);
  if ('error' in parsed) {
    res.status(400).json(apiError('VALIDATION_ERROR', parsed.error));
    return;
  }
  try {
    const result = await buildTimeline({ kind: 'patient', patientId: req.user!.patientProfileId! }, parsed.options);
    res.json({
      success: true,
      data: result.items,
      meta: { limit: parsed.options.limit, hasMore: result.hasMore, nextBefore: result.nextBefore },
    });
  } catch (err: any) {
    console.error('Portal timeline error:', err);
    res.status(500).json(serverError(err));
  }
});
