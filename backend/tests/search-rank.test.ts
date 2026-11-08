import { describe, expect, it } from 'vitest';
import { editDistance, maxEdits, normalizeSearch, normalizeWithMap, cleanQuery } from '../src/services/search/normalize.js';
import { rankRecords, type Field, type Searchable } from '../src/services/search/rank.js';

/** Pure tests: no database. They cover normalization, the ranking tiers and the typo limits. */

const f = (key: string, weight: number, ...texts: string[]): Field => ({ key, weight, variants: texts.map((text) => ({ text, via: 'original' as const })) });
const rec = (ref: string, title: string, notes = '', date: string | null = null, extra: Field[] = []): Searchable => ({ ref, date, fields: [f('title', 3, title), f('notes', 1, notes), ...extra] });
const order = (records: Searchable[], q: string) => rankRecords(records, q).map((r) => r.rec.ref);

describe('normalizeSearch', () => {
  it('folds Arabic diacritics, tatweel and letter variants but not distinct letters', () => {
    expect(normalizeSearch('أَمْلُودِيبِين')).toBe(normalizeSearch('املوديبين'));
    expect(normalizeSearch('إبرة')).toBe(normalizeSearch('ابره')); // alef form and ta marbuta
    expect(normalizeSearch('مستشفى')).toBe(normalizeSearch('مستشفي')); // alef maqsura
    expect(normalizeSearch('بـنـسـلـين')).toBe(normalizeSearch('بنسلين')); // tatweel
    expect(normalizeSearch('صداع')).not.toBe(normalizeSearch('سداع')); // ص and س stay different
    expect(normalizeSearch('حساسية')).not.toBe(normalizeSearch('خساسية')); // ح and خ stay different
  });

  it('lower-cases Latin, drops accents and treats punctuation as a space', () => {
    expect(normalizeSearch('  Penicillin-V,  500mg! ')).toBe('penicillin v 500mg');
    expect(normalizeSearch('Café')).toBe('cafe');
  });

  it('reads Arabic-Indic and Persian digits as digits', () => {
    expect(normalizeSearch('٥٠٠ مجم')).toBe('500 مجم');
    expect(normalizeSearch('۱۲۰/۸۰')).toBe('120 80');
  });

  it('keeps a map back to the original text so highlights land on the right characters', () => {
    const n = normalizeWithMap('أَمْلُودِيبِين 5mg');
    const at = n.text.indexOf('5mg');
    expect('أَمْلُودِيبِين 5mg'.slice(n.map[at])).toBe('5mg');
  });

  it('bounds and cleans a raw query', () => {
    expect(cleanQuery('a\u0000b\n c')).toBe('a b c');
    expect(cleanQuery('x'.repeat(500), 100)).toHaveLength(100);
    expect(cleanQuery(42 as unknown)).toBe('');
  });
});

describe('editDistance', () => {
  it('counts insert, delete, substitute and transposition as one edit each', () => {
    expect(editDistance('penicillin', 'penicilin', 2)).toBe(1);
    expect(editDistance('penicillin', 'penicilllin', 2)).toBe(1);
    expect(editDistance('penicillin', 'pencillin', 2)).toBe(1);
    expect(editDistance('penicillin', 'penicilnli', 2)).toBeGreaterThan(1);
    expect(editDistance('aspirin', 'asprin', 1)).toBe(1);
    expect(editDistance('insulin', 'insuiln', 1)).toBe(1); // transposition
    expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3); // beyond max: max + 1
  });

  it('never allows edits on short words', () => {
    expect(maxEdits(2)).toBe(0);
    expect(maxEdits(3)).toBe(0);
    expect(maxEdits(5)).toBe(1);
    expect(maxEdits(10)).toBe(2);
  });
});

describe('ranking', () => {
  it('orders exact field, then prefix, then token, then part-word, then typo', () => {
    const records = [
      rec('typo', 'Penicilin allergy'), // one letter missing
      rec('part', 'Amoxicillin'), // "cillin" inside a longer word is NOT matched for a longer query; here query is "illin"
      rec('token', 'Severe reaction to penicillin'),
      rec('prefix', 'Penicillin V tablets'),
      rec('exact', 'Penicillin'),
    ];
    expect(order(records, 'penicillin').slice(0, 3)).toEqual(['exact', 'prefix', 'token']);
    expect(order(records, 'penicillin')).toContain('typo');
    expect(order(records, 'penicillin').indexOf('typo')).toBeGreaterThan(order(records, 'penicillin').indexOf('token'));
    expect(order(records, 'illin')).toEqual(expect.arrayContaining(['part']));
  });

  it('puts a title match above the same match in long notes', () => {
    const records = [rec('notes', 'Checkup', 'patient reports migraine twice a week'), rec('title', 'Migraine')];
    expect(order(records, 'migraine')).toEqual(['title', 'notes']);
  });

  it('keeps fuzzy matches behind exact ones even when the fuzzy one is in the title', () => {
    const records = [rec('fuzzy', 'Insulinn pump'), rec('exact', 'Checkup', 'insulin dose changed')];
    expect(order(records, 'insulin')[0]).toBe('exact');
  });

  it('matches Arabic written with different spellings of the same word', () => {
    const records = [rec('a', 'أملوديبين'), rec('b', 'باراسيتامول')];
    expect(order(records, 'املوديبين')).toEqual(['a']);
    expect(order(records, 'أَملوديبين')).toEqual(['a']);
    expect(order(records, 'اموديبين')).toEqual(['a']); // one letter dropped
  });

  it('finds the other language through a stored translation, and reports how it matched', () => {
    const r: Searchable = {
      ref: 'x',
      date: null,
      fields: [{ key: 'title', weight: 3, variants: [{ text: 'بنسلين', via: 'original' }, { text: 'Penicillin', via: 'translation' }] }],
    };
    const hit = rankRecords([r], 'penicillin')[0];
    expect(hit.rec.ref).toBe('x');
    expect(hit.match.via).toBe('translation');
    expect(rankRecords([r], 'بنسلين')[0].match.via).toBe('original');
    expect(rankRecords([{ ref: 'y', date: null, fields: [f('title', 3, 'بنسلين')] }], 'penicillin')).toEqual([]); // no alias, no guess
  });

  it('does not use typo tolerance on very short words', () => {
    const records = [rec('a', 'Cold'), rec('b', 'Cough')];
    expect(order(records, 'cod')).toEqual([]); // 3 letters: exact/prefix/part only
    expect(order(records, 'co').sort()).toEqual(['a', 'b']); // prefix still works
    expect(order([rec('c', 'BP')], 'bq')).toEqual([]);
  });

  it('requires every word of the query, across fields', () => {
    const records = [rec('both', 'Amlodipine', 'taken once daily'), rec('one', 'Amlodipine', 'taken at night')];
    expect(order(records, 'amlodipine daily')).toEqual(['both']);
    expect(order(records, 'amlodipine zebra')).toEqual([]);
  });

  it('uses recency only to break a tie, one result per record', () => {
    const records = [rec('old', 'Migraine', '', '2020-01-01'), rec('new', 'Migraine', '', '2025-06-01'), rec('dup', 'Migraine', 'migraine migraine', '2019-01-01')];
    const out = order(records, 'migraine');
    expect(out).toHaveLength(3);
    expect(out.slice(0, 2)).toEqual(['new', 'old']);
    expect(new Set(out).size).toBe(out.length);
  });

  it('returns nothing for an empty or punctuation-only query', () => {
    expect(order([rec('a', 'x')], '   ')).toEqual([]);
    expect(order([rec('a', 'x')], '--')).toEqual([]);
  });
});
