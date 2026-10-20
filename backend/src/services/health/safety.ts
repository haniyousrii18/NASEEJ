/**
 * Deterministic safety rules for the patient assistant. They run on the server BEFORE any model is called and again on
 * the model's output, so a change to a prompt or a different provider cannot switch them off.
 *
 * IMPORTANT: the fixed wording below is a safe default written by the engineering team. It has NOT been reviewed by a
 * clinician. A clinical reviewer must approve (or replace) URGENT_MESSAGE and the keyword lists before real patients use
 * the assistant. Nothing here diagnoses or triages: a match only shows the fixed message.
 */
export type Lang = 'ar' | 'en';

/** Lower-cases Latin text, drops Arabic diacritics/tatweel and unifies common letter variants. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
}

const URGENT_EN = [
  /chest (pain|pressure|tightness)/,
  /(can'?t|cannot|unable to|difficult(y)?|trouble|struggling to) breath/,
  /short(ness)? of breath/,
  /(passed out|fainted|unconscious|lost consciousness|blacked out)/,
  /(seizure|convulsion|fitting)/,
  /(severe|heavy|uncontrolled|won'?t stop) bleeding/,
  /(coughing|vomiting|throwing up|passing) blood/,
  /(face|mouth) (is )?(droop|numb)/,
  /slurred speech|can'?t speak/,
  /sudden(ly)? (weak|numb|confus|loss of vision|blind)/,
  /sudden severe headache|worst headache/,
  /(throat|tongue|lips?) (is |are )?(swelling|swollen)/,
  /(overdos|took too (many|much))/,
  /(suicid|kill myself|end my life|want to die|hurt myself|harm myself)/,
];

const URGENT_AR = [
  /الم (في |ب)?الصدر|ضغط (في |على )?الصدر|ضيق (في )?الصدر/,
  /ضيق (في )?(ال)?تنفس|صعوب[ةه] (في )?(ال)?تنفس|لا استطيع (ان )?اتنفس|مش قادر اتنفس|اختناق/,
  /اغماء|اغمي علي|فقدت (ال)?وعي|فقدان (ال)?وعي|مغمى/,
  /تشنج|نوب[ةه] صرع|صرع/,
  /نزيف (شديد|حاد|لا يتوقف)/,
  /(قيء|تقيات|سعال|اسعل) دم|دم في (ال)?براز|دم في (ال)?قيء/,
  /التواء (في )?(ال)?وجه|تلعثم|ثقل (في )?(ال)?كلام|لا استطيع (ال)?كلام/,
  /ضعف مفاجئ|خدر مفاجئ|فقدان (ال)?بصر (ال)?مفاجئ|فقد (ال)?بصر/,
  /صداع (شديد )?مفاجئ|اسوا صداع/,
  /تورم (في )?(ال)?(حلق|لسان|شفه)/,
  /جرع[ةه] زائد[ةه]|تناولت (كميه|جرعات) كبير/,
  /انتحار|اقتل نفسي|انهي حياتي|اريد ان اموت|اوذي نفسي|اؤذي نفسي/,
];

export function isUrgentText(text: string): boolean {
  const n = normalizeText(text);
  return URGENT_EN.some((r) => r.test(n)) || URGENT_AR.some((r) => r.test(n));
}

const ADVICE_EN = [
  /\bshould i (take|stop|start|increase|decrease|reduce|skip|double|combine|mix)\b/,
  /\bcan i (take|stop|skip|combine|mix)\b/,
  /\b(what|which) (dose|dosage|medicine|medication|drug|treatment)s? (should|do|can) i\b/,
  /\bhow (much|many) .{0,40}\bshould i (take|use)\b/,
  /\bdo i have\b/,
  /\bwhat('?s| is) wrong with me\b/,
  /\b(diagnose|diagnosis for) me\b/,
  /\bis (it|this) (cancer|serious|dangerous|fatal|life[- ]threatening)\b/,
  /\bprescribe\b/,
  /\bchange my (dose|dosage|medication|medicine|treatment)\b/,
  /\b(what|which) (disease|illness|condition) (do|could|might) i have\b/,
];

const ADVICE_AR = [
  /هل (يجب ان )?(اتناول|اخذ|اوقف|ابدا|ازيد|اقلل|اضاعف|اجمع)/,
  /هل يمكنني (ان )?(اتناول|اخذ|اوقف|اجمع)/,
  /كم (جرع[ةه]|حب[ةه]|مره) (يجب|احتاج|اتناول|اخذ)/,
  /ما (هي )?(ال)?جرع[ةه] (ال)?(مناسب|صحيح)/,
  /هل (عندي|لدي|اعاني من|انا مصاب)/,
  /ما (هو )?مرضي|ماذا (عندي|لدي|بي)|ما (الذي )?(بي|اصابني)/,
  /شخصلي|شخص (لي )?(حالتي|مرضي)|تشخيص (حالتي|مرضي|لي)/,
  /هل (هو|هذا) (سرطان|خطير|مميت)/,
  /(اصرف|اكتب|وصف) لي (دواء|علاج)/,
  /غير (لي )?(ال)?(جرعه|دواء|علاج)/,
  /ما (ال)?(دواء|علاج) (ال)?(مناسب|الذي يجب)/,
];

export function isMedicalAdviceRequest(text: string): boolean {
  const n = normalizeText(text);
  return ADVICE_EN.some((r) => r.test(n)) || ADVICE_AR.some((r) => r.test(n));
}

/** Phrases that mean a reply is advising or diagnosing. A reply that matches is replaced by the fixed refusal. */
const UNSAFE_OUTPUT = [
  /\byou (should|must|need to|ought to) (take|stop|start|increase|decrease|reduce|skip|double)\b/i,
  /\b(increase|decrease|reduce|double|halve|stop taking|skip)\b.{0,30}\b(dose|dosage|medication|medicine|tablets?|pills?)\b/i,
  /\byou (probably|likely|may|might|could) (have|be suffering from)\b/i,
  /\byou (have|are suffering from) (an? )?(infection|cancer|diabetes|disease|syndrome|disorder)\b/i,
  /\bi (diagnose|recommend (that )?you (take|stop|start))\b/i,
  /\bthis (suggests|indicates|means you have)\b/i,
  /يجب (عليك )?(ان )?(تتناول|توقف|تزيد|تقلل|تاخذ|تبدا)/,
  /(زد|قلل|اوقف|ضاعف) (من )?(جرعه|دواءك|الدواء|العلاج)/,
  /(انت|حالتك) (مصاب|تعاني من|تشير الي)/,
  /(على الارجح|غالبا|ربما|قد) (انك|تكون) (مصاب|تعاني)/,
];

export function looksUnsafeOutput(text: string): boolean {
  const n = normalizeText(text);
  return UNSAFE_OUTPUT.some((r) => r.test(text) || r.test(n));
}

export const URGENT_MESSAGE: Record<Lang, string> = {
  ar: 'ما وصفته قد يحتاج إلى مساعدة طبية عاجلة. لا تنتظر: اتصل برقم الطوارئ في بلدك الآن أو توجّه إلى أقرب قسم طوارئ، أو اطلب من أحد القريبين منك مساعدتك. هذا التطبيق لا يستطيع تقييم حالتك ولا يغني عن الرعاية الطبية العاجلة.',
  en: 'What you describe may need urgent medical help. Do not wait: call your local emergency number now or go to the nearest emergency department, or ask someone near you to help. This app cannot assess your condition and is not a substitute for urgent care.',
};

export const ADVICE_MESSAGE: Record<Lang, string> = {
  ar: 'لا أستطيع تشخيص حالتك أو وصف علاج أو تغيير دواء أو جرعة؛ هذا قرار طبيبك أو الصيدلاني. يمكنني أن أساعدك في تجهيز سؤالك لطبيبك ليكون ضمن ملخص زيارتك، أو أن أبحث لك في سجلك.',
  en: "I can't diagnose, prescribe, or change a medicine or dose; that is for your doctor or pharmacist. I can help you write this as a question for your doctor in your visit summary, or look it up in your record.",
};

export const OFF_TOPIC_NOT_FOUND: Record<Lang, string> = {
  ar: 'لم أجد هذه المعلومة في سجلك. يمكنك إضافتها بنفسك، أو رفع المستند الذي يحتوي عليها.',
  en: "I couldn't find that in your record. You can add it yourself, or upload the document that contains it.",
};
