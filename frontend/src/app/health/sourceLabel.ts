import { appT } from '../i18n/index.js';

/**
 * A summary item stores where it came from as a finished sentence ("Entered by me"), worded by whoever built the draft: the
 * server in the patient's language at that moment, or this app. The sentence is a label for a fixed set of origins, so it is
 * mapped back to the origin and worded again in the language being shown. A label that is not one of ours (an older draft,
 * a future origin) is shown as stored rather than guessed at.
 */
export type SourceOrigin = keyof (typeof appT)['ar']['health']['common']['source'];

/** The sentences the server has written into drafts (backend/src/services/health/prep.ts, `origin`), by origin. */
const SERVER_LABELS: Record<SourceOrigin, string[]> = {
  patient: ['أدخلتُه بنفسي', 'Entered by me'],
  assistant: ['من محادثة المساعد وأكدتُه', 'From assistant chat, confirmed by me'],
  document: ['من مستند وأكدتُه', 'From a document, confirmed by me'],
  clinician: ['سجّله طبيب', 'Recorded by a clinician'],
  upload: ['رفعتُه بنفسي', 'Uploaded by me'],
  ai_suggestion: ['قراءة آلية من مستند، لم يراجعها طبيب', 'Read from a document by software, not checked by a clinician'],
};

const BY_LABEL = new Map<string, SourceOrigin>();
for (const origin of Object.keys(SERVER_LABELS) as SourceOrigin[]) {
  for (const label of SERVER_LABELS[origin]) BY_LABEL.set(label, origin);
  for (const lang of ['ar', 'en'] as const) BY_LABEL.set(appT[lang].health.common.source[origin], origin);
}

export const originOfLabel = (label: string): SourceOrigin | null => BY_LABEL.get(label) ?? null;

/** The source sentence for an item, in `lang`. */
export const sourceText = (lang: 'ar' | 'en', label: string): string => {
  const origin = originOfLabel(label);
  return origin ? appT[lang].health.common.source[origin] : label;
};
