import { CandidateFact, DOCUMENT_TYPES, FACT_KINDS, ProviderError, SuggestedDocumentType } from './types.js';

/** Provider output is untrusted input: every field is type-checked, trimmed and bounded before it is stored. */
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return t ? t.slice(0, max) : null;
};

const unit01 = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 1000) / 1000 : null);

const isoDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};

const smallInt = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2000 ? v : null);

export function sanitizeAnalysis(raw: any): {
  documentType: SuggestedDocumentType;
  documentTypeConfidence: number | null;
  pageCount: number | null;
  facts: CandidateFact[];
} {
  if (!raw || typeof raw !== 'object') throw new ProviderError('INVALID_OUTPUT', 'The provider returned no structured result.');
  const documentType = (DOCUMENT_TYPES as readonly string[]).includes(raw.document_type) ? (raw.document_type as SuggestedDocumentType) : 'other';
  const facts: CandidateFact[] = [];
  for (const f of Array.isArray(raw.facts) ? raw.facts.slice(0, 60) : []) {
    const label = text(f?.label, 255);
    const kind = (FACT_KINDS as readonly string[]).includes(f?.kind) ? (f.kind as CandidateFact['kind']) : null;
    if (!label || !kind) continue;
    facts.push({
      kind,
      label,
      value: text(f.value, 255),
      unit: text(f.unit, 50),
      date: isoDate(f.date),
      page: smallInt(f.page),
      passage: text(f.passage, 600),
      confidence: unit01(f.confidence),
      why: text(f.why, 400),
    });
  }
  return { documentType, documentTypeConfidence: unit01(raw.document_type_confidence), pageCount: smallInt(raw.page_count), facts };
}
