import { Router, Request, Response } from 'express';
import fs from 'fs';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { blockPlatformAdminFromClinical, tenantUnlessPatient } from '../middleware/rbac.js';
import { logAuditEvent } from '../services/auditService.js';
import { effectiveConsentsForReader, isPatientLinkedToOrg, scopeCovers } from '../services/accessService.js';
import { buildTimeline, parseTimelineQuery } from '../services/recordService.js';
import { aiStatus, startProcessing } from '../services/documentProcessing.js';
import { fileExists, resolveStoredPath, saveFile, sniffFileType } from '../services/storageService.js';
import { apiError, isIsoDate, isUuid, serverError } from '../services/validation.js';
import { onDocumentReviewed, onDocumentUploadedByPatient } from '../services/notificationService.js';

export const documentRouter = Router();

// Patients act on their own documents; clinicians act inside their center. Everyone else is refused.
documentRouter.use(authenticate, tenantUnlessPatient, blockPlatformAdminFromClinical);

const MAX_BYTES = 4 * 1024 * 1024;

type Actor = { kind: 'patient'; patientId: string } | { kind: 'doctor'; orgId: string };

function actorOf(req: Request): Actor | null {
  if (req.user?.patientProfileId) return { kind: 'patient', patientId: req.user.patientProfileId };
  if (req.currentMembership?.role === 'doctor' && req.tenantId) return { kind: 'doctor', orgId: req.tenantId };
  return null;
}

function refuse(res: Response) {
  res.status(403).json(apiError('FORBIDDEN_ROLE', 'Documents are available to the treating clinicians and the patient only.'));
}

/** A document row the actor may see, or null. Anything else is reported as not found, never as forbidden. */
async function accessibleDocument(actor: Actor, id: string): Promise<any | null> {
  if (!isUuid(id)) return null;
  const res = await query(
    `SELECT d.*, to_char(d.document_date, 'YYYY-MM-DD') AS document_date_text, o.name_ar AS org_ar, o.name_en AS org_en, u.full_name_ar AS up_ar, u.full_name_en AS up_en
     FROM documents d LEFT JOIN organizations o ON o.id = d.organization_id JOIN users u ON u.id = d.uploaded_by
     WHERE d.id = $1 AND d.deleted_at IS NULL`,
    [id]
  );
  if (res.rowCount === 0) return null;
  const doc = res.rows[0];

  if (actor.kind === 'patient') return doc.patient_id === actor.patientId && doc.visible_to_patient ? doc : null;

  if (doc.organization_id === actor.orgId) return (await isPatientLinkedToOrg(doc.patient_id, actor.orgId)) ? doc : null;

  // Another center's document: released to the patient AND covered by an effective consent for this reader.
  if (!doc.visible_to_patient || !(await isPatientLinkedToOrg(doc.patient_id, actor.orgId))) return null;
  const consents = await effectiveConsentsForReader(doc.patient_id, actor.orgId);
  const consent = consents.find((c) => c.from_organization_id === doc.organization_id && scopeCovers(c.scope, 'documents'));
  if (!consent) return null;
  doc.__consentId = consent.id;
  return doc;
}

const meta = (d: any, actor: Actor) => ({
  id: d.id,
  title: d.title || d.file_name,
  fileName: d.file_name,
  mimeType: d.mime_type,
  fileSize: Number(d.file_size),
  sourceType: d.source_type,
  reviewStatus: d.review_status,
  visibleToPatient: d.visible_to_patient,
  documentDate: d.document_date_text ?? null,
  createdAt: d.created_at,
  visitId: d.visit_id,
  organization: { id: d.organization_id ?? '', name_ar: d.org_ar ?? '', name_en: d.org_en ?? '' },
  uploadedBy: { name_ar: d.up_ar, name_en: d.up_en },
  isExternal: actor.kind === 'doctor' && d.organization_id !== actor.orgId,
});

// GET /api/documents (patient: own released documents; doctor: ?patientId= at this center plus consented external ones)
documentRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor) return refuse(res);

  const parsed = parseTimelineQuery({ ...req.query, type: 'document' });
  if ('error' in parsed) {
    res.status(400).json(apiError('VALIDATION_ERROR', parsed.error));
    return;
  }

  try {
    let result;
    if (actor.kind === 'patient') {
      result = await buildTimeline({ kind: 'patient', patientId: actor.patientId }, parsed.options);
    } else {
      const patientId = req.query.patientId as string;
      if (!isUuid(patientId) || !(await isPatientLinkedToOrg(patientId, actor.orgId))) {
        res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
        return;
      }
      result = await buildTimeline({ kind: 'clinician', patientId, orgId: actor.orgId }, parsed.options);
    }
    res.json({ success: true, data: result.items, meta: { limit: parsed.options.limit, hasMore: result.hasMore, nextBefore: result.nextBefore } });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/documents/:id
documentRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor) return refuse(res);
  try {
    const doc = await accessibleDocument(actor, String(req.params.id));
    if (!doc) {
      res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
      return;
    }
    res.json({ success: true, data: meta(doc, actor) });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// GET /api/documents/:id/download (the original file, never cached, never sniffed by the browser)
documentRouter.get('/:id/download', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor) return refuse(res);
  try {
    const doc = await accessibleDocument(actor, String(req.params.id));
    if (!doc) {
      res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
      return;
    }
    const full = resolveStoredPath(doc.storage_path);
    if (!full || !(await fileExists(doc.storage_path))) {
      res.status(404).json(apiError('FILE_UNAVAILABLE', 'The stored file for this document is not available.'));
      return;
    }

    logAuditEvent({
      organizationId: actor.kind === 'doctor' ? actor.orgId : doc.organization_id ?? null,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: actor.kind === 'doctor' ? 'doctor' : 'patient',
      action: 'DOCUMENT_DOWNLOAD',
      resourceType: 'document',
      resourceId: doc.id,
      ipAddress: req.ip,
      details: { documentId: doc.id, patientId: doc.patient_id, ...(doc.__consentId ? { consentId: doc.__consentId } : {}) },
    });

    const safeName = String(doc.file_name).replace(/[^\w.\- ]+/g, '_').slice(0, 150) || 'document';
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(full).on('error', () => res.destroy()).pipe(res);
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});

// POST /api/documents (JSON upload: { file_name, content_base64, title?, document_date?, patient_id?, organization_id?, visit_id? })
documentRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor) return refuse(res);

  const { file_name, content_base64, title, document_date, patient_id, organization_id, visit_id } = req.body || {};
  if (typeof file_name !== 'string' || !file_name.trim() || typeof content_base64 !== 'string' || !content_base64) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'file_name and content_base64 are required.'));
    return;
  }
  if (content_base64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) {
    res.status(413).json(apiError('FILE_TOO_LARGE', 'Files are limited to 4 MB.'));
    return;
  }
  if (title !== undefined && title !== null && (typeof title !== 'string' || title.length > 255)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'title must be text of at most 255 characters.'));
    return;
  }
  if (document_date !== undefined && document_date !== null && !isIsoDate(document_date)) {
    res.status(400).json(apiError('VALIDATION_ERROR', 'document_date must use the YYYY-MM-DD format.'));
    return;
  }

  const buffer = Buffer.from(content_base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    res.status(buffer.length === 0 ? 400 : 413).json(apiError(buffer.length === 0 ? 'VALIDATION_ERROR' : 'FILE_TOO_LARGE', buffer.length === 0 ? 'The file is empty.' : 'Files are limited to 4 MB.'));
    return;
  }
  // The type comes from the file's own bytes, never from the declared name or MIME type.
  const type = sniffFileType(buffer);
  if (!type) {
    res.status(415).json(apiError('UNSUPPORTED_FILE_TYPE', 'Only PDF, PNG and JPEG files are accepted.'));
    return;
  }

  try {
    let patientId: string;
    let orgId: string;
    let sourceType: 'patient_uploaded' | 'clinician_uploaded' | 'imported';
    let visible: boolean;
    let aiAllowed = false;

    if (actor.kind === 'patient') {
      patientId = actor.patientId;
      if (!isUuid(organization_id) || !(await isPatientLinkedToOrg(patientId, organization_id))) {
        res.status(400).json(apiError('INVALID_CENTER', 'Choose one of the medical centers you are registered at.'));
        return;
      }
      const active = await query(`SELECT 1 FROM organizations WHERE id = $1 AND status = 'active'`, [organization_id]);
      if (active.rowCount === 0) {
        res.status(400).json(apiError('INVALID_CENTER', 'This medical center is not accepting uploads.'));
        return;
      }
      orgId = organization_id;
      aiAllowed = req.body.ai_processing_allowed === true; // an explicit, per-file opt-in; the default is no
      sourceType = 'patient_uploaded';
      visible = true; // the patient's own upload is always visible to them; clinicians see it labelled as patient-provided
    } else {
      if (!isUuid(patient_id) || !(await isPatientLinkedToOrg(patient_id, actor.orgId))) {
        res.status(404).json(apiError('PATIENT_NOT_FOUND', 'Patient not found in this medical center.'));
        return;
      }
      patientId = patient_id;
      orgId = actor.orgId;
      sourceType = req.body.source_type === 'imported' ? 'imported' : 'clinician_uploaded';
      visible = false; // released to the patient only after clinician review
      if (visit_id) {
        const v = await query('SELECT 1 FROM visits WHERE id = $1 AND organization_id = $2 AND patient_id = $3', [isUuid(visit_id) ? visit_id : '00000000-0000-0000-0000-000000000000', orgId, patientId]);
        if (v.rowCount === 0) {
          res.status(404).json(apiError('VISIT_NOT_FOUND', 'Visit not found for this patient in this medical center.'));
          return;
        }
      }
    }

    const cleanName = file_name.trim().split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, '').slice(0, 200) || `document${type.extension}`;
    const storagePath = await saveFile(buffer, type.extension);

    const insert = await query(
      `INSERT INTO documents (organization_id, patient_id, file_name, storage_path, mime_type, file_size, uploaded_by,
                              title, document_date, visit_id, source_type, review_status, visible_to_patient, ai_processing_allowed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unreviewed', $12, $13)
       RETURNING id`,
      [orgId, patientId, cleanName, storagePath, type.mime, buffer.length, req.user!.id, title || null, document_date || null,
       actor.kind === 'doctor' && visit_id ? visit_id : null, sourceType, visible, aiAllowed]
    );

    // Only a file the patient allowed is sent to the configured provider, and only when one is configured.
    // Otherwise nothing runs and the file simply waits for clinician review.
    let processingStarted = false;
    if (aiAllowed && aiStatus().configured) {
      processingStarted = (await startProcessing(insert.rows[0].id, { id: req.user!.id, email: req.user!.email, role: 'patient' })).started;
    }

    logAuditEvent({
      organizationId: orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: actor.kind === 'doctor' ? 'doctor' : 'patient',
      action: 'DOCUMENT_UPLOAD',
      resourceType: 'document',
      resourceId: insert.rows[0].id,
      ipAddress: req.ip,
      details: { documentId: insert.rows[0].id, patientId, status: sourceType },
    });

    if (actor.kind === 'patient') await onDocumentUploadedByPatient({ id: insert.rows[0].id }, orgId, req.user!.id);
    const created = await accessibleDocument(actor, insert.rows[0].id);
    res.status(201).json({ success: true, data: { ...(created ? meta(created, actor) : { id: insert.rows[0].id }), aiProcessingAllowed: aiAllowed, aiProcessingStarted: processingStarted } });
  } catch (err: any) {
    console.error('Document upload error:', err);
    res.status(500).json(serverError(err));
  }
});

// POST /api/documents/:id/review (doctor, own center): mark as reviewed and optionally release to the patient
documentRouter.post('/:id/review', async (req: Request, res: Response): Promise<void> => {
  const actor = actorOf(req);
  if (!actor || actor.kind !== 'doctor') {
    res.status(403).json(apiError('FORBIDDEN_ROLE', 'Only clinicians can review documents.'));
    return;
  }
  const release = req.body?.release === true;

  try {
    const update = await query(
      `UPDATE documents SET review_status = 'reviewed', reviewed_by = $1, reviewed_at = NOW(),
              visible_to_patient = CASE WHEN $2 THEN TRUE ELSE visible_to_patient END, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4
       RETURNING id`,
      [req.user!.id, release, isUuid(String(req.params.id)) ? String(req.params.id) : '00000000-0000-0000-0000-000000000000', actor.orgId]
    );
    if (update.rowCount === 0) {
      res.status(404).json(apiError('DOCUMENT_NOT_FOUND', 'Document not found.'));
      return;
    }

    logAuditEvent({
      organizationId: actor.orgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: 'doctor',
      action: release ? 'DOCUMENT_REVIEW_RELEASE' : 'DOCUMENT_REVIEW',
      resourceType: 'document',
      resourceId: String(req.params.id),
      ipAddress: req.ip,
      details: { documentId: String(req.params.id) },
    });

    await onDocumentReviewed(String(req.params.id), actor.orgId, req.user!.id);
    const doc = await accessibleDocument(actor, String(req.params.id));
    res.json({ success: true, data: doc ? meta(doc, actor) : { id: String(req.params.id) } });
  } catch (err: any) {
    res.status(500).json(serverError(err));
  }
});
