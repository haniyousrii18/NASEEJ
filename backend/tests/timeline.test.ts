import { describe, expect, it } from 'vitest';
import { markConflicts, type TimelineEvent } from '../src/services/health/timeline.js';

// These tests need no database and no network.

const ev = (ref: string, title: string, date: string | null, category: TimelineEvent['category'] = 'test'): TimelineEvent => ({
  ref,
  category,
  title,
  detail: '',
  date,
  origin: 'record_ai',
  confirmedByPatient: false,
  certainty: date ? 'clear' : 'undated',
  confidence: 0.9,
  source: null,
  rationale: null,
  conflictsWith: [],
});

describe('timeline conflicts', () => {
  it('marks both sides when the same finding is read with different values on the same day', () => {
    const a = ev('fact:1', 'HbA1c', '2026-03-02');
    const b = ev('fact:2', 'hba1c', '2026-03-02');
    markConflicts([a, b], new Map([['fact:1', '6 5'], ['fact:2', '7 1']]));
    expect(a.certainty).toBe('conflict');
    expect(b.certainty).toBe('conflict');
    expect(a.conflictsWith).toEqual(['fact:2']);
    expect(b.conflictsWith).toEqual(['fact:1']);
  });

  it('is not a conflict when the values agree or the days differ', () => {
    const same1 = ev('fact:1', 'HbA1c', '2026-03-02');
    const same2 = ev('fact:2', 'HbA1c', '2026-03-02');
    markConflicts([same1, same2], new Map([['fact:1', '6 5'], ['fact:2', '6 5']]));
    expect(same1.certainty).toBe('clear');

    const early = ev('fact:3', 'HbA1c', '2025-03-02');
    const late = ev('fact:4', 'HbA1c', '2026-03-02');
    markConflicts([early, late], new Map([['fact:3', '6 5'], ['fact:4', '7 1']]));
    expect(early.certainty).toBe('clear');
    expect(late.certainty).toBe('clear');
  });

  it('never compares symptoms, visits or documents', () => {
    const a = ev('symptom:1', 'Headache', '2026-03-02', 'symptom');
    const b = ev('symptom:2', 'Headache', '2026-03-02', 'symptom');
    markConflicts([a, b], new Map([['symptom:1', 'mild'], ['symptom:2', 'severe']]));
    expect(a.certainty).toBe('clear');
  });

  it('an undated reading is compared with any date, and stays flagged', () => {
    const a = ev('fact:1', 'Metformin', null, 'medication');
    const b = ev('fact:2', 'Metformin', '2026-01-10', 'medication');
    markConflicts([a, b], new Map([['fact:1', '500 mg'], ['fact:2', '850 mg']]));
    expect(a.certainty).toBe('conflict');
  });
});
