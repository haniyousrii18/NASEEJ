import React from 'react';
import { fill, formatDate, nameOf, pick } from '../format.js';
import { ProvenancePill, ReviewPill } from '../record/badges.js';
import { Card, Pill } from '../ui.js';
import { useA } from '../useA.js';

/** The clinician-approved part of the patient's file, from /api/portal/summary (scoped to the signed-in patient). */

export interface PortalSummary {
  profile: { full_name_ar: string; full_name_en: string; date_of_birth: string; blood_type: string | null };
  allergies: Array<{ id: string; allergen_ar: string; allergen_en: string; reaction_ar: string | null; reaction_en: string | null; severity: string }>;
  affiliatedCenters: Array<{ id: string; name_ar: string; name_en: string; mrn: string; first_visit_date: string | null }>;
  visits: Array<any>;
  prescriptions: Array<any>;
  labResults: Array<any>;
  upcomingAppointments: Array<any>;
}


const Source: React.FC<{ center?: any; clinician?: any; date?: string; withTime?: boolean }> = ({ center, clinician, date, withTime }) => {
  const A = useA();
  const parts = [date ? formatDate(A.lang, date, withTime) : '', center ? nameOf(A.lang, center) : '', clinician ? nameOf(A.lang, clinician) : ''].filter(Boolean);
  return <span className="na-muted">{parts.join(' · ')}</span>;
};

const centerOf = (r: any) => ({ name_ar: r.center_name_ar, name_en: r.center_name_en });
const clinicianOf = (r: any) => ({ name_ar: r.clinician_name_ar, name_en: r.clinician_name_en });

/** The approved health summary. */
export const SummaryView: React.FC<{ s: PortalSummary }> = ({ s }) => {
  const A = useA();
  const S = A.patient.summary;
  return (
    <div className="na-stack">

      <Card title={S.profile}>
        <dl className="na-dl">
          <dt>{S.dob}</dt>
          <dd>{formatDate(A.lang, s.profile.date_of_birth)}</dd>
          <dt>{S.blood}</dt>
          <dd className="na-ltr">{s.profile.blood_type || A.common.states.notRecorded}</dd>
        </dl>
      </Card>

      <Card title={S.allergies}>
        {s.allergies.length === 0 ? (
          <p>{A.common.record.noAllergies}</p>
        ) : (
          <ul className="na-list">
            {s.allergies.map((a) => (
              <li key={a.id} className="na-list-item">
                <strong>{pick(A.lang, a, 'allergen')}</strong> <Pill tone="warn">{S.severity[a.severity] ?? a.severity}</Pill>
                {pick(A.lang, a, 'reaction') && (
                  <div className="na-muted">
                    {S.reaction}: {pick(A.lang, a, 'reaction')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="na-grid na-grid--2">
        <Card title={S.recentVisits}>
          {s.visits.length === 0 ? (
            <p className="na-muted">{S.noVisits}</p>
          ) : (
            <ul className="na-list">
              {s.visits.slice(0, 3).map((v) => (
                <li key={v.id} className="na-list-item">
                  <strong>{v.chief_complaint}</strong>
                  {v.diagnosis && (
                    <div>
                      {A.common.record.diagnosis}: {v.diagnosis}
                    </div>
                  )}
                  <div className="na-row">
                    <ProvenancePill provenance="clinician_authored" />
                    <ReviewPill status="approved" />
                  </div>
                  <Source center={centerOf(v)} clinician={clinicianOf(v)} date={v.visit_date} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={S.recentMeds}>
          {s.prescriptions.length === 0 ? (
            <p className="na-muted">{S.noMeds}</p>
          ) : (
            <ul className="na-list">
              {s.prescriptions.slice(0, 3).map((p) => (
                <li key={p.id} className="na-list-item">
                  <strong>{(p.items || []).map((i: any) => `${i.medication_name} ${i.dosage}`).join('، ')}</strong>
                  <div className="na-row">
                    <ProvenancePill provenance="clinician_authored" />
                    <ReviewPill status="approved" />
                  </div>
                  <Source center={centerOf(p)} clinician={clinicianOf(p)} date={p.created_at} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={S.recentResults}>
        {s.labResults.length === 0 ? (
          <p className="na-muted">{S.noResults}</p>
        ) : (
          <div className="na-table-wrap">
            <table className="na-table">
              <thead>
                <tr>
                  <th>{A.common.record.parameter}</th>
                  <th>{A.common.record.value}</th>
                  <th>{A.common.record.reference}</th>
                  <th>{A.common.record.sourceCenter}</th>
                  <th>{A.common.record.reviewedAt}</th>
                </tr>
              </thead>
              <tbody>
                {s.labResults.slice(0, 6).map((r) => (
                  <tr key={r.id}>
                    <td>{r.parameter_name}</td>
                    <td className="na-ltr">
                      {r.value} {r.unit}
                    </td>
                    <td className="na-ltr">{r.reference_range || '—'}</td>
                    <td>{nameOf(A.lang, centerOf(r))}</td>
                    <td>{formatDate(A.lang, r.reviewed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={S.centers}>
        <ul className="na-list">
          {s.affiliatedCenters.map((c) => (
            <li key={c.id} className="na-list-item">
              <strong>{nameOf(A.lang, c)}</strong>
              <div className="na-muted">
                {S.mrn}: <span className="na-ltr">{c.mrn}</span>
                {c.first_visit_date ? ` · ${fill(S.since, { date: formatDate(A.lang, c.first_visit_date) })}` : ''}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

