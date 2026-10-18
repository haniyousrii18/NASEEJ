import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { blockPlatformAdminFromClinical, requireRole } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { isPatientLinkedToOrg } from '../services/accessService.js';
import { buildTimeline, parseTimelineQuery } from '../services/recordService.js';
import { apiError, escapeLike, isIsoDate, isUuid, serverError } from '../services/validation.js';

export const patientRouter = Router();

// Staff who work with patients day to day. Center managers, coordinators and patients themselves are refused:
// a manager's operational reports are aggregates, and a patient reads their own record through /api/portal.
patientRouter.use(authenticate, requireTenant, blockPlatformAdminFromClinical, requireRole(['doctor', 'reception']));

// Identity and contact data a front desk needs. No blood type, no allergies, nothing clinical.
const ADMIN_FIELDS = `p.id, p.national_id, p.full_name_ar, p.full_name_en, p.date_of_birth, p.gender, p.phone, p.email,
       p.emergency_contact_name, p.emergency_contact_phone, p.created_at, p.updated_at`;

const isDoctor = (req: Request) => req.currentMembership?.role === 'doctor';

// GET /api/patients (scoped to the active medical center)
patientRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const search = (req.query.search as string) || '';

  try {
    let text = `
      SELECT ${isDoctor(req) ? 'p.*' : ADMIN_FIELDS}, l.mrn, l.first_visit_date, l.status as link_status
      FROM patient_profiles p
      JOIN patient_center_links l ON p.id = l.patient_id
      WHERE l.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (search.trim()) {
      // % and _ typed by the user are searched for literally, not used as wildcards.
      params.push(`%${escapeLike(search.trim().toLowerCase())}%`);
      text += ` AND (LOWER(p.full_name_ar) LIKE $2 OR LOWER(p.full_name_en) LIKE $2 OR p.national_id LIKE $2 OR LOWER(l.mrn) LIKE $2)`;
    }

    text += ' ORDER BY p.created_at DESC LIMIT 200';

    const result = await query(text, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
const optionalText = (v: unknown, max: number): string | null | undefined =>
  v === undefined || v === null || v === '' ? null : typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined;

// POST /api/patients (register a patient and link them to this center with a center-scoped MRN)
// - A national ID this center already has is refused with the existing patient, never registered twice.
// - A national ID that exists at another center is linked here only when the date of birth matches, so a mistyped
//   ID cannot attach a stranger to this center. The refusal says nothing about the other profile.
patientRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const body = req.body || {};
  const nationalId = typeof body.national_id === 'string' ? body.national_id.trim() : '';
  const nameAr = text(body.full_name_ar, 2, 255);
  const nameEn = text(body.full_name_en, 2, 255);
  const phone = text(body.phone, 5, 50);
  const email = optionalText(body.email, 255);
  const emergencyName = optionalText(body.emergency_contact_name, 255);
  const emergencyPhone = optionalText(body.emergency_contact_phone, 50);
  const dob = body.date_of_birth;

  if (!/^[0-9A-Za-z-]{5,50}$/.test(nationalId) || !nameAr || !nameEn || !phone || !['male', 'female'].includes(body.gender)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'A national ID (5-50 letters, digits or dashes), both names, a phone number and a gender (male or female) are required.'));
    return;
  }
  if (!isIsoDate(dob) || dob > new Date().toISOString().slice(0, 10) || dob < '1900-01-01') {
    res.status(400).json(apiError('VALIDATION_ERROR', 'date_of_birth must be a past date in the YYYY-MM-DD format.'));
    return;
  }
  if (email === undefined || (email !== null && !EMAIL_RE.test(email)) || emergencyName === undefined || emergencyPhone === undefined) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'The email address or the emergency contact details are not valid.'));
    return;
  }
  // Blood type is clinical: only a doctor records it.
  const bloodType = isDoctor(req) ? body.blood_type ?? null : null;

  try {
    const outcome = await withTransaction(async (client) => {
      // One registration per national ID at a time, and one MRN number at a time per center.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`patient:${nationalId}`]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mrn:${orgId}`]);

      const found = await client.query('SELECT id, date_of_birth FROM patient_profiles WHERE national_id = $1', [nationalId]);
      let patientId: string;
      let isNewProfile = false;

      if (found.rowCount === 0) {
        const inserted = await client.query(
          `INSERT INTO patient_profiles (national_id, full_name_ar, full_name_en, date_of_birth, gender, blood_type, phone, email, emergency_contact_name, emergency_contact_phone)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [nationalId, nameAr, nameEn, dob, body.gender, bloodType, phone, email, emergencyName, emergencyPhone]
        );
        patientId = inserted.rows[0].id;
        isNewProfile = true;
      } else {
        patientId = found.rows[0].id;
        if (String(found.rows[0].date_of_birth).slice(0, 10) !== dob) return { mismatch: true as const };
        const linked = await client.query('SELECT mrn FROM patient_center_links WHERE organization_id = $1 AND patient_id = $2', [orgId, patientId]);
        if (linked.rowCount && linked.rowCount > 0) return { duplicate: { patientId, mrn: linked.rows[0].mrn as string } };
      }

      const next = await client.query(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(mrn, '\\D', '', 'g'), '')::int), 1000) + 1 AS next
         FROM patient_center_links WHERE organization_id = $1`,
        [orgId]
      );
      const mrn = `MRN-${next.rows[0].next}`;
      await client.query(
        `INSERT INTO patient_center_links (organization_id, patient_id, mrn, status, first_visit_date)
         VALUES ($1, $2, $3, 'active', CURRENT_DATE)`,
        [orgId, patientId, mrn]
      );
      return { created: { patientId, mrn, isNewProfile } };
    });

    if ('mismatch' in outcome) {
      res.status(409).json(apiError('IDENTITY_MISMATCH', 'This national ID is already registered with different details. Check the national ID and the date of birth.'));
      return;
    }
    if ('duplicate' in outcome) {
      res.status(409).json(apiError('PATIENT_ALREADY_REGISTERED', 'This patient is already registered at this medical center.', outcome.duplicate));
      return;
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: outcome.created.isNewProfile ? 'PATIENT_PROFILE_CREATE' : 'PATIENT_CENTER_LINK_CREATE',
      resourceType: 'patient_profile',
      resourceId: outcome.created.patientId,
      ipAddress: req.ip,
      details: { mrn: outcome.created.mrn, nationalId },
    });

    res.status(201).json({ success: true, data: outcome.created });
  } catch (err: any) {
    console.error('Patient create error:', err);
    res.status(500).json(serverError(err));
  }
});

// PATCH /api/patients/:id  (reception): contact details only. Names, date of birth, gender and national ID belong
// to the profile every linked center shares, so they are not edited from one center's front desk.
const CONTACT_FIELDS = ['phone', 'email', 'emergency_contact_name', 'emergency_contact_phone'] as const;
const LOCKED_FIELDS = ['national_id', 'full_name_ar', 'full_name_en', 'date_of_birth', 'gender', 'blood_type'];
patientRouter.patch('/:id', requireRole(['reception']), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const patientId = req.params.id;
  const body = req.body || {};

  if (!isUuid(patientId) || !(await isPatientLinkedToOrg(patientId, orgId))) {
    res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
    return;
  }
  if (LOCKED_FIELDS.some((k) => k in body)) {
    res.status(400).json(apiError('FIELD_NOT_EDITABLE', 'Identity details cannot be changed here. Only the phone, email and emergency contact can.'));
    return;
  }
  const changes: Record<string, string | null> = {};
  for (const key of CONTACT_FIELDS) {
    if (!(key in body)) continue;
    const value = key === 'phone' ? text(body.phone, 5, 50) : optionalText(body[key], key === 'emergency_contact_phone' ? 50 : 255);
    if (value === undefined || (key === 'phone' && value === null) || (key === 'email' && value !== null && !EMAIL_RE.test(value))) {
      res.status(400).json(apiError('VALIDATION_ERROR', `${key} is not valid.`));
      return;
    }
    changes[key] = value;
  }
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'Send at least one of: phone, email, emergency_contact_name, emergency_contact_phone.'));
    return;
  }

  try {
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    await query(`UPDATE patient_profiles SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1}`, [...keys.map((k) => changes[k]), patientId]);

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'reception',
      action: 'PATIENT_CONTACT_UPDATE',
      resourceType: 'patient_profile',
      resourceId: patientId,
      ipAddress: req.ip,
      details: { fields: keys },
    });

    const updated = await query(
      `SELECT ${ADMIN_FIELDS}, l.mrn, l.first_visit_date, l.status as link_status
       FROM patient_profiles p JOIN patient_center_links l ON p.id = l.patient_id
       WHERE p.id = $1 AND l.organization_id = $2`,
      [patientId, orgId]
    );
    res.json({ success: true, data: updated.rows[0] });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/patients/:id
patientRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.tenantId!;
  const patientId = req.params.id;

  if (!isUuid(patientId)) {
    res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
    return;
  }

  try {
    // Strict isolation: must have an active link in THIS center
    const patientRes = await query(
      `SELECT ${isDoctor(req) ? 'p.*' : ADMIN_FIELDS}, l.mrn, l.first_visit_date, l.status as link_status
       FROM patient_profiles p
       JOIN patient_center_links l ON p.id = l.patient_id
       WHERE p.id = $1 AND l.organization_id = $2`,
      [patientId, orgId]
    );

    if (patientRes.rowCount === 0) {
      res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
      return;
    }

    if (!isDoctor(req)) {
      res.json({ success: true, data: patientRes.rows[0] });
      return;
    }

    const allergiesRes = await query('SELECT * FROM patient_allergies WHERE patient_id = $1 ORDER BY created_at DESC', [patientId]);
    res.json({ success: true, data: { ...patientRes.rows[0], allergies: allergiesRes.rows } });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// Allergies are clinical content: doctors only, and only for patients linked to the doctor's center.
const doctorOnly = requireRole(['doctor']);

// GET /api/patients/:id/allergies
patientRouter.get('/:id/allergies', doctorOnly, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isUuid(id) || !(await isPatientLinkedToOrg(id, req.tenantId!))) {
    res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
    return;
  }
  try {
    const allergiesRes = await query('SELECT * FROM patient_allergies WHERE patient_id = $1 ORDER BY created_at DESC', [id]);
    res.json({ success: true, data: allergiesRes.rows });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/patients/:id/allergies
patientRouter.post('/:id/allergies', doctorOnly, async (req: Request, res: Response): Promise<void> => {
  const patientId = req.params.id;
  const { allergen_ar, allergen_en, reaction_ar, reaction_en, severity, diagnosed_at } = req.body || {};

  if (!allergen_ar || !allergen_en || !severity) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'allergen_ar, allergen_en, and severity are required.'));
    return;
  }
  if (!['mild', 'moderate', 'severe', 'life_threatening'].includes(severity)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'severity must be mild, moderate, severe or life_threatening.'));
    return;
  }
  if (!isUuid(patientId) || !(await isPatientLinkedToOrg(patientId, req.tenantId!))) {
    res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
    return;
  }

  try {
    const insertRes = await query(
      `INSERT INTO patient_allergies (patient_id, allergen_ar, allergen_en, reaction_ar, reaction_en, severity, diagnosed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [patientId, allergen_ar, allergen_en, reaction_ar, reaction_en, severity, diagnosed_at || new Date()]
    );

    logAuditEvent({
      organizationId: req.tenantId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.currentMembership?.role,
      action: 'PATIENT_ALLERGY_DOCUMENT',
      resourceType: 'patient_allergy',
      resourceId: insertRes.rows[0].id,
      ipAddress: req.ip,
      details: { allergen: allergen_en, severity },
    });

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/patients/:id/timeline (doctor): the patient's record as this clinician may see it.
// Their own center's records are shown in every state (drafts flagged). Other centers' records appear only
// under an effective patient consent, only in approved form, and each such read is written to the audit log.
patientRouter.get('/:id/timeline', doctorOnly, async (req: Request, res: Response): Promise<void> => {
  const patientId = req.params.id;
  const orgId = req.tenantId!;

  if (!isUuid(patientId) || !(await isPatientLinkedToOrg(patientId, orgId))) {
    res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
    return;
  }
  const parsed = parseTimelineQuery(req.query);
  if ('error' in parsed) {
    res.status(400).json(apiError('VALIDATION_ERROR', parsed.error));
    return;
  }

  try {
    const result = await buildTimeline({ kind: 'clinician', patientId, orgId }, parsed.options);

    if (result.consentIds.length > 0) {
      logAuditEvent({
        organizationId: orgId,
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        actorRole: 'doctor',
        action: 'CROSS_CENTER_RECORD_ACCESS',
        resourceType: 'patient_record',
        resourceId: patientId,
        ipAddress: req.ip,
        details: {
          patientId,
          fromOrganizationIds: result.externalOrganizationIds,
          consentIds: result.consentIds,
          types: [...new Set(result.items.filter((i) => i.isExternal).map((i) => i.type))],
          count: result.items.filter((i) => i.isExternal).length,
        },
      });
    }

    res.json({
      success: true,
      data: result.items,
      meta: { limit: parsed.options.limit, hasMore: result.hasMore, nextBefore: result.nextBefore, externalCenters: result.externalOrganizationIds.length },
    });
  } catch (err: any) {
    console.error('Patient timeline error:', err);
    res.status(500).json(serverError(err));
  }
});
