import { describe, expect, it } from 'vitest';
import { glossaryTranslate } from '../src/app/translate/glossary/engine.js';

const en = (t: string) => glossaryTranslate(t, 'en');
const ar = (t: string) => glossaryTranslate(t, 'ar');

describe('glossary: Arabic to English', () => {
  it.each([
    ['زيارة متابعة القلب', 'Heart follow-up visit'],
    ['ألم في الصدر منذ يومين', 'Pain in the chest since 2 days ago'],
    ['ألم شديد في الصدر لمدة 3 أيام', 'Severe pain in the chest for 3 days'],
    ['صداع شديد', 'Severe headache'],
    ['صداع ودوخة', 'Headache and dizziness'],
    ['ضيق التنفس', 'Shortness of breath'],
    ['ألم الصدر', 'Chest pain'],
    ['مرتين يوميا', 'Twice daily'],
    ['حبة واحدة بعد الأكل', '1 tablet after the meal'],
    ['فحص دوري', 'Routine checkup'],
    ['ألم في الركبة، وتورم في القدم', 'Pain in the knee, and swelling in the foot'],
    ['ضغط الدم المرتفع', null],
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
