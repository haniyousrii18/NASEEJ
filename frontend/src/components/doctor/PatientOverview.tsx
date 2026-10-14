import React from 'react';
import { useLang } from '../../context/LangContext.js';
import { fmt } from '../../lib/format.js';
import type { PatientData } from '../../lib/types.js';
import { AllergyChip, formatDate, Icon } from './bits.js';

interface Props {
  data: PatientData;
  checkedIn: boolean;
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

const label: React.CSSProperties = { fontSize: 12, fontWeight: 520, color: 'var(--color-body-gray)', marginBottom: 6 };
const muted: React.CSSProperties = { fontSize: 13, color: 'var(--color-body-gray)', lineHeight: 1.5 };

/**
 * Pre-visit overview built only from this center's records. Missing data is stated as "not recorded"
 * and never as "none exists".
 */
export const PatientOverview: React.FC<Props> = ({ data, checkedIn }) => {
  const { t, isRtl } = useLang();
  const O = t.doctor.overview;
  const locale = isRtl ? 'ar-EG' : 'en-GB';
  const { patient } = data;
  const age = ageFrom(patient.date_of_birth);
  const allergies = patient.allergies ?? [];
  const latest = data.visits.find((v) => v.status === 'approved');

  return (
    <section aria-labelledby="doctor-overview-title" className="cloud-feature-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 id="doctor-overview-title" className="text-card-heading" style={{ fontSize: 18, margin: 0 }}>
          {O.title}
        </h3>
        <span style={{ ...muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {Icon.info}
          {O.source}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 18, alignItems: 'start' }}>
        {/* Identity + current visit status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={label}>{O.identity}</div>
            <div style={{ display: 'flex', gap: '2px 14px', flexWrap: 'wrap', fontSize: 14 }}>
              <span>
                {t.doctor.mrnLabel}: <bdi className="num" style={{ fontWeight: 560 }}>{patient.mrn}</bdi>
              </span>
              {age !== null && (
                <span>
                  <bdi className="num" style={{ fontWeight: 560 }}>{age}</bdi> {O.years}
                </span>
              )}
              {patient.gender && <span>{patient.gender === 'male' ? (isRtl ? 'ذكر' : 'Male') : isRtl ? 'أنثى' : 'Female'}</span>}
              {patient.blood_type && <bdi className="num">{patient.blood_type}</bdi>}
            </div>
          </div>
          <div>
            <div style={label}>{O.visitStatus}</div>
            <span className={`status-badge ${checkedIn ? 'badge-approved' : 'badge-info'}`} style={{ fontSize: 12 }}>
              {checkedIn ? Icon.check : Icon.info}
              <span>{checkedIn ? O.checkedIn : O.noCheckIn}</span>
            </span>
          </div>
          <div>
            <div style={label}>{O.conditions}</div>
            <p style={muted}>{O.conditionsUnavailable}</p>
          </div>
        </div>

        {/* Allergies + latest approved visit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={label}>{O.allergies}</div>
            {allergies.length === 0 ? (
              <div>
                <p style={{ fontSize: 14 }}>{O.allergiesNone}</p>
                <p style={muted}>{O.allergiesNoneNote}</p>
              </div>
            ) : (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none' }}>
                {allergies.map((a) => {
                  const reaction = isRtl ? a.reaction_ar : a.reaction_en;
                  return (
                    <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }} dir="auto">{isRtl ? a.allergen_ar : a.allergen_en}</strong>
                      <AllergyChip severity={a.severity} />
                      {reaction && <span style={muted} dir="auto">{fmt(O.reaction, { r: reaction })}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <div style={label}>{O.latestApproved}</div>
            {latest ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 520 }} dir="auto">{O.diagnosisLabel}: {latest.diagnosis}</div>
                <div style={muted}>{fmt(O.approvedOn, { d: formatDate(latest.approved_at || latest.visit_date, locale) })}</div>
              </div>
            ) : (
              <p style={{ fontSize: 14 }}>{O.latestApprovedNone}</p>
            )}
            <p style={{ ...muted, marginTop: 6 }}>{O.historyNote}</p>
          </div>
        </div>
      </div>
    </section>
  );
};
