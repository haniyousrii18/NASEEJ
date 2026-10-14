import React, { useState } from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt } from '../../lib/format.js';
import type { AiSummary } from '../../lib/ai.js';
import { abnormalLabs, activeMedicines, draftVisits } from '../../lib/selectors.js';
import type { PatientData } from '../../lib/types.js';
import { Rise, Stagger } from '../motion.js';
import { AiTag, formatDate, Icon, SeverityChip, SourceChip } from './bits.js';

interface Props {
  data: PatientData;
  summary: AiSummary;
  unseenCount: number;
  onReviewMeds: () => void;
  onOpenChanges: () => void;
}

const ageFrom = (dob?: string): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age -= 1;
  return age;
};

const fact: React.CSSProperties = { fontSize: 13, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: 6 };

/** Everything the doctor needs in the first two minutes, derived from records the API already returns. */
export const PatientBrief: React.FC<Props> = ({ data, summary, unseenCount, onReviewMeds, onOpenChanges }) => {
  const { t, lang, isRtl } = useLang();
  // Collapsed by default on phones so the brief never pushes the working area off screen.
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 640px)').matches);
  const { patient } = data;
  const age = ageFrom(patient.date_of_birth);
  const drafts = draftVisits(data.visits).length;
  const labs = abnormalLabs(data.labOrders).length;
  const rx = activeMedicines(data.prescriptions).length;
  const latest = data.visits.find((v) => v.status === 'approved');
  const locale = isRtl ? 'ar-EG' : 'en-GB';
  const bodyId = 'doctor-brief-body';

  return (
    <section aria-labelledby="doctor-brief-title" className="cloud-feature-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 id="doctor-brief-title" className="text-card-heading" style={{ fontSize: 18, margin: 0 }}>
            {t.doctor.brief.title}
          </h3>
          <AiTag />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="btn-pill btn-pill-cloud"
          style={{ fontSize: 13, padding: '6px 14px', minHeight: 44 }}
          onClick={onOpenChanges}
        >
          {Icon.bell}
          <span>{unseenCount > 0 ? fmt(t.doctor.brief.unseen, { n: unseenCount }) : t.doctor.brief.noUnseen}</span>
        </button>
        <button
          type="button"
          className="btn-pill btn-pill-ghost doctor-brief-toggle"
          style={{ fontSize: 13, padding: '8px 14px', minHeight: 44 }}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t.doctor.brief.toggleHide : t.doctor.brief.toggleShow}
        </button>
        </div>
      </div>

      {open && (
        <div id={bodyId} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {summary.highInteractions.length > 0 && (
            <Rise urgent role="alert">
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                  padding: '8px 14px', borderRadius: 14,
                  background: 'var(--color-status-danger-bg)', border: '1px solid var(--color-status-danger-border)',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--color-status-danger-text)', marginTop: 2 }}>{Icon.octagon}</span>
                  <div>
                    <div style={{ display: 'flex', gap: '2px 10px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-status-danger-text)' }}>{t.doctor.brief.interactionTitle}</span>
                      <span style={{ fontSize: 13, color: 'var(--color-ink)' }} dir="auto">
                        {summary.highInteractions.map((x) => `${x.a} + ${x.b}`).join(' · ')}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-body-gray)', marginTop: 2 }}>{t.doctor.brief.interactionLead}</div>
                  </div>
                </div>
                <button type="button" className="btn-pill btn-pill-charcoal" style={{ fontSize: 13, minHeight: 44 }} onClick={onReviewMeds}>
                  {t.doctor.brief.reviewMeds}
                </button>
              </div>
            </Rise>
          )}

          <Stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Identity */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-body-gray)' }}>
              <span>
                {t.doctor.mrnLabel}: <bdi className="num" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{patient.mrn}</bdi>
              </span>
              {age !== null && (
                <span>
                  <bdi className="num" style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{age}</bdi> {isRtl ? 'سنة' : 'y'}
                </span>
              )}
              {patient.gender && <span>{patient.gender === 'male' ? (isRtl ? 'ذكر' : 'Male') : isRtl ? 'أنثى' : 'Female'}</span>}
              {patient.blood_type && <bdi className="num">{patient.blood_type}</bdi>}
            </div>

            {/* Allergies */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-body-gray)', marginBottom: 6 }}>{t.doctor.brief.allergies}</div>
              {(patient.allergies ?? []).length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>{t.doctor.brief.noAllergies}</span>
              ) : (
                <ul style={{ display: 'flex', gap: 8, flexWrap: 'wrap', listStyle: 'none' }}>
                  {(patient.allergies ?? []).map((a) => (
                    <li key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }} dir="auto">{isRtl ? a.allergen_ar : a.allergen_en}</span>
                      <SeverityChip severity={a.severity === 'life_threatening' || a.severity === 'severe' ? 'high' : a.severity === 'moderate' ? 'medium' : 'low'} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            </div>

            {/* Top problems + unseen changes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-body-gray)' }}>{t.doctor.brief.problems}</span>
                <span style={{ fontSize: 11, color: 'var(--color-body-gray)' }}>{t.doctor.aiNote}</span>
              </div>
              {summary.problems.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--color-body-gray)' }}>{t.doctor.brief.noProblems}</span>
              ) : (
                <ol style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none' }}>
                  {summary.problems.map((p) => (
                    <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <SeverityChip severity={p.severity} />
                      <span style={{ fontSize: 14, color: 'var(--color-ink)' }} dir="auto">
                        {fmt(t.doctor.problem[p.kind], { s: lang === 'ar' ? p.subject_ar : p.subject_en })}
                      </span>
                      <SourceChip kind={p.source.kind} />
                    </li>
                  ))}
                </ol>
              )}
            </div>

            </div>
          </Stagger>

          {/* Quick facts: one compact row, below the essentials */}
          <div style={{ display: 'flex', gap: '4px 18px', flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--color-border-subtle)' }}>
            <span style={fact}>{fmt(t.doctor.brief.drafts, { n: drafts })}</span>
            <span style={fact}>{fmt(t.doctor.brief.labs, { n: labs })}</span>
            <span style={fact}>{fmt(t.doctor.brief.rx, { n: rx })}</span>
            <span style={fact}>
              {t.doctor.brief.latestVisit}: {latest ? formatDate(latest.visit_date, locale) : t.doctor.brief.noVisit}
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
