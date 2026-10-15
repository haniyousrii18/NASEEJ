import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon, type IconName } from '../AppIcons.js';
import { useDownload, useRequest, type ApiFailure } from '../api.js';
import { fill, formatBytes, formatDate, nameOf } from '../format.js';
import { Button, EmptyState, ErrorState, Loading, Notice, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { ProvenancePill, ReviewPill } from './badges.js';

export interface TimelineItem {
  id: string;
  type: 'visit' | 'prescription' | 'lab_result' | 'document' | 'appointment' | 'symptom_report';
  occurredAt: string;
  recordedAt: string;
  organization: { id: string; name_ar: string; name_en: string };
  author: { name_ar: string; name_en: string } | null;
  provenance: string;
  reviewStatus: string;
  isExternal: boolean;
  consentId: string | null;
  source: { resource: string; id: string };
  data: Record<string, any>;
}

const TYPES: TimelineItem['type'][] = ['visit', 'prescription', 'lab_result', 'document', 'appointment', 'symptom_report'];
const ICON: Record<TimelineItem['type'], IconName> = {
  visit: 'visit',
  prescription: 'pill',
  lab_result: 'flask',
  document: 'documents',
  appointment: 'calendar',
  symptom_report: 'message',
};

interface Props {
  /** `/api/portal/timeline` for a patient, `/api/patients/<id>/timeline` for a clinician. */
  endpoint: string;
  audience: 'patient' | 'clinician';
  /** Restricts the record types offered (e.g. a page that only needs documents). */
  types?: TimelineItem['type'][];
  pageSize?: number;
}

/**
 * The chronological record. Filters by type, center and date; pages with a cursor; every entry shows where it
 * came from (center, author, provenance, review state) and links to its source. It never summarizes or interprets.
 */
export const Timeline: React.FC<Props> = ({ endpoint, audience, types, pageSize = 20 }) => {
  const A = useA();
  const T = A.record.timeline;
  const request = useRequest();
  const download = useDownload();

  const allowedTypes = types ?? TYPES;
  const [selected, setSelected] = useState<string[]>([]);
  const [org, setOrg] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'more' | 'error'>('loading');
  const [error, setError] = useState<ApiFailure | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const seq = useRef(0);
  const centers = useRef(new Map<string, { id: string; name_ar: string; name_en: string }>());

  const query = useMemo(() => {
    const p = new URLSearchParams();
    const chosen = selected.length ? selected : types ?? [];
    if (chosen.length) p.set('type', chosen.join(','));
    if (org) p.set('organizationId', org);
    if (from) p.set('from', from);
    if (to) p.set('to', `${to}T23:59:59`);
    p.set('limit', String(pageSize));
    return p;
  }, [selected, org, from, to, pageSize, types]);

  const load = useCallback(
    async (cursor?: string) => {
      const mine = ++seq.current;
      setStatus(cursor ? 'more' : 'loading');
      const params = new URLSearchParams(query);
      if (cursor) params.set('before', cursor);
      const res = await request<TimelineItem[]>(`${endpoint}?${params.toString()}`);
      if (mine !== seq.current) return;
      if (!res.ok) {
        setError(res.error);
        setStatus('error');
        return;
      }
      res.data.forEach((i) => i.organization.id && centers.current.set(i.organization.id, i.organization));
      setItems((prev) => (cursor ? [...prev, ...res.data] : res.data));
      setNext(res.meta?.hasMore ? res.meta.nextBefore : null);
      setStatus('ready');
    },
    [endpoint, query, request],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const toggleType = (t: string) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const toggleOpen = (id: string) =>
    setOpenIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const reset = () => {
    setSelected([]);
    setOrg('');
    setFrom('');
    setTo('');
  };

  const filtered = selected.length > 0 || org || from || to;

  return (
    <div className="na-stack">
      <Notice tone="info" icon="shield">
        {audience === 'patient' ? T.patientNote : T.clinicianNote}
      </Notice>

      <section className="na-card" aria-label={A.common.filters.type}>
        <div className="na-stack">
          <div className="na-chips" role="group" aria-label={A.common.filters.type}>
            {allowedTypes.map((t) => (
              <button key={t} type="button" className="na-chip" aria-pressed={selected.includes(t)} onClick={() => toggleType(t)}>
                {A.common.recordType[t]}
              </button>
            ))}
          </div>
          <div className="na-form">
            <div className="na-field">
              <label className="na-label" htmlFor="tl-center">
                {A.common.filters.center}
              </label>
              <select id="tl-center" className="na-select" value={org} onChange={(e) => setOrg(e.target.value)}>
                <option value="">{A.common.filters.allCenters}</option>
                {[...centers.current.values()].map((c) => (
                  <option key={c.id} value={c.id}>
                    {nameOf(A.lang, c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="na-field">
              <label className="na-label" htmlFor="tl-from">
                {A.common.filters.from}
              </label>
              <input id="tl-from" type="date" className="na-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="na-field">
              <label className="na-label" htmlFor="tl-to">
                {A.common.filters.to}
              </label>
              <input id="tl-to" type="date" className="na-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </div>
            {filtered && (
              <Button variant="quiet" onClick={reset}>
                {A.common.filters.reset}
              </Button>
            )}
          </div>
        </div>
      </section>

      {notice && (
        <Notice tone="danger" icon="alert" live>
          {notice}
        </Notice>
      )}

      {status === 'loading' && <Loading />}
      {status === 'error' && error && <ErrorState error={error} onRetry={() => void load()} />}

      {(status === 'ready' || status === 'more') && items.length === 0 && <EmptyState title={T.empty} body={T.emptyBody} />}

      {items.length > 0 && (
        <>
          <p className="na-help" role="status">
            {fill(T.count, { n: items.length })}
          </p>
          <ol className="na-timeline">
            {items.map((item) => (
              <li key={item.id} className="na-tl-item" data-external={item.isExternal}>
                <span className="na-tl-dot" aria-hidden="true">
                  <AppIcon name={ICON[item.type]} />
                </span>
                <div className="na-tl-body">
                  <div className="na-tl-head">
                    <span className="na-tl-title">{titleOf(item, A)}</span>
                    <time className="na-tl-date" dateTime={item.occurredAt}>
                      {item.type === 'appointment'
                        ? `${formatDate(A.lang, String(item.data.date))} ${item.data.startTime}`
                        : formatDate(A.lang, item.occurredAt, item.type === 'visit' || item.type === 'symptom_report')}
                    </time>
                  </div>
                  <div className="na-tl-meta">
                    <Pill>{A.common.recordType[item.type]}</Pill>
                    <ProvenancePill provenance={item.provenance} />
                    <ReviewPill status={item.reviewStatus} />
                    {item.organization.id && <Pill tone="info">{nameOf(A.lang, item.organization)}</Pill>}
                    {item.isExternal && <Pill tone="lilac">{A.common.record.external}</Pill>}
                  </div>
                  <button
                    type="button"
                    className="na-btn na-btn--quiet na-btn--small"
                    aria-expanded={openIds.has(item.id)}
                    onClick={() => toggleOpen(item.id)}
                    style={{ marginTop: 6, paddingInline: 0 }}
                  >
                    {openIds.has(item.id) ? A.common.actions.hideDetails : A.common.actions.showDetails}
                  </button>
                  {openIds.has(item.id) && (
                    <div className="na-tl-detail">
                      {item.reviewStatus === 'draft' && <Notice tone="warn">{A.common.record.draftNote}</Notice>}
                      {item.isExternal && <Notice tone="info">{T.externalNote}</Notice>}
                      <Details item={item} onDownload={async () => {
                        const failure = await download(item.source.id, String(item.data.fileName || 'document'));
                        setNotice(failure ? T.downloadFailed : '');
                      }} />
                      <dl className="na-dl">
                        <dt>{A.common.record.sourceCenter}</dt>
                        <dd>{nameOf(A.lang, item.organization) || '—'}</dd>
                        <dt>{A.common.record.author}</dt>
                        <dd>{nameOf(A.lang, item.author) || '—'}</dd>
                        <dt>{A.common.record.recorded}</dt>
                        <dd>{formatDate(A.lang, item.recordedAt, true)}</dd>
                        <dt>{A.common.record.source}</dt>
                        <dd className="na-ltr">{fill(T.sourceLine, { type: item.source.resource, id: item.source.id.slice(0, 8) })}</dd>
                      </dl>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {next && (
            <div>
              <Button onClick={() => void load(next)} disabled={status === 'more'}>
                {status === 'more' ? T.loadingMore : A.common.actions.loadMore}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export function titleOf(item: TimelineItem, A: ReturnType<typeof useA>): string {
  const d = item.data;
  switch (item.type) {
    case 'visit':
      return d.chiefComplaint || A.common.recordType.visit;
    case 'prescription':
      return (d.items || []).map((i: any) => i.medication_name).join('، ') || A.common.recordType.prescription;
    case 'lab_result':
      return `${A.lang === 'ar' ? d.testNameAr || d.testNameEn : d.testNameEn || d.testNameAr} · ${d.parameterName}`;
    case 'document':
      return d.title || d.fileName;
    case 'appointment':
      return d.reason || (A.common.appointmentStatus as Record<string, string>)[d.status] || d.status;
    case 'symptom_report':
      return d.description;
  }
}

/** The recorded fields of one entry. Values are shown as stored; nothing is rated, ranked or summarized. */
const Details: React.FC<{ item: TimelineItem; onDownload: () => void }> = ({ item, onDownload }) => {
  const A = useA();
  const R = A.common.record;
  const d = item.data;
  const row = (label: string, value: unknown) =>
    value === null || value === undefined || value === '' ? null : (
      <>
        <dt>{label}</dt>
        <dd>{String(value)}</dd>
      </>
    );

  if (item.type === 'visit') {
    const vitals = d.vitalSigns && typeof d.vitalSigns === 'object' ? Object.entries(d.vitalSigns).map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
    return (
      <dl className="na-dl">
        {row(R.chiefComplaint, d.chiefComplaint)}
        {row(R.diagnosis, d.diagnosis)}
        {row(R.plan, d.treatmentPlan)}
        {row(R.vitals, vitals)}
        {row(R.notes, d.examinationNotes)}
      </dl>
    );
  }
  if (item.type === 'prescription') {
    return (
      <div className="na-table-wrap">
        <table className="na-table">
          <thead>
            <tr>
              <th>{R.medication}</th>
              <th>{R.dosage}</th>
              <th>{R.frequency}</th>
              <th>{R.duration}</th>
            </tr>
          </thead>
          <tbody>
            {(d.items || []).map((i: any, idx: number) => (
              <tr key={idx}>
                <td>{i.medication_name}</td>
                <td>{i.dosage}</td>
                <td>{i.frequency}</td>
                <td>{i.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (item.type === 'lab_result') {
    return (
      <dl className="na-dl">
        {row(R.parameter, d.parameterName)}
        {row(R.value, `${d.value} ${d.unit}`)}
        {row(R.reference, d.referenceRange)}
        {d.flaggedAbnormalByClinician ? row(R.flaggedAbnormal, '✓') : null}
        {row(R.reviewedAt, d.reviewedAt ? formatDate(A.lang, d.reviewedAt, true) : '')}
      </dl>
    );
  }
  if (item.type === 'document') {
    return (
      <div className="na-stack">
        <dl className="na-dl">
          {row(R.fileName, d.fileName)}
          {row(R.fileSize, formatBytes(d.fileSize))}
        </dl>
        <div>
          <Button small icon="download" onClick={onDownload}>
            {R.download}
          </Button>
        </div>
      </div>
    );
  }
  if (item.type === 'appointment') {
    return (
      <dl className="na-dl">
        {row(R.occurred, `${formatDate(A.lang, d.date)} ${d.startTime}–${d.endTime}`)}
        {row(R.notes, d.reason)}
      </dl>
    );
  }
  return (
    <dl className="na-dl">
      {row(R.notes, d.description)}
      {row(R.severity, d.severityReportedByPatient ? `${d.severityReportedByPatient} / 10` : '')}
      {row(R.notes, d.notes)}
    </dl>
  );
};
