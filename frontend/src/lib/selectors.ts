// Pure helpers that derive doctor-facing views from API records. No I/O, no state.

import type { LabOrder, PatientData, Prescription, PrescriptionItem, Visit } from './types.js';

export type Trend = 'up' | 'down' | 'flat';

export interface LabRow {
  id: string;
  orderId: string;
  testName_ar: string;
  testName_en: string;
  parameter_name: string;
  value: string;
  unit: string;
  reference_range?: string | null;
  is_abnormal: boolean;
  status: 'draft' | 'approved';
  date: string; // ISO
  previous?: { value: string; date: string };
  delta?: number;
  trend?: Trend;
}

const orderDate = (o: LabOrder) => o.updated_at || o.created_at;
const num = (v: string) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const key = (name: string) => name.trim().toLowerCase();

/** Every lab result as a flat row, newest first, with delta vs the previous result of the same parameter. */
export function labRows(orders: LabOrder[]): LabRow[] {
  const rows: LabRow[] = [];
  for (const o of orders) {
    for (const r of o.results ?? []) {
      rows.push({
        id: r.id, orderId: o.id, testName_ar: o.test_name_ar, testName_en: o.test_name_en,
        parameter_name: r.parameter_name, value: r.value, unit: r.unit, reference_range: r.reference_range,
        is_abnormal: r.is_abnormal, status: r.status, date: orderDate(o),
      });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  for (const row of rows) {
    const prev = rows.find((r) => r !== row && key(r.parameter_name) === key(row.parameter_name) && r.date < row.date);
    if (!prev) continue;
    row.previous = { value: prev.value, date: prev.date };
    const a = num(row.value);
    const b = num(prev.value);
    if (a !== null && b !== null) {
      row.delta = Math.round((a - b) * 100) / 100;
      row.trend = a > b ? 'up' : a < b ? 'down' : 'flat';
    }
  }
  return rows;
}

export const abnormalLabs = (orders: LabOrder[]): LabRow[] => labRows(orders).filter((r) => r.is_abnormal);

export const draftVisits = (visits: Visit[]): Visit[] => visits.filter((v) => v.status === 'draft');

export const activeMedicines = (prescriptions: Prescription[]): PrescriptionItem[] =>
  prescriptions.filter((p) => p.status === 'draft' || p.status === 'approved').flatMap((p) => p.items ?? []);

export type ChangeKind = 'lab' | 'visit-draft' | 'visit-approved' | 'rx';

export interface ChangeItem {
  id: string;
  kind: ChangeKind;
  at: string; // ISO
  refId: string;
}

/** Items that appeared or changed after `lastSeen` (ISO). With no timestamp, everything counts as new. */
export function unseenChanges(data: PatientData, lastSeen: string | null): ChangeItem[] {
  const after = (iso: string | null | undefined) => !!iso && (!lastSeen || iso > lastSeen);
  const out: ChangeItem[] = [];
  for (const l of labRows(data.labOrders)) if (after(l.date)) out.push({ id: `lab:${l.id}`, kind: 'lab', at: l.date, refId: l.id });
  for (const v of data.visits) {
    const at = v.status === 'approved' ? v.approved_at || v.updated_at || v.visit_date : v.updated_at || v.visit_date;
    if (after(at)) out.push({ id: `visit:${v.id}`, kind: v.status === 'approved' ? 'visit-approved' : 'visit-draft', at, refId: v.id });
  }
  for (const p of data.prescriptions) {
    const at = p.updated_at || p.created_at;
    if (after(at)) out.push({ id: `rx:${p.id}`, kind: 'rx', at, refId: p.id });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
