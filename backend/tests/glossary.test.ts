import { describe, expect, it } from 'vitest';
import { glossaryTranslate } from '../src/services/translation/glossary/engine.js';

const en = (t: string) => glossaryTranslate(t, 'en');
const ar = (t: string) => glossaryTranslate(t, 'ar');

describe('glossary: Arabic to English', () => {
  it.each([
    ['زيارة متابعة القلب', 'Heart follow-up visit'],
    ['ألم في الصدر منذ يومين', 'Pain in the chest for 2 days'],
    ['سعال جاف منذ أسبوعين', 'Dry cough for 2 weeks'],
    ['حساسية من البنسلين', 'Allergy to penicillin'],
    ['حساسية من الفول السوداني', 'Peanut allergy'],
    ['ألم شديد في الصدر لمدة 3 أيام', 'Severe pain in the chest for 3 days'],
    ['صداع شديد', 'Severe headache'],
    ['صداع ودوخة', 'Headache and dizziness'],
    ['ضيق التنفس', 'Shortness of breath'],
    ['ألم الصدر', 'Chest pain'],
    ['مرتين يوميا', 'Twice daily'],
    ['حبة واحدة بعد الأكل', '1 tablet after meals'],
    ['فحص دوري', 'Routine checkup'],
    ['ألم في الركبة، وتورم في القدم', 'Pain in the knee, and swelling in the foot'],
    ['ضغط الدم المرتفع', 'Elevated blood pressure'],
    ['طبيب القلب', 'Cardiologist'],
    ['أرق منذ شهر', 'Insomnia for a month'],
    ['الربو', 'Asthma'],
    ['تعب عام', 'General fatigue'],
    ['صداع شديد في الجهة اليسرى', 'Severe headache on the left side'],
    ['طبيب القلب الصدر', null],
  ])('%s', (input, expected) => {
    expect(en(input)).toBe(expected);
  });

  it('never guesses: an unknown word makes the whole text untranslated', () => {
    expect(en('ألم في الصدر وبنادول')).toBeNull();
    expect(en('أشعر بألم')).toBeNull();
  });
  it('keeps numbers and Latin words as written', () => {
    expect(en('ألم 7/10 لمدة 3 أيام')).toBe('Pain 7/10 for 3 days');
    expect(en('ألم في الصدر لمدة ٣ أيام')).toBe('Pain in the chest for 3 days');
  });
});

describe('glossary: English to Arabic', () => {
  it.each([
    ['Heart follow-up visit', 'زيارة متابعة القلب'],
    ['Chest pain', 'ألم الصدر'],
    ['Severe headache', 'صداع شديد'],
    ['Pain in the chest since 3 days ago', 'ألم في الصدر منذ 3 أيام'],
    ['Chest pain for 2 days', 'ألم الصدر لمدة يومين'],
    ['Headache and dizziness', 'صداع ودوخة'],
    ['Severe pain in the knee', 'ألم شديد في الركبة'],
    ['Fever twice daily', 'حمى مرتين يوميا'],
    ['Follow-up visit for the heart', 'زيارة المتابعة للقلب'],
  ])('%s', (input, expected) => {
    expect(ar(input)).toBe(expected);
  });
  it('refuses unknown words and unsupported shapes', () => {
    expect(ar('Panadol after meals')).toBeNull();
    expect(ar('Headache nausea pain visit heart')).toBeNull();
  });
});

describe('glossary: round trips keep the meaning', () => {
  it.each(['Severe pain in the chest for 3 days', 'Heart follow-up visit', 'Headache and dizziness'])('%s', (input) => {
    const back = en(ar(input)!);
    expect(back?.toLowerCase()).toBe(input.toLowerCase());
  });
});

describe('glossary: passthrough alone is not a translation', () => {
  it('returns null when no glossary word was translated', () => {
    expect(en('x')).toBeNull();
    expect(en('في')).toBeNull();
    expect(en('Panadol')).toBeNull();
    expect(ar('a')).toBeNull();
    expect(ar('in')).toBeNull();
    expect(ar('')).toBeNull();
  });
});

describe('whole-phrase glossary', () => {
  it('translates listed phrases exactly, both ways', () => {
    expect(glossaryTranslate('صورة الدم', 'en')).toBe('Complete blood count');
    expect(glossaryTranslate('ارتفاع ضغط الدم', 'en')).toBe('High blood pressure');
    expect(glossaryTranslate('Penicillin', 'ar')).toBe('بنسلين');
    expect(glossaryTranslate('Rx', 'ar')).toBe('وصفة طبية');
  });

  it('carries numbers over as written and keeps a closing full stop', () => {
    expect(glossaryTranslate('عند الحاجة، لا يزيد عن 3 مرات يوميًا', 'en')).toBe('As needed, no more than 3 times a day');
    expect(glossaryTranslate('LDL cholesterol 162 mg/dL', 'ar')).toBe('الكوليسترول الضار 162 mg/dL');
    expect(glossaryTranslate('قياس في المنزل صباحًا.', 'en')).toBe('Measured at home in the morning.');
  });

  it('matches the whole text only, never a part of it', () => {
    expect(glossaryTranslate('Penicillin allergy since childhood', 'ar')).not.toBe('بنسلين');
  });
});

describe('vocabulary check for machine translation', () => {
  it('accepts a sentence whose every concept is rendered with the reviewed vocabulary', async () => {
    const { termsVerified } = await import('../src/services/translation/verify.js');
    expect(termsVerified('أشعر بدوار وغثيان', 'I feel dizzy and nauseous', 'ar', 'en')).toBe(true);
    expect(termsVerified('Do I need to change the dose?', 'هل أحتاج لتغيير الجرعة؟', 'en', 'ar')).toBe(true);
  });
  it('rejects a wrong medical word, an added concept, a lost negation, a changed term or a third person', async () => {
    const { termsVerified } = await import('../src/services/translation/verify.js');
    expect(termsVerified('تخطيط القلب', 'Heart planning', 'ar', 'en')).toBe(false);
    expect(termsVerified('نسيت الجرعة أمس', 'I forgot the potion yesterday', 'ar', 'en')).toBe(false);
    expect(termsVerified('لا يوجد ألم', 'There is pain', 'ar', 'en')).toBe(false);
    expect(termsVerified('HbA1c test', 'اختبار HbAA1c', 'en', 'ar')).toBe(false);
    expect(termsVerified('نسيت الجرعة أمس', 'She forgot the dose yesterday', 'ar', 'en')).toBe(false);
  });
});

describe('coverage on everyday patient notes', () => {
  it('translates at least 90% of the reference set with the reviewed glossary alone, both ways', async () => {
    const fs = await import('fs');
    const corpus = JSON.parse(fs.readFileSync(new URL('./fixtures/translation-corpus.json', import.meta.url), 'utf8')) as { ar: string[]; en: string[] };
    const arOk = corpus.ar.filter((t) => en(t) !== null).length;
    const enOk = corpus.en.filter((t) => ar(t) !== null).length;
    expect(arOk / corpus.ar.length).toBeGreaterThanOrEqual(0.9);
    expect(enOk / corpus.en.length).toBeGreaterThanOrEqual(0.9);
  });
});
