/**
 * Vocabulary check for machine translation. The neural model is good at word order and grammar and unreliable on
 * medical terms ("تخطيط القلب" -> "Heart planning", "حساسية" -> "Sensitivity"). So a machine translation is accepted only
 * when every concept word of the original is in the reviewed vocabulary (lexicon, phrases, fixed expressions and the
 * short list below), each of them appears in the output with one of its reviewed renderings, the output adds no concept
 * that was not in the original, a negation is kept, and any Latin term inside Arabic output is copied exactly.
 * The model may arrange the sentence; it may not choose the words. Anything else is shown as written.
 */
import { nz } from './glossary/engine.js';
import { AR_FUNC, ENTRIES, EN_FUNC } from './glossary/lexicon.js';
import { PHRASES } from './glossary/phrases.js';
import type { Lang } from './provider.js';

const stemEn = (w: string) => w.toLowerCase().replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '');
const AR_LETTERS = /[ء-ي]+/g;
const arWords = (s: string) => (nz(s).match(AR_LETTERS) ?? []).map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w));
const enWords = (s: string) => (s.toLowerCase().match(/[a-z]+/g) ?? []).map(stemEn);

/** Words that carry no concept of their own (articles, pronouns, auxiliaries, question words, prepositions). */
const AR_FILLER = new Set(
  ['في', 'من', 'على', 'الى', 'عن', 'مع', 'و', 'او', 'ان', 'ما', 'ماذا', 'هل', 'هذا', 'هذه', 'ذلك', 'تلك', 'عند', 'قد', 'لقد', 'كان', 'كانت', 'يكون', 'تكون', 'انا', 'انت', 'هو', 'هي', 'نحن', 'لي', 'لك', 'له', 'لها', 'به', 'بها', 'التي', 'الذي', 'ان', 'اي', 'ثم', 'بعد', 'قبل', 'منذ', 'لمده', 'خلال', 'حتى', 'جدا', 'ايضا', 'فقط', 'الى', 'كيف', 'لماذا', 'متى']
    .map(nz),
);
const EN_FILLER = new Set(
  ['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'for', 'with', 'when', 'after', 'before', 'since', 'i', 'me', 'my', 'you', 'your', 'it', 'its', 'he', 'she', 'they', 'them', 'this', 'that', 'there', 'here', 'has', 'have', 'had', 'do', 'does', 'did', 'get', 'gets', 'getting', 'got', 'become', 'becomes', 'what', 'which', 'how', 'why', 'should', 'will', 'would', 'can', 'could', 'very', 'also', 'just', 'from', 'about', 'during', 'than', 'then', 'by', 'as', 'so', 'up', 'some', 'any', 'more', 'much', 'ago', 'while', 'into', 'over', 'out']
    .map(stemEn),
);

/** Verbs and everyday words that notes use around the medical terms. Arabic forms first, English stems second. */
const EXTRA: Array<[string[], string[]]> = [
  [['يزداد', 'يزيد', 'تزداد', 'تزيد', 'يسوء', 'تسوء', 'اسوا', 'يزيده', 'تزيده'], ['worse', 'worsen', 'increase', 'increas', 'aggravat']],
  [['يتحسن', 'تتحسن', 'يخف', 'تخف', 'افضل', 'يخففه', 'تخففه', 'تحسن'], ['better', 'improve', 'improv', 'eas', 'reliev', 'reduc']],
  [['احتاج', 'يحتاج', 'تحتاج', 'حاجه'], ['need']],
  [['تغيير', 'اغير', 'يغير', 'تغير'], ['change', 'chang']],
  [['نسيت', 'نسي', 'فاتتني', 'فاتني'], ['forgot', 'forget', 'miss', 'missed']],
  [['امس'], ['yesterday']],
  [['يوم'], ['today', 'day']],
  [['غدا'], ['tomorrow']],
  [['شرب', 'اشرب', 'يشرب', 'تشرب'], ['drink', 'drinking']],
  [['اكل', 'اتناول', 'تناول', 'يتناول'], ['eat', 'eating', 'meal', 'take', 'tak']],
  [['مشي', 'امشي', 'يمشي'], ['walk', 'walking']],
  [['حركه'], ['movement', 'moving', 'activity', 'activ', 'mov']],
  [['توتر'], ['stress']],
  [['قله', 'نقص'], ['lack', 'shortage', 'little']],
  [['يظهر', 'تظهر', 'ظهر'], ['appear', 'occur', 'show']],
  [['بدا', 'بدات', 'ابدا', 'بدايه'], ['start', 'began', 'begin', 'onset']],
  [['توقف', 'اوقفت', 'وقف'], ['stop', 'stopp']],
  [['يسبب', 'يسبب', 'سبب', 'اسباب'], ['cause', 'caus']],
  [['جلوس'], ['sit', 'sitting']],
  [['وقوف'], ['stand', 'standing']],
  [['صعود'], ['climb', 'climbing']],
  [['درج'], ['stair']],
  [['نوع'], ['type']],
  [['كل'], ['every', 'each', 'all']],
  [['شعور', 'اشعر', 'يشعر', 'تشعر'], ['feel', 'feeling']],
  [['دواء', 'ادويه'], ['medicine', 'medication', 'drug', 'medic']],
  [['جرعه', 'جرعات'], ['dose']],
  [['نوم', 'انام', 'ينام'], ['sleep', 'sleeping']],
  [['راحه', 'ارتاح'], ['rest', 'resting']],
  // adjective forms of symptom nouns ("I feel dizzy" for "أشعر بدوار")
  [['دوار', 'دوخه', 'دايخ'], ['dizzy', 'dizzi', 'dizziness']],
  [['غثيان'], ['nauseous', 'nauseat', 'nausea']],
  [['تعب', 'تعبان', 'متعب', 'ارهاق'], ['tired', 'fatigue', 'exhaust']],
  [['حكه'], ['itchy', 'itch']],
  [['تورم', 'متورم', 'متورمه'], ['swollen', 'swell']],
];

/** Negation must survive translation exactly: a dropped "not" turns the meaning around. */
const AR_NEG = new Set(['لا', 'لم', 'لن', 'ليس', 'ليست', 'غير', 'بدون', 'دون'].map(nz));
const EN_NEG = new Set(['not', 'no', 'never', 'without', 'dont', 'doesnt', 'didnt', 'cannot', 'nt']);

const arToEnTerms = new Map<string, Set<string>>();
const enToArTerms = new Map<string, Set<string>>();
const link = (ar: string[], en: string[]) => {
  for (const a of ar) {
    const set = arToEnTerms.get(a) ?? new Set<string>();
    en.forEach((e) => set.add(e));
    arToEnTerms.set(a, set);
  }
  for (const e of en) {
    const set = enToArTerms.get(e) ?? new Set<string>();
    ar.forEach((a) => set.add(a));
    enToArTerms.set(e, set);
  }
};
const contentEn = (s: string) => enWords(s).filter((w) => w.length > 1 && !EN_FILLER.has(w));
const contentAr = (s: string) => arWords(s).filter((w) => w.length > 1 && !AR_FILLER.has(w));

for (const e of ENTRIES) {
  const arForms = [...e.ar, ...(e.arPl ?? []), ...(e.arDual ? [e.arDual] : []), ...(e.arFem ? [e.arFem] : [])];
  const en = [...contentEn(e.en), ...(e.enPl ? contentEn(e.enPl) : [])];
  link(arForms.flatMap(contentAr), en);
}
for (const p of PHRASES) link(contentAr(p.ar.replace(/#/g, '')), contentEn(p.en.replace(/#/g, '')));
for (const [a, e] of Object.entries(AR_FUNC)) link(contentAr(a), contentEn(e));
for (const [e, a] of Object.entries(EN_FUNC)) link(contentAr(a), contentEn(e));
for (const [ar, en] of EXTRA) link(ar.map(nz), [...new Set([...en, ...en.map(stemEn)])]);

const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

/** An Arabic word as written in running text: with its attached و / ف / ب / ل / ك and ال taken off when that helps. */
const arVariants = (w: string) => {
  const out = [w];
  const one = /^[وفبلك]/.test(w) && w.length > 3 ? w.slice(1) : null;
  if (one) out.push(one);
  for (const x of [...out]) if (x.startsWith('ال') && x.length > 3) out.push(x.slice(2));
  return out;
};

const renderingsOf = (w: string, from: Lang): Set<string> | null => {
  if (from === 'en') return enToArTerms.get(w) ?? null;
  for (const v of arVariants(w)) {
    const r = arToEnTerms.get(v);
    if (r) return r;
  }
  return null;
};

const present = (needles: Set<string>, words: string[], to: Lang) =>
  words.some((w) => (to === 'ar' ? arVariants(w) : [w]).some((v) => [...needles].some((n) => same(v, n))));

export function termsVerified(source: string, out: string, from: Lang, to: Lang): boolean {
  const src = from === 'ar' ? contentAr(source) : contentEn(source);
  const dst = to === 'ar' ? contentAr(out) : contentEn(out);
  const srcAll = from === 'ar' ? arWords(source) : enWords(source);
  const dstAll = to === 'ar' ? arWords(out) : enWords(out);

  // Who it is about must not change. Patient notes speak in the first person; a third person ("she", "his") cannot be
  // checked against Arabic verb forms, so it is never introduced and never relied on.
  const THIRD = /(?:^|[^a-z])(he|she|they|his|her|hers|their|him|them)(?![a-z])/i;
  if ((to === 'en' && THIRD.test(out)) || (from === 'en' && THIRD.test(source))) return false;

  // negation kept, both ways
  const negSrc = srcAll.some((w) => (from === 'ar' ? AR_NEG : EN_NEG).has(w));
  const negDst = dstAll.some((w) => (to === 'ar' ? AR_NEG : EN_NEG).has(w));
  if (negSrc !== negDst) return false;

  // Latin terms (a drug name, HbA1c) inside Arabic output are copied, never altered
  if (to === 'ar') {
    const latinSrc = new Set((source.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []).map((x) => x.toLowerCase()));
    for (const l of out.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []) if (!latinSrc.has(l.toLowerCase())) return false;
  }

  // every concept of the original is known and appears with a reviewed rendering
  const allowed = new Set<string>();
  for (const w of src) {
    if ((from === 'ar' ? AR_NEG : EN_NEG).has(w)) continue;
    const r = renderingsOf(w, from);
    if (!r || r.size === 0) return false;
    if (!present(r, dst, to)) return false;
    r.forEach((x) => allowed.add(x));
  }
  // nothing new: every concept word of the output is a rendering of something in the original
  for (const w of dst) {
    if ((to === 'ar' ? AR_NEG : EN_NEG).has(w)) continue;
    const ok = (to === 'ar' ? arVariants(w) : [w]).some((v) => [...allowed].some((a) => same(v, a)));
    if (!ok) return false;
  }
  return true;
}
