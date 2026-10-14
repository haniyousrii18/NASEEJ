// Pure helpers that derive doctor-facing views from records the API already returns.
// Nothing here interprets clinical data: it only reads statuses and flags that exist on the records.

import type { LabOrder, PatientData } from './types.js';

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

/** Every lab result as a flat row, newest first, with the arithmetic difference to the previous result of the same parameter. */
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

export type PendingKind = 'visit' | 'rx' | 'lab';

export interface PendingItem {
  id: string;
  kind: PendingKind;
  refId: string;
  label: string;
  at: string; // ISO
}

/** Records still in "draft": hidden from the patient and awaiting clinician approval. */
export function pendingItems(data: PatientData): PendingItem[] {
  const out: PendingItem[] = [];
  for (const v of data.visits) {
    if (v.status === 'draft') out.push({ id: `visit:${v.id}`, kind: 'visit', refId: v.id, label: v.diagnosis, at: v.updated_at || v.visit_date });
  }
  for (const p of data.prescriptions) {
    if (p.status === 'draft') {
      out.push({ id: `rx:${p.id}`, kind: 'rx', refId: p.id, label: (p.items ?? []).map((i) => i.medication_name).join(' · '), at: p.updated_at || p.created_at });
    }
  }
  for (const l of labRows(data.labOrders)) {
    if (l.status === 'draft') out.push({ id: `lab:${l.id}`, kind: 'lab', refId: l.orderId, label: `${l.parameter_name}: ${l.value} ${l.unit}`.trim(), at: l.date });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
