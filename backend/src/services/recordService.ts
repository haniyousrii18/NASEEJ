import { query } from '../config/db.js';
import { ConsentKind, EffectiveConsent, effectiveConsentsForReader, scopeCovers } from './accessService.js';

/**
 * The longitudinal patient record: one chronological list built from the tables that already exist.
 * Nothing is merged or rewritten. Every item keeps its own source row, center, author, provenance and
 * review status, so a value can always be traced back to where it was recorded.
 *
 * Visibility
 *  - Patient:   their own records at every center, in approved/released form only.
 *  - Clinician: everything at their own center (drafts included, flagged as such), plus other centers'
 *               approved records ONLY under an effective consent (active, unexpired, scope-covering).
 */
export type TimelineType = 'visit' | 'prescription' | 'lab_result' | 'document' | 'appointment' | 'symptom_report' | 'patient_entry';
export const TIMELINE_TYPES: TimelineType[] = ['visit', 'prescription', 'lab_result', 'document', 'appointment', 'symptom_report', 'patient_entry'];

export type Viewer = { kind: 'patient'; patientId: string } | { kind: 'clinician'; patientId: string; orgId: string };

export interface TimelineOptions {
  types?: TimelineType[];
  organizationId?: string;
  from?: string;
  to?: string;
  before?: string;
  limit: number;
}

export interface TimelineItem {
  id: string;
  type: TimelineType;
  occurredAt: string;
  recordedAt: string;
  organization: { id: string; name_ar: string; name_en: string };
  author: { name_ar: string; name_en: string } | null;
  provenance: 'clinician_authored' | 'patient_reported' | 'patient_uploaded' | 'clinician_uploaded' | 'imported' | 'system';
  reviewStatus: string;
  isExternal: boolean;
  consentId: string | null;
  source: { resource: string; id: string };
  data: Record<string, unknown>;
}

export interface TimelineResult {
  items: TimelineItem[];
  hasMore: boolean;
  nextBefore: string | null;
  externalOrganizationIds: string[];
  consentIds: string[];
}

interface Scope {
  patientId: string;
  ownOrgId: string | null;
  externalOrgIds: string[];
  consentFor: (orgId: string, kind: ConsentKind | 'all') => EffectiveConsent | undefined;
}

/**
 * Builds the WHERE fragment that decides which rows a viewer may see for one record type.
 * `own` is the extra condition for the viewer's own center (null = no restriction beyond the center);
 * `released` is the condition that makes a row eligible to leave its center or reach the patient.
 */
function visibility(viewer: Viewer, scope: Scope, alias: string, params: unknown[], released: string, own: string | null) {
  params.push(scope.patientId);
  const patientParam = `$${params.length}`;
  let clause = `${alias}.patient_id = ${patientParam} AND `;

  if (viewer.kind === 'patient') {
    return `${clause}${released}`;
  }

  params.push(scope.ownOrgId);
  const ownParam = `$${params.length}`;
  params.push(scope.externalOrgIds);
  const extParam = `$${params.length}`;
  const ownClause = own ? `(${alias}.organization_id = ${ownParam} AND ${own})` : `${alias}.organization_id = ${ownParam}`;
  return `${clause}(${ownClause} OR (${alias}.organization_id = ANY(${extParam}) AND ${released}))`;
}

function applyFilters(options: TimelineOptions, params: unknown[], orgColumn: string, timeExpr: string): string {
  let sql = '';
  if (options.organizationId) {
    params.push(options.organizationId);
    sql += ` AND ${orgColumn} = $${params.length}`;
  }
  if (options.from) {
    params.push(options.from);
    sql += ` AND ${timeExpr} >= $${params.length}`;
  }
  if (options.to) {
    params.push(options.to);
    sql += ` AND ${timeExpr} <= $${params.length}`;
  }
  if (options.before) {
    params.push(options.before);
    sql += ` AND ${timeExpr} < $${params.length}`;
  }
  return sql;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

export async function buildTimeline(viewer: Viewer, options: TimelineOptions): Promise<TimelineResult> {
  const consents = viewer.kind === 'clinician' ? await effectiveConsentsForReader(viewer.patientId, viewer.orgId) : [];
  const scope: Scope = {
    patientId: viewer.patientId,
    ownOrgId: viewer.kind === 'clinician' ? viewer.orgId : null,
    externalOrgIds: [],
    consentFor: (orgId, kind) => consents.find((c) => c.from_organization_id === orgId && (kind === 'all' ? c.scope === 'all' : scopeCovers(c.scope, kind))),
  };

  const wants = (t: TimelineType) => !options.types || options.types.includes(t);
  const limit = options.limit + 1;

  // External centers differ per record type because a consent can be limited to one scope.
  const externalFor = (kind: ConsentKind | 'all'): string[] =>
    viewer.kind === 'clinician' ? consents.filter((c) => (kind === 'all' ? c.scope === 'all' : scopeCovers(c.scope, kind))).map((c) => c.from_organization_id) : [];

  const items: TimelineItem[] = [];
  const mark = (orgId: string, kind: ConsentKind | 'all') => {
    const external = viewer.kind === 'clinician' && orgId !== viewer.orgId;
    return { isExternal: external, consentId: external ? scope.consentFor(orgId, kind)?.id ?? null : null };
  };
  const org = (r: any) => ({ id: r.organization_id ?? '', name_ar: r.org_ar ?? '', name_en: r.org_en ?? '' });
  const author = (r: any) => (r.a_ar || r.a_en ? { name_ar: r.a_ar, name_en: r.a_en } : null);

  // ---- visits
  if (wants('visit')) {
    scope.externalOrgIds = externalFor('visits');
    const params: unknown[] = [];
    const where = visibility(viewer, scope, 'v', params, `v.status = 'approved'`, null);
    const filters = applyFilters(options, params, 'v.organization_id', 'v.visit_date');
    params.push(limit);
    const rows = await query(
      `SELECT v.id, v.organization_id, v.visit_date, v.created_at, v.chief_complaint, v.diagnosis, v.treatment_plan, v.vital_signs,
              v.examination_notes, v.status, v.approved_at, o.name_ar org_ar, o.name_en org_en, u.full_name_ar a_ar, u.full_name_en a_en
       FROM visits v JOIN organizations o ON o.id = v.organization_id JOIN users u ON u.id = v.clinician_id
       WHERE ${where}${filters} ORDER BY v.visit_date DESC LIMIT $${params.length}`,
      params
    );
    for (const r of rows.rows) {
      items.push({
        id: `visit:${r.id}`,
        type: 'visit',
        occurredAt: iso(r.visit_date),
        recordedAt: iso(r.created_at),
        organization: org(r),
        author: author(r),
        provenance: 'clinician_authored',
        reviewStatus: r.status,
        ...mark(r.organization_id, 'visits'),
        source: { resource: 'visits', id: r.id },
        data: {
          chiefComplaint: r.chief_complaint,
          diagnosis: r.diagnosis,
          treatmentPlan: r.treatment_plan,
          vitalSigns: r.vital_signs,
          ...(viewer.kind === 'clinician' ? { examinationNotes: r.examination_notes } : {}),
          approvedAt: r.approved_at ? iso(r.approved_at) : null,
        },
      });
    }
  }

  // ---- prescriptions
  if (wants('prescription')) {
    scope.externalOrgIds = externalFor('prescriptions');
    const params: unknown[] = [];
    const where = visibility(viewer, scope, 'pr', params, `pr.status = 'approved'`, null);
    const filters = applyFilters(options, params, 'pr.organization_id', 'COALESCE(pr.approved_at, pr.created_at)');
    params.push(limit);
    const rows = await query(
      `SELECT pr.id, pr.organization_id, pr.created_at, pr.approved_at, pr.status, pr.notes, o.name_ar org_ar, o.name_en org_en,
              u.full_name_ar a_ar, u.full_name_en a_en,
              COALESCE(json_agg(json_build_object('medication_name', pi.medication_name, 'dosage', pi.dosage, 'frequency', pi.frequency,
                'duration', pi.duration, 'instructions', pi.instructions) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') AS items
       FROM prescriptions pr JOIN organizations o ON o.id = pr.organization_id JOIN users u ON u.id = pr.clinician_id
       LEFT JOIN prescription_items pi ON pi.prescription_id = pr.id
       WHERE ${where}${filters}
       GROUP BY pr.id, o.name_ar, o.name_en, u.full_name_ar, u.full_name_en
       ORDER BY COALESCE(pr.approved_at, pr.created_at) DESC LIMIT $${params.length}`,
      params
    );
    for (const r of rows.rows) {
      items.push({
        id: `prescription:${r.id}`,
        type: 'prescription',
        occurredAt: iso(r.approved_at ?? r.created_at),
        recordedAt: iso(r.created_at),
        organization: org(r),
        author: author(r),
        provenance: 'clinician_authored',
        reviewStatus: r.status,
        ...mark(r.organization_id, 'prescriptions'),
        source: { resource: 'prescriptions', id: r.id },
        data: { status: r.status, notes: r.notes, items: r.items },
      });
    }
  }

  // ---- lab results (the reviewing clinician is the author once reviewed, otherwise the ordering clinician)
  if (wants('lab_result')) {
    scope.externalOrgIds = externalFor('labs');
    const params: unknown[] = [];
    const where = visibility(viewer, scope, 'lr', params, `lr.status = 'approved'`, null).replace('lr.patient_id', 'lo.patient_id');
    const filters = applyFilters(options, params, 'lr.organization_id', 'COALESCE(lr.reviewed_at, lr.created_at)');
    params.push(limit);
    const rows = await query(
      `SELECT lr.id, lr.organization_id, lr.created_at, lr.reviewed_at, lr.status, lr.parameter_name, lr.value, lr.unit, lr.reference_range,
              lr.is_abnormal, lo.test_name_ar, lo.test_name_en, lo.test_category, o.name_ar org_ar, o.name_en org_en,
              u.full_name_ar a_ar, u.full_name_en a_en
       FROM lab_results lr JOIN lab_orders lo ON lo.id = lr.lab_order_id
       JOIN organizations o ON o.id = lr.organization_id JOIN users u ON u.id = COALESCE(lr.reviewed_by, lo.clinician_id)
       WHERE ${where}${filters} ORDER BY COALESCE(lr.reviewed_at, lr.created_at) DESC LIMIT $${params.length}`,
      params
    );
    for (const r of rows.rows) {
      items.push({
        id: `lab_result:${r.id}`,
        type: 'lab_result',
        occurredAt: iso(r.reviewed_at ?? r.created_at),
        recordedAt: iso(r.created_at),
        organization: org(r),
        author: author(r),
        provenance: 'clinician_authored',
        reviewStatus: r.status,
        ...mark(r.organization_id, 'labs'),
        source: { resource: 'lab_results', id: r.id },
        data: {
          parameterName: r.parameter_name,
          value: r.value,
          unit: r.unit,
          referenceRange: r.reference_range,
          flaggedAbnormalByClinician: r.is_abnormal,
          testNameAr: r.test_name_ar,
          testNameEn: r.test_name_en,
          category: r.test_category,
          reviewedAt: r.reviewed_at ? iso(r.reviewed_at) : null,
        },
      });
    }
  }

  // ---- documents
  if (wants('document')) {
    scope.externalOrgIds = externalFor('documents');
    const params: unknown[] = [];
    const where = visibility(viewer, scope, 'd', params, `d.visible_to_patient = TRUE`, null);
    const filters = applyFilters(options, params, 'd.organization_id', 'COALESCE(d.document_date::timestamptz, d.created_at)');
    params.push(limit);
    const rows = await query(
      `SELECT d.id, d.organization_id, d.created_at, to_char(d.document_date, 'YYYY-MM-DD') AS document_date, d.title, d.file_name, d.mime_type, d.file_size, d.source_type,
              d.review_status, d.visit_id, d.ai_processing_allowed, d.doc_type, d.provider_name, dp.status AS ai_status,
              (SELECT COUNT(*)::int FROM document_facts f WHERE f.document_id = d.id AND f.review_status IN ('accepted', 'corrected')) AS facts_reviewed,
              o.name_ar org_ar, o.name_en org_en, u.full_name_ar a_ar, u.full_name_en a_en
       FROM documents d LEFT JOIN organizations o ON o.id = d.organization_id JOIN users u ON u.id = d.uploaded_by
       LEFT JOIN document_processing dp ON dp.document_id = d.id
       WHERE d.deleted_at IS NULL AND ${where}${filters} ORDER BY COALESCE(d.document_date::timestamptz, d.created_at) DESC LIMIT $${params.length}`,
      params
    );
    for (const r of rows.rows) {
      items.push({
        id: `document:${r.id}`,
        type: 'document',
        occurredAt: r.document_date ? `${r.document_date}T00:00:00.000Z` : iso(r.created_at),
        recordedAt: iso(r.created_at),
        organization: org(r),
        author: author(r),
        provenance: r.source_type,
        reviewStatus: r.review_status,
        ...mark(r.organization_id, 'documents'),
        source: { resource: 'documents', id: r.id },
        data: {
          title: r.title || r.file_name, fileName: r.file_name, mimeType: r.mime_type, fileSize: Number(r.file_size), visitId: r.visit_id,
          // AI state only: the processing status and how many suggestions a clinician has confirmed, never the suggestions themselves.
          aiProcessingAllowed: r.ai_processing_allowed, aiStatus: r.ai_status ?? null, factsReviewed: r.facts_reviewed, docType: r.doc_type ?? null, providerName: r.provider_name ?? null,
        },
      });
    }
  }

  // ---- appointments (never shared across centers)
  if (wants('appointment')) {
    const params: unknown[] = [scope.patientId];
    let where = 'a.patient_id = $1';
    if (viewer.kind === 'clinician') {
      params.push(viewer.orgId);
      where += ` AND a.organization_id = $${params.length}`;
    }
    const filters = applyFilters(options, params, 'a.organization_id', '(a.appointment_date + a.start_time)');
    params.push(limit);
    const rows = await query(
      `SELECT a.id, a.organization_id, a.created_at, to_char(a.appointment_date, 'YYYY-MM-DD') AS appointment_date, a.start_time, a.end_time, a.status, a.reason,
              o.name_ar org_ar, o.name_en org_en, u.full_name_ar a_ar, u.full_name_en a_en
       FROM appointments a JOIN organizations o ON o.id = a.organization_id JOIN users u ON u.id = a.clinician_id
       WHERE ${where}${filters} ORDER BY (a.appointment_date + a.start_time) DESC LIMIT $${params.length}`,
      params
    );
    for (const r of rows.rows) {
      const day: string = r.appointment_date;
      items.push({
        id: `appointment:${r.id}`,
        type: 'appointment',
        occurredAt: new Date(`${day}T${String(r.start_time).slice(0, 8)}Z`).toISOString(),
        recordedAt: iso(r.created_at),
        organization: org(r),
        author: author(r),
        provenance: 'system',
        reviewStatus: 'not_applicable',
        isExternal: false,
        consentId: null,
        source: { resource: 'appointments', id: r.id },
        data: { date: day, startTime: String(r.start_time).slice(0, 5), endTime: String(r.end_time).slice(0, 5), status: r.status, reason: r.reason },
      });
    }
  }

  // ---- patient-reported symptom logs: the patient, and clinicians of the center the report was addressed to
  if (wants('symptom_report')) {
    const params: unknown[] = [scope.patientId];
    let where = 's.patient_id = $1 AND s.deleted_at IS NULL';
    if (viewer.kind === 'clinician') {
      params.push(viewer.orgId);
      const ext = externalFor('all');
      params.push(ext);
      where += ` AND (s.organization_id = $${params.length - 1} OR s.organization_id = ANY($${params.length}))`;
    }
    const filters = applyFilters(options, params, 's.organization_id', 's.onset_date');
    params.push(limit);
    const rows = await query(
      `SELECT s.id, s.organization_id, s.created_at, s.onset_date, s.symptom_description, s.severity, s.notes, s.duration_text, s.frequency, s.better_factors, s.worse_factors, o.name_ar org_ar, o.name_en org_en
       FROM symptom_reports s LEFT JOIN organizations o ON o.id = s.organization_id
       WHERE ${where}${filters} ORDER BY s.onset_date DESC LIMIT $${params.length}`,
      params
    );
    for (const r of rows.rows) {
      items.push({
        id: `symptom_report:${r.id}`,
        type: 'symptom_report',
        occurredAt: iso(r.onset_date),
        recordedAt: iso(r.created_at),
        organization: r.organization_id ? org(r) : { id: '', name_ar: '', name_en: '' },
        author: null,
        provenance: 'patient_reported',
        reviewStatus: 'not_applicable',
        ...(r.organization_id ? mark(r.organization_id, 'all') : { isExternal: false, consentId: null }),
        source: { resource: 'symptom_reports', id: r.id },
        data: { description: r.symptom_description, severityReportedByPatient: r.severity, notes: r.notes, durationText: r.duration_text, frequency: r.frequency, betterFactors: r.better_factors, worseFactors: r.worse_factors },
      });
    }
  }


  // ---- events the patient recorded themselves (visits, procedures, measurements): the patient's own timeline only
  // They belong to no center, so a center filter excludes them.
  if (viewer.kind === 'patient' && wants('patient_entry') && !options.organizationId) {
    const params: unknown[] = [scope.patientId];
    let filters = '';
    for (const [key, op] of [['from', '>='], ['to', '<='], ['before', '<']] as const) {
      if (options[key]) {
        params.push(options[key]);
        filters += ` AND e.event_date::timestamptz ${op} $${params.length}`;
      }
    }
    params.push(limit);
    const rows = await query(
      `SELECT e.id, e.kind, e.title, e.created_at, to_char(e.event_date, 'YYYY-MM-DD') AS event_date, e.value, e.unit, e.provider_name, e.notes, e.source, e.review_status
       FROM health_entries e
       WHERE e.patient_id = $1 AND e.deleted_at IS NULL AND e.kind IN ('visit', 'procedure', 'measurement') AND e.event_date IS NOT NULL${filters}
       ORDER BY e.event_date DESC LIMIT $${params.length}`,
      params
    );
    for (const r of rows.rows) {
      items.push({
        id: `patient_entry:${r.id}`,
        type: 'patient_entry',
        occurredAt: `${r.event_date}T00:00:00.000Z`,
        recordedAt: iso(r.created_at),
        organization: { id: '', name_ar: '', name_en: '' },
        author: null,
        provenance: r.source === 'patient' || r.source === 'assistant' ? 'patient_reported' : r.source === 'document' ? 'patient_uploaded' : 'clinician_uploaded',
        reviewStatus: r.review_status,
        isExternal: false,
        consentId: null,
        source: { resource: 'health_entries', id: r.id },
        data: { kind: r.kind, title: r.title, value: r.value, unit: r.unit, providerName: r.provider_name, notes: r.notes },
      });
    }
  }

  items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : a.id < b.id ? 1 : -1));
  const page = items.slice(0, options.limit);
  const hasMore = items.length > options.limit;
  const external = page.filter((i) => i.isExternal);

  return {
    items: page,
    hasMore,
    nextBefore: hasMore ? page[page.length - 1].occurredAt : null,
    externalOrganizationIds: [...new Set(external.map((i) => i.organization.id))],
    consentIds: [...new Set(external.map((i) => i.consentId).filter((c): c is string => !!c))],
  };
}


/** Parses and validates the shared timeline query string (types, organizationId, from, to, before, limit). */
export function parseTimelineQuery(q: Record<string, unknown>): { options: TimelineOptions } | { error: string } {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const typesRaw = str(q.type) || str(q.types);
  let types: TimelineType[] | undefined;
  if (typesRaw) {
    types = typesRaw.split(',').map((t) => t.trim()) as TimelineType[];
    if (types.some((t) => !TIMELINE_TYPES.includes(t))) return { error: `type must be a comma list of: ${TIMELINE_TYPES.join(', ')}.` };
  }
  const organizationId = str(q.organizationId);
  if (organizationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) return { error: 'organizationId must be a valid identifier.' };
  for (const key of ['from', 'to', 'before']) {
    const v = str(q[key]);
    if (v && Number.isNaN(Date.parse(v))) return { error: `${key} must be an ISO date or timestamp.` };
  }
  const limitRaw = parseInt(str(q.limit), 10);
  const limit = Number.isNaN(limitRaw) ? 50 : Math.min(Math.max(limitRaw, 1), 200);
  return { options: { types, organizationId: organizationId || undefined, from: str(q.from) || undefined, to: str(q.to) || undefined, before: str(q.before) || undefined, limit } };
}
