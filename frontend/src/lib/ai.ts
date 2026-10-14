// SIMULATED, rule-based "AI" that runs in the browser. No network, no model.
// It only PROPOSES: callers decide what to show, and nothing here writes to the API.
// Output is for the doctor only and is never shown to patients.

import {
  ALLERGEN_ALIASES, ALLERGY_RULES, ALLERGY_SEVERITY, COMPLAINT_HINTS, DIAGNOSIS_PREFIX, DRUG_PAIRS,
  FOLLOWUP_SOURCE, KNOWN_MEDICINES, KNOWN_TESTS, SEVERITY_RANK,
} from './rules.js';
import { abnormalLabs, activeMedicines, draftVisits } from './selectors.js';
import type { Allergy, Interaction, PatientData, Severity } from './types.js';

// ---------------------------------------------------------------- interactions

const norm = (s: string) => s.toLowerCase();
const hasAny = (name: string, keys: string[]) => keys.some((k) => norm(name).includes(k));

const allergenKey = (a: Pick<Allergy, 'allergen_ar' | 'allergen_en'>): string => {
  const en = norm(a.allergen_en || '');
  for (const rule of ALLERGY_RULES) if (en.includes(rule.allergen)) return rule.allergen;
  for (const [word, key] of Object.entries(ALLERGEN_ALIASES)) if ((a.allergen_ar || '').includes(word)) return key;
  return en;
};

export function checkInteractions(
  medicines: string[],
  allergies: Array<Pick<Allergy, 'allergen_ar' | 'allergen_en' | 'severity'>> = [],
): Interaction[] {
  const meds = Array.from(new Set(medicines.map((m) => m.trim()).filter(Boolean)));
  const out: Interaction[] = [];

  for (const pair of DRUG_PAIRS) {
    const a = meds.find((m) => norm(m).includes(pair.a));
    const b = meds.find((m) => norm(m).includes(pair.b));
    if (a && b && a !== b) {
      out.push({ id: `dd:${pair.a}:${pair.b}`, kind: 'drug-drug', severity: pair.severity, a, b, message_ar: pair.message_ar, message_en: pair.message_en });
    }
  }

  for (const allergy of allergies) {
    const rule = ALLERGY_RULES.find((r) => r.allergen === allergenKey(allergy));
    if (!rule) continue;
    for (const med of meds.filter((m) => hasAny(m, rule.drugs))) {
      out.push({
        id: `da:${rule.allergen}:${norm(med)}`,
        kind: 'drug-allergy',
        severity: ALLERGY_SEVERITY[allergy.severity] === 'high' ? 'high' : 'medium',
        a: med,
        b: allergy.allergen_en || allergy.allergen_ar,
        message_ar: rule.message_ar,
        message_en: rule.message_en,
      });
    }
  }
  return out.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
}

// ---------------------------------------------------------------- summary

export type ProblemKind = 'allergy' | 'lab' | 'interaction' | 'draft' | 'diagnosis';

export interface Problem {
  id: string;
  kind: ProblemKind;
  severity: Severity;
  subject_ar: string;
  subject_en: string;
  at: string; // ISO date used for recency tie-breaks
  source: { kind: 'allergy' | 'lab' | 'rx' | 'visit'; refId: string };
}

export interface AiSummary {
  problems: Problem[]; // top 3 by severity, then recency
  interactions: Interaction[];
  highInteractions: Interaction[];
}

export function aiSummary(data: PatientData): AiSummary {
  const { patient, visits, labOrders } = data;
  const candidates: Problem[] = [];

  for (const a of patient.allergies ?? []) {
    candidates.push({
      id: `allergy:${a.id}`, kind: 'allergy', severity: ALLERGY_SEVERITY[a.severity],
      subject_ar: a.allergen_ar, subject_en: a.allergen_en, at: '', source: { kind: 'allergy', refId: a.id },
    });
  }
  for (const l of abnormalLabs(labOrders)) {
    candidates.push({
      id: `lab:${l.id}`, kind: 'lab', severity: 'medium',
      subject_ar: l.parameter_name, subject_en: l.parameter_name, at: l.date, source: { kind: 'lab', refId: l.orderId },
    });
  }
  const interactions = checkInteractions(activeMedicines(data.prescriptions).map((i) => i.medication_name), patient.allergies ?? []);
  for (const x of interactions.filter((i) => i.severity === 'high')) {
    candidates.push({
      id: `ix:${x.id}`, kind: 'interaction', severity: 'high',
      subject_ar: `${x.a} + ${x.b}`, subject_en: `${x.a} + ${x.b}`, at: '', source: { kind: 'rx', refId: x.id },
    });
  }
  for (const v of draftVisits(visits)) {
    candidates.push({
      id: `draft:${v.id}`, kind: 'draft', severity: 'low',
      subject_ar: v.diagnosis, subject_en: v.diagnosis, at: v.visit_date, source: { kind: 'visit', refId: v.id },
    });
  }
  const latestApproved = visits.find((v) => v.status === 'approved');
  if (latestApproved) {
    candidates.push({
      id: `dx:${latestApproved.id}`, kind: 'diagnosis', severity: 'low',
      subject_ar: latestApproved.diagnosis, subject_en: latestApproved.diagnosis, at: latestApproved.visit_date,
      source: { kind: 'visit', refId: latestApproved.id },
    });
  }

  const problems = candidates
    .sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] || y.at.localeCompare(x.at))
    .slice(0, 3);

  return { problems, interactions, highInteractions: interactions.filter((i) => i.severity === 'high') };
}

// ---------------------------------------------------------------- dictation parsing

export type ParsedKind = 'complaint' | 'diagnosis' | 'medicine' | 'test' | 'followup';

export interface ParsedItem {
  id: string;
  kind: ParsedKind;
  text: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Singular kinds (complaint, diagnosis) have a stable id so a doctor's edit survives re-parsing. */
export function parseVisit(text: string): ParsedItem[] {
  const src = text.trim();
  if (!src) return [];
  const items: ParsedItem[] = [];
  const push = (kind: ParsedKind, value: string) => {
    const v = clean(value);
    if (!v) return;
    const id = kind === 'complaint' || kind === 'diagnosis' ? kind : `${kind}:${v.toLowerCase()}`;
    if (!items.some((i) => i.id === id)) items.push({ id, kind, text: v });
  };

  const dx = src.match(DIAGNOSIS_PREFIX);
  if (dx) push('diagnosis', dx[1]);

  const sentences = src.split(/[.\n؟?!]+/).map(clean).filter(Boolean);
  const complaint =
    sentences.find((s) => COMPLAINT_HINTS.test(s) && !DIAGNOSIS_PREFIX.test(s)) ??
    sentences.find((s) => !DIAGNOSIS_PREFIX.test(s));
  if (complaint) push('complaint', complaint);

  // Medicines: a known name, optionally followed by a dose such as "5 mg".
  for (const med of KNOWN_MEDICINES) {
    const m = src.match(new RegExp(`\\b${med}\\b(?:\\s+\\d+(?:\\.\\d+)?\\s*(?:mg|mcg|g|ml|iu))?`, 'i'));
    if (m) push('medicine', m[0]);
  }
  for (const t of KNOWN_TESTS) if (t.pattern.test(src)) push('test', t.key);
  for (const f of src.match(new RegExp(FOLLOWUP_SOURCE, 'gi')) ?? []) push('followup', f);

  return items;
}
