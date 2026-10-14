import React from 'react';
import { useLang } from '../../context/LangContext.js';
import type { AllergySeverity } from '../../lib/types.js';

const svgBase = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export const Icon = {
  octagon: <svg {...svgBase}><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /><path d="M12 8v5M12 16.5v.01" /></svg>,
  triangle: <svg {...svgBase}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></svg>,
  circle: <svg {...svgBase}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16v.01" /></svg>,
  dot: <svg {...svgBase}><circle cx="12" cy="12" r="8" /></svg>,
  diamond: <svg {...svgBase}><path d="M12 2l10 10-10 10L2 12z" /></svg>,
  up: <svg {...svgBase}><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  down: <svg {...svgBase}><path d="M12 5v14M5 12l7 7 7-7" /></svg>,
  flat: <svg {...svgBase}><path d="M5 12h14" /></svg>,
  check: <svg {...svgBase}><path d="M5 12l5 5 9-10" /></svg>,
  cross: <svg {...svgBase}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  lock: <svg {...svgBase}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  focus: <svg {...svgBase}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
  search: <svg {...svgBase}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>,
  keyboard: <svg {...svgBase}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>,
  info: <svg {...svgBase}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>,
};

/** Draft / approved state: always an icon plus a word, never colour alone. */
export const StatusChip: React.FC<{ status: 'draft' | 'approved' }> = ({ status }) => {
  const { t } = useLang();
  const approved = status === 'approved';
  return (
    <span className={`status-badge ${approved ? 'badge-approved' : 'badge-draft'}`} style={{ fontSize: 12 }}>
      {approved ? Icon.check : Icon.dot}
      <span>{approved ? t.doctor.status.approved : t.doctor.status.draft}</span>
    </span>
  );
};

/** Whether the patient can see a record. The word carries the meaning; the icon reinforces it. */
export const VisibilityChip: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { t } = useLang();
  return (
    <span className="status-badge badge-info" style={{ fontSize: 12 }}>
      {visible ? Icon.check : Icon.lock}
      <span>{visible ? t.doctor.status.visible : t.doctor.status.hidden}</span>
    </span>
  );
};

const ALLERGY_ICON: Record<AllergySeverity, React.ReactNode> = {
  life_threatening: Icon.octagon,
  severe: Icon.octagon,
  moderate: Icon.triangle,
  mild: Icon.circle,
};

/** Allergy severity exactly as recorded, as an icon plus the recorded word. */
export const AllergyChip: React.FC<{ severity: AllergySeverity }> = ({ severity }) => {
  const { t } = useLang();
  const high = severity === 'severe' || severity === 'life_threatening';
  return (
    <span className={`status-badge ${high ? 'badge-danger' : 'badge-draft'}`} style={{ fontSize: 12, padding: '2px 10px' }}>
      {ALLERGY_ICON[severity]}
      <span>{t.doctor.overview.severity[severity]}</span>
    </span>
  );
};

export const Skeleton: React.FC<{ height?: number; width?: string | number }> = ({ height = 16, width = '100%' }) => (
  <div className="doctor-skeleton" style={{ height, width, borderRadius: 8 }} aria-hidden="true" />
);

export const formatDate = (iso: string, locale: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
};
