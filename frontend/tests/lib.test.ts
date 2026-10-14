import { describe, expect, it } from 'vitest';
import { labRows, pendingItems } from '../src/lib/selectors.js';
import { fmt } from '../src/lib/format.js';
import type { LabOrder, PatientData } from '../src/lib/types.js';
import { translations } from '../src/i18n/translations.js';

const lab = (id: string, date: string, value: string, abnormal: boolean, status: 'draft' | 'approved' = 'approved'): LabOrder => ({
  id: `o${id}`, test_name_ar: 'سكر', test_name_en: 'Glucose', status: 'completed', created_at: date, updated_at: date,
  results: [{ id: `r${id}`, parameter_name: 'HbA1c', value, unit: '%', reference_range: '4-5.6', is_abnormal: abnormal, status }],
});

const data: PatientData = {
  patient: { id: 'p1', mrn: 'M1', full_name_ar: 'مريض', full_name_en: 'Patient', allergies: [] },
  visits: [
    { id: 'v1', visit_date: '2026-01-01T00:00:00Z', chief_complaint: 'x', diagnosis: 'Hypertension', status: 'approved', approved_at: '2026-01-01T01:00:00Z' },
    { id: 'v2', visit_date: '2026-02-01T00:00:00Z', chief_complaint: 'y', diagnosis: 'Diabetes', status: 'draft' },
  ],
  prescriptions: [
    { id: 'rx1', visit_id: 'v2', status: 'draft', created_at: '2026-02-02T00:00:00Z', items: [{ id: 'i1', medication_name: 'Metformin 500 mg', dosage: '500 mg', frequency: 'daily', duration: '30d' }] },
    { id: 'rx2', visit_id: 'v1', status: 'approved', created_at: '2026-01-02T00:00:00Z', items: [] },
  ],
  labOrders: [lab('1', '2026-01-10T00:00:00Z', '6.0', true), lab('2', '2026-03-10T00:00:00Z', '7.2', true, 'draft')],
};

describe('labRows', () => {
  it('computes the arithmetic difference to the previous result of the same parameter', () => {
    const [newest, oldest] = labRows(data.labOrders);
    expect(newest.delta).toBe(1.2);
    expect(newest.trend).toBe('up');
    expect(oldest.previous).toBeUndefined();
    expect(oldest.delta).toBeUndefined();
  });
  it('shows no difference when values are not numeric', () => {
    const rows = labRows([lab('1', '2026-01-01T00:00:00Z', 'positive', false), lab('2', '2026-02-01T00:00:00Z', 'negative', false)]);
    expect(rows[0].delta).toBeUndefined();
    expect(rows[0].previous?.value).toBe('positive');
  });
  it('keeps the is_abnormal flag exactly as recorded', () => {
    expect(labRows(data.labOrders).map((r) => r.is_abnormal)).toEqual([true, true]);
  });
});

describe('pendingItems', () => {
  it('lists only drafts (visits, prescriptions, lab results), newest first', () => {
    const items = pendingItems(data);
    expect(items.map((i) => i.kind)).toEqual(['lab', 'rx', 'visit']);
    expect(items.every((i) => !!i.label)).toBe(true);
  });
  it('is empty when nothing is a draft', () => {
    const approvedOnly: PatientData = { ...data, visits: [data.visits[0]], prescriptions: [data.prescriptions[1]], labOrders: [lab('1', '2026-01-10T00:00:00Z', '6.0', false)] };
    expect(pendingItems(approvedOnly)).toEqual([]);
  });
});

describe('fmt', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fmt('{n} items for {x}', { n: 3 })).toBe('3 items for {x}');
  });
});

describe('i18n parity', () => {
  const keys = (o: unknown, prefix = ''): string[] =>
    o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix + k + '.'))
      : [prefix];
  it('has identical ar and en key sets', () => {
    expect(keys(translations.en).sort()).toEqual(keys(translations.ar).sort());
  });
  it('has no empty doctor strings', () => {
    const flat = (o: unknown): string[] => (o && typeof o === 'object' ? Object.values(o as object).flatMap(flat) : [String(o)]);
    for (const lang of ['ar', 'en'] as const) expect(flat(translations[lang].doctor).filter((s) => !s.trim())).toEqual([]);
  });
});
