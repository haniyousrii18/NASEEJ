/**
 * Whole phrases the glossary translates exactly, in both directions: common medical phrases, medicine and test names,
 * and the names of the demo record's places and clinicians. Like the word list in lexicon.ts, every rendering here is
 * written and reviewed by a person; nothing is generated. A phrase matches the whole text (ignoring case, Arabic
 * diacritics and letter variants, and a closing full stop), never part of it.
 *
 * "#" stands for a number. It is kept exactly as written and must appear the same number of times on both sides.
 * The first pair for a phrase wins in each direction; `enOnly` / `arOnly` add a one-way spelling (an abbreviation or a
 * synonym) without changing what the other direction produces.
 */
export interface Phrase {
  ar: string;
  en: string;
  /** Only used from English to Arabic (an alias such as "Rx"). */
  enOnly?: boolean;
  /** Only used from Arabic to English. */
  arOnly?: boolean;
}

const p = (ar: string, en: string, o: Partial<Phrase> = {}): Phrase => ({ ar, en, ...o });

export const PHRASES: Phrase[] = [
  // conditions and diagnoses
  p('ارتفاع ضغط الدم', 'High blood pressure'),
  p('ارتفاع ضغط الدم الأساسي', 'Essential hypertension'),
  p('ارتفاع ضغط الدم', 'Hypertension', { enOnly: true }),
  p('صداع نصفي', 'Migraine'),
  p('صداع صباحي متكرر', 'Recurrent morning headache'),
  p('صداع في الجهة اليمنى', 'Headache on the right side'),
  p('صداع في الجهة اليمنى مع دوخة خفيفة', 'Headache on the right side with mild dizziness'),
  p('ألم أسفل الظهر', 'Lower back pain'),
  p('ضيق في التنفس عند صعود الدرج', 'Shortness of breath when climbing stairs'),
  p('طفح جلدي', 'Rash'),
  p('طفح جلدي شديد وضيق في التنفس', 'Severe rash and shortness of breath'),
  p('عطاس وسيلان في الأنف في الربيع', 'Sneezing and a runny nose in spring'),
  p('غبار الطلع', 'Pollen'),
  p('استئصال الزائدة الدودية', 'Appendectomy'),

  // medicines
  p('أملوديبين', 'Amlodipine'),
  p('ميتفورمين', 'Metformin'),
  p('باراسيتامول', 'Paracetamol'),
  p('بنسلين', 'Penicillin'),
  p('وصفة أملوديبين', 'Amlodipine prescription'),
  p('وصفة طبية', 'Prescription'),
  p('وصفة طبية', 'Rx', { enOnly: true }),
  p('مرتين يوميًا', 'Twice daily'),
  p('عند الحاجة، لا يزيد عن # مرات يوميًا', 'As needed, no more than # times a day'),
  p('بدأ أملوديبين وطُلبت تحاليل دم', 'Started amlodipine and blood tests were ordered'),

  // tests and measurements
  p('تحليل دم', 'Blood test'),
  p('صورة الدم', 'Complete blood count'),
  p('صورة الدم', 'Blood count', { enOnly: true }),
  p('الهيموغلوبين', 'Hemoglobin'),
  p('الكوليسترول الضار', 'LDL cholesterol'),
  p('الكوليسترول الضار # mg/dL', 'LDL cholesterol # mg/dL'),
  p('فيتامين د', 'Vitamin D'),
  p('فيتامين د # ng/mL', 'Vitamin D # ng/mL'),
  p('أشعة على الصدر', 'Chest scan'),
  p('قياس في المنزل صباحًا', 'Measured at home in the morning'),
  p('المرجع # - #', 'Reference # - #'),
  p('هل أحتاج إلى أشعة؟', 'Do I need a scan?'),

  // how a symptom behaves (what the patient wrote in the symptom form)
  p('ساعتان تقريبًا', 'About two hours'),
  p('دقائق قليلة', 'A few minutes'),
  p('ثلاثة أيام', 'Three days'),
  p('الراحة في غرفة هادئة', 'Resting in a quiet room'),
  p('قلة النوم والإجهاد', 'Lack of sleep and stress'),
  p('يظهر غالبًا بعد الظهر', 'Usually appears in the afternoon'),
  p('التوقف والراحة', 'Stopping and resting'),
  p('صعود أكثر من طابقين', 'Climbing more than two floors'),
  p('المشي الخفيف', 'Light walking'),
  p('الجلوس الطويل', 'Sitting for a long time'),
  p('أسوأ بعد الجلوس الطويل', 'Worse after sitting for a long time'),
  p('الراحة', 'Rest'),
  p('الضوء الساطع', 'Bright light'),
  p('أتابع مع طبيب القلب كل ثلاثة أشهر', 'I follow up with my cardiologist every three months'),
  p('موعد المتابعة بعد أسبوعين من بدء الدواء', 'Follow-up appointment two weeks after starting the medicine'),

  // the words a visit summary adds around an item (backend/src/services/health/context.ts)
  p('الشدة #', 'Severity #'),
  p('يخففه', 'Better'),
  p('يزيده', 'Worse'),
  p('التشخيص', 'Diagnosis'),
  p('الخطة', 'Plan'),
  p('حالي', 'Active'),
  p('سابق', 'Past'),
  p('خفيفة', 'Mild'),
  p('متوسطة', 'Moderate'),
  p('شديدة', 'Severe'),
  p('مرة واحدة', 'Once'),
  p('مستمر', 'Constant'),
  p('يأتي ويذهب', 'Intermittent'),
  p('يوميًا', 'Daily'),
  p('أسبوعيًا', 'Weekly'),
  p('أحيانًا', 'Occasional'),
  p('غير مُشارَك', 'Not shared'),
  p('تقرير مختبر', 'Lab report'),
  p('تقرير أشعة', 'Imaging report'),
  p('ملخص خروج', 'Discharge summary'),
  p('ملاحظة طبية', 'Clinical note'),
  p('تحويل', 'Referral'),
  p('سجل تطعيم', 'Vaccination record'),
  p('مستند إداري', 'Administrative document'),
  p('عام', 'General'),

  // places and clinicians in the demo record (names are rendered, not translated word by word)
  p('مركز النور', 'Al-Noor Center'),
  p('مركز النور الطبي التخصصي', 'Al-Noor Specialized Medical Center'),
  p('مختبر النور', 'Al-Noor Laboratory'),
  p('مركز الأشعة الحديث', 'Modern Radiology Center'),
  p('مختبر المدينة', 'City Lab'),
  p('عيادة خاصة', 'Private clinic'),
  p('د. فيصل الشمري', 'Dr. Faisal Al-Shammari'),
  p('د. فيصل الشمري — مركز النور', 'Dr. Faisal Al-Shammari — Al-Noor Center'),
  p('زيارة د. فيصل', "Dr. Faisal's visit"),
  p('د. سعد', 'Dr Saad'),
  p('محمد المنصور', 'Mohammed Al-Mansoor'),
];
