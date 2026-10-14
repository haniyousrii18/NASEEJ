import { describe, expect, it } from 'vitest';
import { aiSummary, checkInteractions, parseVisit } from '../src/lib/ai.js';
import { abnormalLabs, labRows, unseenChanges } from '../src/lib/selectors.js';
import type { LabOrder, PatientData } from '../src/lib/types.js';

const lab = (id: string, date: string, value: string, abnormal: boolean): LabOrder => ({
  id: `o${id}`, test_name_ar: 'سكر', test_name_en: 'Glucose', status: 'completed', created_at: date, updated_at: date,
  results: [{ id: `r${id}`, parameter_name: 'HbA1c', value, unit: '%', reference_range: '4-5.6', is_abnormal: abnormal, status: 'approved' }],
});

const data: PatientData = {
  patient: {
    id: 'p1', mrn: 'M1', full_name_ar: 'مريض', full_name_en: 'Patient',
    allergies: [{ id: 'a1', allergen_ar: 'بنسلين', allergen_en: 'Penicillin', severity: 'severe' }],
  },
  visits: [
    { id: 'v1', visit_date: '2026-01-01T00:00:00Z', chief_complaint: 'x', diagnosis: 'Hypertension', status: 'approved', approved_at: '2026-01-01T01:00:00Z' },
    { id: 'v2', visit_date: '2026-02-01T00:00:00Z', chief_complaint: 'y', diagnosis: 'Diabetes', status: 'draft' },
  ],
  prescriptions: [
    { id: 'rx1', visit_id: 'v1', status: 'approved', created_at: '2026-01-02T00:00:00Z', items: [
      { id: 'i1', medication_name: 'Warfarin 5 mg', dosage: '5 mg', frequency: 'daily', duration: '30d' },
      { id: 'i2', medication_name: 'Aspirin 75 mg', dosage: '75 mg', frequency: 'daily', duration: '30d' },
    ] },
  ],
  labOrders: [lab('1', '2026-01-10T00:00:00Z', '6.0', true), lab('2', '2026-03-10T00:00:00Z', '7.2', true)],
};

describe('checkInteractions', () => {
  it('flags a drug-drug pair as high', () => {
    const r = checkInteractions(['Warfarin 5 mg', 'aspirin']);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'drug-drug', severity: 'high' });
  });
  it('flags a recorded allergy against a matching drug, including Arabic-only allergen names', () => {
    const r = checkInteractions(['Amoxicillin 500 mg'], [{ allergen_ar: 'بنسلين', allergen_en: '', severity: 'severe' }]);
    expect(r[0]).toMatchObject({ kind: 'drug-allergy', severity: 'high' });
  });
  it('returns nothing for unrelated medicines', () => {
    expect(checkInteractions(['Paracetamol', 'Omeprazole'])).toEqual([]);
  });
});

describe('selectors', () => {
  it('computes delta and trend against the previous result of the same parameter', () => {
    const [newest, oldest] = labRows(data.labOrders);
    expect(newest.delta).toBe(1.2);
    expect(newest.trend).toBe('up');
    expect(oldest.previous).toBeUndefined();
  });
  it('lists abnormal labs only', () => {
    expect(abnormalLabs(data.labOrders)).toHaveLength(2);
  });
  it('counts everything as unseen with no timestamp, and only newer items after one', () => {
    expect(unseenChanges(data, null).length).toBeGreaterThan(0);
    const after = unseenChanges(data, '2026-03-01T00:00:00Z');
    expect(after.map((c) => c.kind)).toEqual(['lab']);
  });
});

describe('aiSummary', () => {
  it('ranks high-severity items first and returns at most three problems', () => {
    const s = aiSummary(data);
    expect(s.problems).toHaveLength(3);
    expect(s.problems[0].severity).toBe('high');
    expect(s.highInteractions).toHaveLength(1);
  });
});

describe('parseVisit', () => {
  it('returns nothing for empty input', () => {
    expect(parseVisit('   ')).toEqual([]);
  });
  it('extracts complaint, diagnosis, medicine, test and follow-up', () => {
    const items = parseVisit('Patient complains of headache and dizziness. Diagnosis: Essential hypertension. Start Amlodipine 5 mg. Order HbA1c. Follow up in 2 weeks.');
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['complaint', 'diagnosis', 'medicine', 'test', 'followup']));
    expect(items.find((i) => i.kind === 'medicine')?.text).toBe('Amlodipine 5 mg');
  });
  it('keeps singular ids stable so edits survive re-parsing', () => {
    const a = parseVisit('يشكو المريض من صداع');
    const b = parseVisit('يشكو المريض من صداع شديد');
    expect(a[0].id).toBe('complaint');
    expect(b[0].id).toBe('complaint');
  });
});
