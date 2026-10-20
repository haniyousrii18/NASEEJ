import { describe, expect, it } from 'vitest';
import { isMedicalAdviceRequest, isUrgentText, looksUnsafeOutput, normalizeText } from '../src/services/health/safety.js';
import { parseEntry, parseOnset, parseSymptom } from '../src/services/health/input.js';
import { generateToken, hashToken, isTokenShape, parseLifetimeHours } from '../src/services/health/shareToken.js';
import { SlidingWindow } from '../src/services/rateLimit.js';
import { parsePrepContent } from '../src/services/health/prep.js';
import { preCheck, shapeReply, validateMessages } from '../src/services/health/assistantService.js';
import { searchItems, toPromptContext, type RecordItem } from '../src/services/health/context.js';
import { toGeminiSchema } from '../src/services/ai/chat.js';

// These tests need no database and no network.

describe('safety rules', () => {
  it('detects urgent wording in English and Arabic', () => {
    expect(isUrgentText('I have chest pain and cannot breathe')).toBe(true);
    expect(isUrgentText('عندي ألم في الصدر وضيق في التنفس')).toBe(true);
    expect(isUrgentText('أفكر في الانتحار')).toBe(true);
    expect(isUrgentText('I had a mild headache yesterday')).toBe(false);
    expect(isUrgentText('صداع خفيف منذ يومين')).toBe(false);
  });

  it('catches requests for diagnosis or medicine changes, but not record lookups', () => {
    expect(isMedicalAdviceRequest('Should I stop taking my pills?')).toBe(true);
    expect(isMedicalAdviceRequest('What is wrong with me?')).toBe(true);
    expect(isMedicalAdviceRequest('هل أوقف الدواء؟')).toBe(true);
    expect(isMedicalAdviceRequest('هل عندي سكري؟')).toBe(true);
    expect(isMedicalAdviceRequest('What medications have I recorded?')).toBe(false);
    expect(isMedicalAdviceRequest('متى كان آخر تحليل دم؟')).toBe(false);
    // "شخص" alone means "person", not "diagnose".
    expect(isMedicalAdviceRequest('رافقني شخص إلى الطبيب')).toBe(false);
  });

  it('rejects model output that advises or diagnoses', () => {
    expect(looksUnsafeOutput('You should stop taking the tablets.')).toBe(true);
    expect(looksUnsafeOutput('You probably have an infection.')).toBe(true);
    expect(looksUnsafeOutput('يجب عليك أن توقف الدواء')).toBe(true);
    expect(looksUnsafeOutput('Your last blood test in your record is dated 2026-03-02.')).toBe(false);
  });

  it('normalizes Arabic letter variants', () => {
    expect(normalizeText('أَلَم')).toBe(normalizeText('الم'));
  });
});

describe('assistant pre-check and reply shaping', () => {
  it('answers urgent messages with the fixed text and never reaches a model', () => {
    const r = preCheck([{ role: 'user', content: 'I fainted and have chest pain' }], 'en');
    expect(r?.kind).toBe('urgent');
  });

  it('answers a medicine-change request with the fixed refusal', () => {
    const r = preCheck([{ role: 'user', content: 'Can I stop my medication?' }], 'en');
    expect(r?.kind).toBe('refused');
  });

  it('lets an ordinary question through to the model', () => {
    expect(preCheck([{ role: 'user', content: 'When was my last blood test?' }], 'en')).toBeNull();
  });

  const item: RecordItem = { ref: 'entry:1', type: 'medication', title: 'Metformin', summary: '500 mg', date: '2026-01-01', origin: 'patient' };
  const aliases = new Map([['R1', item]]);

  it('keeps only citations that were in the record list', () => {
    const r = shapeReply({ intent: 'answer', message: 'You recorded Metformin.', citations: ['R1', 'R99', 'made-up'] }, aliases, 'en');
    expect(r.kind).toBe('reply');
    if (r.kind === 'reply') expect(r.citations.map((c) => c.ref)).toEqual(['entry:1']);
  });

  it('turns an answer without a valid citation into "not found"', () => {
    const r = shapeReply({ intent: 'answer', message: 'Your cholesterol is 190.', citations: ['R42'] }, aliases, 'en');
    expect(r.kind === 'reply' && r.intent).toBe('not_found');
    expect(r.kind === 'reply' && r.message).not.toContain('190');
  });

  it('replaces unsafe replies with the refusal', () => {
    expect(shapeReply({ intent: 'answer', message: 'You should increase your dose.', citations: ['R1'] }, aliases, 'en').kind).toBe('refused');
  });

  it('drops invalid symptom fields and unknown navigation targets', () => {
    const r = shapeReply(
      { intent: 'capture_symptom', message: 'OK', next_question: 'How bad is it?', symptom: { description: 'Headache', severity: 42, frequency: 'daily', onset_date: '2999-01-01' } },
      aliases,
      'en'
    );
    expect(r.kind).toBe('reply');
    if (r.kind === 'reply') {
      expect(r.symptomDraft).toEqual({ symptom_description: 'Headache', frequency: 'daily' });
      expect(r.nextQuestion).toBe('How bad is it?');
    }
    const nav = shapeReply({ intent: 'navigate', message: 'Opening', navigate_to: '../../admin' }, aliases, 'en');
    expect(nav.kind === 'reply' && nav.navigateTo).toBeNull();
  });

  it('validates the conversation shape', () => {
    expect(validateMessages([{ role: 'user', content: 'hi' }])).not.toBeNull();
    expect(validateMessages([{ role: 'assistant', content: 'hi' }])).toBeNull();
    expect(validateMessages([])).toBeNull();
    expect(validateMessages([{ role: 'system', content: 'x' }])).toBeNull();
    expect(validateMessages([{ role: 'user', content: 'x'.repeat(2001) }])).toBeNull();
  });
});

describe('record input validation', () => {
  it('requires the fields each kind needs', () => {
    expect(parseEntry({ kind: 'medication', title: 'Metformin', dose: '500 mg' }, { partial: false }).ok).toBe(true);
    expect(parseEntry({ kind: 'medication' }, { partial: false }).ok).toBe(false);
    expect(parseEntry({ kind: 'measurement', title: 'Weight', value: '70' }, { partial: false }).ok).toBe(false);
    expect(parseEntry({ kind: 'visit', title: 'Clinic', event_date: '2020-01-01' }, { partial: false }).ok).toBe(true);
    expect(parseEntry({ kind: 'bogus', title: 'x' }, { partial: false }).ok).toBe(false);
  });

  it('ignores fields that do not belong to a kind and rejects bad dates', () => {
    const r = parseEntry({ kind: 'condition', title: 'Asthma', dose: '5 mg', start_date: '2020-01-01' }, { partial: false });
    expect(r.ok && 'dose' in r.value).toBe(false);
    expect(parseEntry({ kind: 'condition', title: 'Asthma', start_date: '2020-13-01' }, { partial: false }).ok).toBe(false);
    expect(parseEntry({ kind: 'condition', title: 'Asthma', start_date: '2020-05-01', end_date: '2020-01-01' }, { partial: false }).ok).toBe(false);
  });

  it('validates symptoms', () => {
    expect(parseSymptom({ symptom_description: 'Cough', severity: 4 }, { partial: false }).ok).toBe(true);
    expect(parseSymptom({ symptom_description: 'Cough', severity: 0 }, { partial: false }).ok).toBe(false);
    expect(parseSymptom({ symptom_description: '', severity: 4 }, { partial: false }).ok).toBe(false);
    expect(parseSymptom({ symptom_description: 'Cough', severity: 4, frequency: 'hourly' }, { partial: false }).ok).toBe(false);
    expect(parseSymptom({ severity: 7 }, { partial: true }).ok).toBe(true);
    expect(parseOnset('2999-01-01')).toBeNull();
    expect(parseOnset('2020-02-30')).toBeNull();
    expect(parseOnset('2020-02-10')).toBe('2020-02-10T00:00:00.000Z');
  });
});

describe('share tokens', () => {
  it('are 256-bit, URL-safe, unique and stored only as a hash', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(isTokenShape(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
    expect(isTokenShape('short')).toBe(false);
    expect(isTokenShape("'; DROP TABLE x; --" + 'a'.repeat(30))).toBe(false);
  });

  it('limits the lifetime', () => {
    expect(parseLifetimeHours(24, 168)).toBe(24);
    expect(parseLifetimeHours(0, 168)).toBeNull();
    expect(parseLifetimeHours(169, 168)).toBeNull();
    expect(parseLifetimeHours('24', 168)).toBeNull();
  });
});

describe('rate limiting', () => {
  it('blocks after the limit and recovers when the window passes', () => {
    const w = new SlidingWindow(1000, 3);
    expect(w.hit('k', 0).allowed).toBe(true);
    expect(w.hit('k', 1).allowed).toBe(true);
    expect(w.hit('k', 2).allowed).toBe(true);
    const blocked = w.hit('k', 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(w.hit('other', 3).allowed).toBe(true);
    expect(w.hit('k', 1500).allowed).toBe(true);
  });
});

describe('visit summary content', () => {
  const item = { id: '11111111-1111-1111-1111-111111111111', text: 'Headache', date: '2026-01-01', source: { kind: 'symptom', ref: '22222222-2222-2222-2222-222222222222', label: 'Entered by me' } };
  it('accepts a well-formed draft', () => {
    const r = parsePrepContent({ lang: 'en', reason: 'Headaches', overview: '', sections: [{ key: 'symptoms', included: true, items: [item] }] });
    expect(r.ok).toBe(true);
  });
  it('rejects forged or malformed sources and repeated sections', () => {
    expect(parsePrepContent({ lang: 'en', reason: '', overview: '', sections: [{ key: 'symptoms', included: true, items: [{ ...item, source: { kind: 'symptom', ref: 'not-a-uuid', label: '' } }] }] }).ok).toBe(false);
    expect(parsePrepContent({ lang: 'en', reason: '', overview: '', sections: [{ key: 'symptoms', included: true, items: [{ ...item, source: { kind: 'patient', ref: '22222222-2222-2222-2222-222222222222', label: '' } }] }] }).ok).toBe(false);
    expect(parsePrepContent({ lang: 'en', reason: '', overview: '', sections: [{ key: 'symptoms', included: true, items: [] }, { key: 'symptoms', included: true, items: [] }] }).ok).toBe(false);
    expect(parsePrepContent({ lang: 'en', reason: 'x'.repeat(501), overview: '', sections: [] }).ok).toBe(false);
  });
});

describe('record search and prompt context', () => {
  const items: RecordItem[] = [
    { ref: 'entry:1', type: 'medication', title: 'Metformin', summary: '500 mg twice daily', date: '2026-01-01', origin: 'patient' },
    { ref: 'fact:2', type: 'doc_fact', title: 'Hemoglobin', summary: '13.2 g/dL', date: null, origin: 'ai_suggestion' },
  ];
  it('finds items by words in any order', () => {
    expect(searchItems(items, 'twice metformin').map((i) => i.ref)).toEqual(['entry:1']);
    expect(searchItems(items, 'nothing')).toEqual([]);
  });
  it('gives the model aliases, never record ids, and labels unconfirmed readings', () => {
    const { text, aliasToItem } = toPromptContext(items);
    expect(text).not.toContain('entry:1');
    expect(text).toContain('R1 |');
    expect(text).toContain('UNCONFIRMED');
    expect(aliasToItem.get('R2')?.ref).toBe('fact:2');
  });
});

describe('provider schema conversion', () => {
  it('upper-cases JSON-schema types for Gemini', () => {
    const g = toGeminiSchema({ type: 'object', properties: { a: { type: 'array', items: { type: 'string', enum: ['x'] } } }, required: ['a'] });
    expect(g.type).toBe('OBJECT');
    expect(g.properties.a.items.type).toBe('STRING');
    expect(g.required).toEqual(['a']);
  });
});
