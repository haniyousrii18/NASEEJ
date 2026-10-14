import React from 'react';
import { useLang } from '../../context/LangContext.js';
import type { Severity } from '../../lib/types.js';

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
  diamond: <svg {...svgBase}><path d="M12 2l10 10-10 10L2 12z" /></svg>,
  up: <svg {...svgBase}><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
  down: <svg {...svgBase}><path d="M12 5v14M5 12l7 7 7-7" /></svg>,
  flat: <svg {...svgBase}><path d="M5 12h14" /></svg>,
  check: <svg {...svgBase}><path d="M5 12l5 5 9-10" /></svg>,
  cross: <svg {...svgBase}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  spark: <svg {...svgBase}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>,
  bell: <svg {...svgBase}><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
  focus: <svg {...svgBase}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
  search: <svg {...svgBase}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>,
  keyboard: <svg {...svgBase}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>,
  chevron: <svg {...svgBase}><path d="M6 9l6 6 6-6" /></svg>,
};

const SEVERITY_STYLE: Record<Severity, { cls: string; icon: React.ReactNode }> = {
  high: { cls: 'badge-danger', icon: Icon.octagon },
  medium: { cls: 'badge-lilac', icon: Icon.triangle },
  low: { cls: 'badge-info', icon: Icon.circle },
};

/** Severity is always icon + word, never colour alone. */
export const SeverityChip: React.FC<{ severity: Severity }> = ({ severity }) => {
  const { t } = useLang();
  const s = SEVERITY_STYLE[severity];
  return (
    <span
      className={`status-badge ${s.cls}`}
      style={{ fontSize: 12, padding: '2px 10px' }}
      title={`${t.doctor.severity.label}: ${t.doctor.severity[severity]}`}
      aria-label={`${t.doctor.severity.label}: ${t.doctor.severity[severity]}`}
    >
      {s.icon}
      <span aria-hidden="true">{t.doctor.severity[severity]}</span>
    </span>
  );
};

export const SourceChip: React.FC<{ kind: 'allergy' | 'lab' | 'rx' | 'visit' }> = ({ kind }) => {
  const { t } = useLang();
  return (
    <span className="status-badge badge-info" style={{ fontSize: 11, padding: '2px 8px', fontWeight: 500 }}>
      <span className="visually-hidden-text" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t.doctor.brief.sourceLabel}: </span>
      {t.doctor.source[kind]}
    </span>
  );
};

/** Marks AI-generated surfaces: icon + word, and a note that it is only a suggestion. */
export const AiTag: React.FC<{ withNote?: boolean }> = ({ withNote }) => {
  const { t } = useLang();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="status-badge badge-lilac" style={{ fontSize: 11, padding: '2px 10px' }}>
        {Icon.spark}
        <span>{t.doctor.aiLabel}</span>
      </span>
      {withNote && <span style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>{t.doctor.aiNote}</span>}
    </span>
  );
};

/** "New" state is an icon plus a word, so it is visible without colour or motion. */
export const NewTag: React.FC = () => {
  const { t } = useLang();
  return (
    <span className="status-badge badge-approved" style={{ fontSize: 11, padding: '1px 8px' }}>
      {Icon.diamond}
      <span>{t.doctor.newTag}</span>
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
