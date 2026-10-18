/**
 * The boundary between Naseej and any document-analysis provider (OCR + classification + candidate extraction).
 * A provider returns SUGGESTIONS only. Nothing here diagnoses, prescribes or decides; whatever comes back is stored
 * as unreviewed and stays separate from verified clinical records until a clinician accepts it.
 */
export const FACT_KINDS = ['condition', 'medication', 'allergy', 'lab_value', 'procedure', 'followup', 'other'] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const DOCUMENT_TYPES = [
  'lab_report',
  'imaging_report',
  'prescription',
  'discharge_summary',
  'clinical_note',
  'referral',
  'vaccination_record',
  'administrative',
  'other',
  'unreadable',
] as const;
export type SuggestedDocumentType = (typeof DOCUMENT_TYPES)[number];

export interface CandidateFact {
  kind: FactKind;
  label: string;
  value: string | null;
  unit: string | null;
  date: string | null; // YYYY-MM-DD
  page: number | null;
  passage: string | null; // text the provider says it read this from
  confidence: number | null; // 0..1, only when the provider supplied one
  why: string | null; // why the item was surfaced
}

export interface DocumentAnalysis {
  documentType: SuggestedDocumentType;
  documentTypeConfidence: number | null;
  pageCount: number | null;
  facts: CandidateFact[];
  model: string;
}

export interface AnalyzeInput {
  buffer: Buffer;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
}

export type ProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'UNREADABLE'
  | 'MODEL_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INVALID_OUTPUT'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT';

export class ProviderError extends Error {
  /** `detail` is only ever a provider's machine code (e.g. API_KEY_INVALID), never free text that could echo a document. */
  constructor(public code: ProviderErrorCode, message: string, public detail?: string) {
    super(message);
  }
}

export interface DocumentAnalysisProvider {
  /** Short identifier stored with each job, e.g. "anthropic". */
  readonly name: string;
  readonly model: string;
  /** True only when the credentials and settings needed to make a real call are present. */
  isConfigured(): boolean;
  analyze(input: AnalyzeInput): Promise<DocumentAnalysis>;
}
