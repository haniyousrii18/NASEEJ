/**
 * The built-in medical glossary: the words and phrases Naseej can translate on its own, with no AI and no network.
 * Every entry is a plain, standard rendering. Anything not listed here is NOT translated (the engine refuses rather than
 * guess), so adding a word is the only way coverage grows, and a reviewer can read every rendering below.
 *
 * ar: the Arabic spellings, singular first (extra spellings and synonyms after it). Written without the leading "ال".
 */
export type Kind = 'n' | 'adj' | 'unit';

export interface Entry {
  kind: Kind;
  ar: string[];
  en: string;
  /** English plural when it is not en + "s". */
  enPl?: string;
  /** Arabic plural(s). */
  arPl?: string[];
  /** Arabic dual (2 of something), e.g. يومين. */
  arDual?: string;
  /** Feminine noun: its adjectives take the feminine form. */
  fem?: boolean;
  /** Feminine form of an adjective. */
  arFem?: string;
}

const n = (ar: string, en: string, o: Partial<Entry> & { syn?: string[] } = {}): Entry => ({ kind: 'n', ar: [ar, ...(o.syn ?? [])], en, ...o });
const u = (ar: string, en: string, arPl: string[], arDual: string, o: Partial<Entry> & { syn?: string[] } = {}): Entry => ({ kind: 'unit', ar: [ar, ...(o.syn ?? [])], en, arPl, arDual, ...o });
const a = (ar: string, arFem: string, en: string): Entry => ({ kind: 'adj', ar: [ar], arFem, en });

export const ENTRIES: Entry[] = [
  // symptoms
  n('ألم', 'pain', { arPl: ['آلام', 'أوجاع'], syn: ['وجع'] }),
  n('صداع', 'headache', { arPl: ['صداعات'] }),
  n('دوخة', 'dizziness', { fem: true, syn: ['دوار'] }),
  n('غثيان', 'nausea'),
  n('قيء', 'vomiting', { syn: ['استفراغ'] }),
  n('إسهال', 'diarrhea'),
  n('إمساك', 'constipation'),
  n('سعال', 'cough', { syn: ['كحة'] }),
  n('حمى', 'fever', { fem: true, syn: ['سخونة'] }),
  n('حرارة', 'temperature', { fem: true }),
  n('تعب', 'fatigue', { syn: ['إرهاق'] }),
  n('أرق', 'insomnia'),
  n('خفقان', 'palpitations'),
  n('حكة', 'itching', { fem: true }),
  n('تورم', 'swelling', { syn: ['انتفاخ'] }),
  n('نزيف', 'bleeding'),
  n('ضيق التنفس', 'shortness of breath'),
  n('ضغط الدم', 'blood pressure'),
  n('طفح جلدي', 'skin rash'),
  n('ضغط', 'pressure'),
  n('سكر', 'sugar'),
  n('سكري', 'diabetes'),
  n('ربو', 'asthma'),
  n('حساسية', 'allergy', { fem: true, arPl: ['حساسيات'], enPl: 'allergies' }),
  n('التهاب', 'inflammation', { arPl: ['التهابات'] }),
  n('عدوى', 'infection', { fem: true }),
  n('زكام', 'cold'),
  n('كسر', 'fracture'),
  n('جرح', 'wound'),
  n('حرق', 'burn'),
  n('عرض', 'symptom', { arPl: ['أعراض'] }),
  n('مرض', 'disease', { arPl: ['أمراض'] }),
  n('حالة', 'condition', { fem: true, arPl: ['حالات'] }),
  n('سبب', 'cause', { arPl: ['أسباب'] }),
  // body
  n('قلب', 'heart', { arPl: ['قلوب'] }),
  n('صدر', 'chest'),
  n('بطن', 'abdomen'),
  n('معدة', 'stomach', { fem: true }),
  n('ظهر', 'back'),
  n('رقبة', 'neck', { fem: true }),
  n('رأس', 'head'),
  n('حلق', 'throat'),
  n('أذن', 'ear', { fem: true, arPl: ['آذان'] }),
  n('عين', 'eye', { fem: true, arPl: ['عيون'] }),
  n('أنف', 'nose'),
  n('فم', 'mouth'),
  n('وجه', 'face'),
  n('سن', 'tooth', { fem: true, enPl: 'teeth', arPl: ['أسنان'] }),
  n('ركبة', 'knee', { fem: true }),
  n('كتف', 'shoulder'),
  n('يد', 'hand', { fem: true, arPl: ['أيدي'] }),
  n('ذراع', 'arm'),
  n('ساق', 'leg', { fem: true }),
  n('قدم', 'foot', { fem: true, enPl: 'feet', arPl: ['أقدام'] }),
  n('مفصل', 'joint', { arPl: ['مفاصل'] }),
  n('عضلة', 'muscle', { fem: true, arPl: ['عضلات'] }),
  n('جلد', 'skin'),
  n('كلية', 'kidney', { fem: true, arPl: ['كلى'] }),
  n('كبد', 'liver'),
  n('رئة', 'lung', { fem: true, arPl: ['رئتين'] }),
  n('دم', 'blood'),
  n('عظم', 'bone', { arPl: ['عظام'] }),
  // visits, tests and care
  n('زيارة', 'visit', { fem: true, arPl: ['زيارات'] }),
  n('متابعة', 'follow-up', { fem: true }),
  n('موعد', 'appointment', { arPl: ['مواعيد'] }),
  n('استشارة', 'consultation', { fem: true, arPl: ['استشارات'] }),
  n('فحص', 'examination', { arPl: ['فحوصات'] }),
  n('تحليل', 'lab test', { arPl: ['تحاليل'] }),
  n('نتيجة', 'result', { fem: true, arPl: ['نتائج'] }),
  n('أشعة', 'imaging', { fem: true }),
  n('تقرير', 'report', { arPl: ['تقارير'] }),
  n('وصفة', 'prescription', { fem: true, arPl: ['وصفات'] }),
  n('دواء', 'medication', { arPl: ['أدوية'] }),
  n('جرعة', 'dose', { fem: true, arPl: ['جرعات'] }),
  n('حبة', 'tablet', { fem: true, arPl: ['حبات', 'حبوب'] }),
  n('قرص', 'tablet', { arPl: ['أقراص'] }),
  n('علاج', 'treatment', { arPl: ['علاجات'] }),
  n('عملية جراحية', 'surgery', { fem: true }),
  n('عملية', 'procedure', { fem: true, arPl: ['عمليات'] }),
  n('طبيب', 'doctor', { arPl: ['أطباء'] }),
  n('مستشفى', 'hospital', { arPl: ['مستشفيات'] }),
  n('عيادة', 'clinic', { fem: true, arPl: ['عيادات'] }),
  n('طوارئ', 'emergency'),
  n('تطعيم', 'vaccination'),
  n('تشخيص', 'diagnosis'),
  n('شكوى', 'complaint', { fem: true }),
  n('ملاحظات', 'notes'),
  n('فحص دوري', 'routine checkup'),
  n('أكل', 'meal', { syn: ['وجبة'], arPl: ['وجبات'], enPl: 'meals' }),
  n('نوم', 'sleep'),
  n('استيقاظ', 'waking up'),
  n('صباح', 'morning'),
  n('مساء', 'evening'),
  // time and counting
  u('يوم', 'day', ['أيام'], 'يومين'),
  u('أسبوع', 'week', ['أسابيع'], 'أسبوعين'),
  u('شهر', 'month', ['أشهر', 'شهور'], 'شهرين'),
  u('سنة', 'year', ['سنوات', 'سنين'], 'سنتين', { syn: ['عام'] }),
  u('ساعة', 'hour', ['ساعات'], 'ساعتين'),
  u('دقيقة', 'minute', ['دقائق'], 'دقيقتين'),
  u('ليلة', 'night', ['ليالي'], 'ليلتين'),
  u('مرة', 'time', ['مرات'], 'مرتين'),
  u('ملغ', 'mg', [], 'ملغ', { syn: ['ملجم', 'ملغم'] }),
  u('مل', 'ml', [], 'مل'),
  u('جرام', 'g', [], 'جرام', { syn: ['جم', 'غرام'] }),
  // adjectives
  a('شديد', 'شديدة', 'severe'),
  a('خفيف', 'خفيفة', 'mild'),
  a('متوسط', 'متوسطة', 'moderate'),
  a('حاد', 'حادة', 'acute'),
  a('مزمن', 'مزمنة', 'chronic'),
  a('مستمر', 'مستمرة', 'persistent'),
  a('متقطع', 'متقطعة', 'intermittent'),
  a('مفاجئ', 'مفاجئة', 'sudden'),
  a('متكرر', 'متكررة', 'recurrent'),
  a('دوري', 'دورية', 'periodic'),
  a('جديد', 'جديدة', 'new'),
  a('قديم', 'قديمة', 'old'),
  a('عام', 'عامة', 'general'),
  a('جراحي', 'جراحية', 'surgical'),
  a('بسيط', 'بسيطة', 'slight'),
  a('قوي', 'قوية', 'strong'),
  a('ضعيف', 'ضعيفة', 'weak'),
  a('عالي', 'عالية', 'high'),
  a('منخفض', 'منخفضة', 'low'),
  a('طبيعي', 'طبيعية', 'normal'),
  a('ليلي', 'ليلية', 'night-time'),
];

/** Words that join or place a phrase. Arabic -> English and English -> Arabic. */
export const AR_FUNC: Record<string, string> = {
  في: 'in',
  من: 'from',
  منذ: 'since',
  لمدة: 'for',
  خلال: 'during',
  بعد: 'after',
  قبل: 'before',
  مع: 'with',
  بدون: 'without',
  عند: 'at',
  على: 'on',
  الى: 'to',
  او: 'or',
  و: 'and',
  ثم: 'then',
  بسبب: 'due to',
  يوميا: 'daily',
  اسبوعيا: 'weekly',
  شهريا: 'monthly',
  صباحا: 'in the morning',
  مساء: 'in the evening',
  ليلا: 'at night',
};

export const EN_FUNC: Record<string, string> = {
  in: 'في',
  from: 'من',
  since: 'منذ',
  for: 'لمدة',
  during: 'خلال',
  after: 'بعد',
  before: 'قبل',
  with: 'مع',
  without: 'بدون',
  at: 'عند',
  on: 'على',
  to: 'إلى',
  or: 'أو',
  and: 'و',
  then: 'ثم',
  daily: 'يوميا',
  weekly: 'أسبوعيا',
  monthly: 'شهريا',
};

/** Arabic number words, after normalisation (see engine.nz). */
export const AR_NUMBERS: Record<string, number> = {
  واحد: 1,
  واحده: 1,
  اثنان: 2,
  اثنين: 2,
  اثنتين: 2,
  ثلاثه: 3,
  ثلاث: 3,
  اربعه: 4,
  اربع: 4,
  خمسه: 5,
  خمس: 5,
  سته: 6,
  ست: 6,
  سبعه: 7,
  سبع: 7,
  ثمانيه: 8,
  ثماني: 8,
  تسعه: 9,
  تسع: 9,
  عشره: 10,
  عشر: 10,
};

export const EN_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
