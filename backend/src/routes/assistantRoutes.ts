import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { ENV } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { requirePatient } from '../middleware/rbac.js';
import { chatStatus } from '../services/ai/chat.js';
import { logAuditEvent } from '../services/auditService.js';
import { AssistantError, hourlyCount, preCheck, recordInteraction, runChat, runOverview, validateMessages } from '../services/health/assistantService.js';
import { parsePrepContent, verifyRefs } from '../services/health/prep.js';
import { URGENT_MESSAGE, isUrgentText } from '../services/health/safety.js';
import { rateLimit } from '../services/rateLimit.js';
import { apiError, isUuid, serverError } from '../services/validation.js';

/**
 * Patient assistant API. The model sits behind this file: no key, prompt, safety rule or permission lives in the browser.
 * Every route is for the signed-in patient only; the record that grounds a reply is read here by the patient's own profile id.
 */
export const assistantRouter = Router();
assistantRouter.use(authenticate, requirePatient);

const pid = (req: Request) => req.user!.patientProfileId!;
const burst = rateLimit({ windowMs: 10_000, max: 6, key: (req) => `assistant:${req.user!.id}`, code: 'RATE_LIMITED', message: 'Slow down a little and try again in a few seconds.' });

// The emergency check runs no model, so it gets a looser limit than the chat.
const safetyBurst = rateLimit({ windowMs: 10_000, max: 30, key: (req) => `safety:${req.user!.id}`, code: 'RATE_LIMITED', message: 'Slow down a little and try again in a few seconds.' });

async function consented(patientId: string): Promise<boolean> {
  const r = await query('SELECT ai_assistant_consent_at FROM patient_profiles WHERE id = $1', [patientId]);
  return !!r.rows[0]?.ai_assistant_consent_at;
}

// POST /api/assistant/safety  { text, lang }  the fixed emergency check for anything the patient types (symptom forms included). No AI, nothing stored.
assistantRouter.post('/safety', safetyBurst, async (req: Request, res: Response): Promise<void> => {
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 4000) : '';
  const lang = req.body?.lang === 'en' ? 'en' : 'ar';
  const urgent = isUrgentText(text);
  if (urgent) await recordInteraction(pid(req), 'assistant', 'urgent');
  res.json({ success: true, data: { urgent, message: urgent ? URGENT_MESSAGE[lang] : null } });
});

// GET /api/assistant/status
assistantRouter.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: { ...chatStatus(), consent: await consented(pid(req)), maxPerHour: ENV.ASSISTANT_MAX_PER_HOUR } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/assistant/consent  { allowed: boolean }
assistantRouter.post('/consent', async (req: Request, res: Response): Promise<void> => {
  if (typeof req.body?.allowed !== 'boolean') return void res.status(400).json(apiError('VALIDATION_ERROR', 'allowed must be true or false.'));
  try {
    await query('UPDATE patient_profiles SET ai_assistant_consent_at = $2 WHERE id = $1', [pid(req), req.body.allowed ? new Date().toISOString() : null]);
    logAuditEvent({ actorId: req.user!.id, actorEmail: req.user!.email, actorRole: 'patient', action: req.body.allowed ? 'AI_ASSISTANT_CONSENT_GRANT' : 'AI_ASSISTANT_CONSENT_WITHDRAW', resourceType: 'patient_profile', resourceId: pid(req), ipAddress: req.ip });
    res.json({ success: true, data: { consent: req.body.allowed } });
  } catch (err) {
    res.status(500).json(serverError(err));
  }
});

async function gate(req: Request, res: Response, kind: 'assistant' | 'prep_overview'): Promise<boolean> {
  const status = chatStatus();
  if (!status.configured) {
    await recordInteraction(pid(req), kind, 'not_configured');
    res.status(503).json(apiError('AI_NOT_CONFIGURED', 'The assistant is not connected on this server.'));
    return false;
  }
  if (!(await consented(pid(req)))) {
    res.status(403).json(apiError('AI_CONSENT_REQUIRED', 'Turn the assistant on first. It needs your permission to read a summary of your record.'));
    return false;
  }
  if ((await hourlyCount(pid(req))) >= ENV.ASSISTANT_MAX_PER_HOUR) {
    res.setHeader('Retry-After', '600');
    res.status(429).json(apiError('RATE_LIMITED', 'You have reached the hourly limit for the assistant. Please try again later.'));
    return false;
  }
  return true;
}

const fail = (res: Response, err: unknown) => {
  if (err instanceof AssistantError) return void res.status(err.status).json(apiError(err.code, err.message));
  res.status(500).json(serverError(err));
};

// POST /api/assistant/chat  { messages: [{role, content}], lang }   (the conversation is held by the browser in memory; nothing is stored here)
assistantRouter.post('/chat', burst, async (req: Request, res: Response): Promise<void> => {
  const messages = validateMessages(req.body?.messages);
  if (!messages) return void res.status(400).json(apiError('VALIDATION_ERROR', 'Send up to 14 messages of at most 2000 characters, ending with your message.'));
  const lang = req.body?.lang === 'en' ? 'en' : 'ar';
  try {
    // The fixed emergency and refusal messages need no model, so they are never blocked by consent or by AI being off.
    const pre = preCheck(messages, lang);
    if (!pre && !(await gate(req, res, 'assistant'))) return;
    const reply = await runChat({ patientId: pid(req), messages, lang });
    res.json({ success: true, data: reply });
  } catch (err) {
    fail(res, err);
  }
});

// POST /api/assistant/overview  { prep_id }   optional wording for the summary overview; returns text, saves nothing
assistantRouter.post('/overview', burst, async (req: Request, res: Response): Promise<void> => {
  if (!isUuid(req.body?.prep_id)) return void res.status(400).json(apiError('VALIDATION_ERROR', 'prep_id is required.'));
  try {
    const r = await query('SELECT content FROM visit_preps WHERE id = $1 AND patient_id = $2', [req.body.prep_id, pid(req)]);
    if (r.rowCount === 0) return void res.status(404).json(apiError('PREP_NOT_FOUND', 'Visit summary not found.'));
    const parsed = parsePrepContent(r.rows[0].content);
    if (!parsed.ok || !(await verifyRefs(pid(req), parsed.value))) return void res.status(409).json(apiError('PREP_OUTDATED', 'Save the summary again first.'));
    if (!(await gate(req, res, 'prep_overview'))) return;
    res.json({ success: true, data: await runOverview(pid(req), parsed.value) });
  } catch (err) {
    fail(res, err);
  }
});
