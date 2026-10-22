import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon, type IconName } from '../AppIcons.js';
import { useDownload, useRequest, type ApiFailure } from '../api.js';
import { fill, formatBytes, formatDate, nameOf } from '../format.js';
import { Button, EmptyState, ErrorState, Field, Loading, Notice, Pill, Select } from '../ui.js';
import { FilterBar } from '../health/filters.js';
import { useA } from '../useA.js';
import { ReviewPill } from './badges.js';
import { DatePicker } from '../DatePicker.js';

export interface TimelineItem {
  id: string;
  type: 'visit' | 'prescription' | 'lab_result' | 'document' | 'appointment' | 'symptom_report' | 'patient_entry';
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

const TYPES: TimelineItem['type'][] = ['visit', 'prescription', 'lab_result', 'document', 'appointment', 'symptom_report', 'patient_entry'];
const ICON: Record<TimelineItem['type'], IconName> = {
  visit: 'visit',
  prescription: 'pill',
  lab_result: 'flask',
  document: 'documents',
  appointment: 'calendar',
  symptom_report: 'message',
  patient_entry: 'pulse',
};

interface Props {
  /** `/api/portal/timeline` for a patient, `/api/patients/<id>/timeline` for a clinician. */
  endpoint: string;
  audience: 'patient' | 'clinician';
  /** Restricts the record types offered (e.g. a page that only needs documents). */
  types?: TimelineItem['type'][];
  pageSize?: number;
  /** False for a caregiver: original files are downloaded by the patient and clinicians only. */
  canDownload?: boolean;
  /** Extra controls for one entry (e.g. edit and delete for what the patient entered). */
  renderActions?: (item: TimelineItem) => React.ReactNode;
  /** Changing this value reloads the list. */
  reloadKey?: number;
  /** A record to bring into view (e.g. one just saved): pages are loaded until it is found, then it is scrolled to and highlighted. */
  focusId?: string | null;
  onFocusDone?: () => void;
}

/**
 * The chronological record. Filters by type, center and date; pages with a cursor; every entry shows where it
 * came from (center, author, provenance, review state) and links to its source. It never summarizes or interprets.
 */
export const Timeline: React.FC<Props> = ({ endpoint, audience, types, pageSize = 20, canDownload = true, renderActions, reloadKey = 0, focusId = null, onFocusDone }) => {
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
  const [showFilters, setShowFilters] = useState(false);
  const [notice, setNotice] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const focusPages = useRef(0);
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
  }, [load, reloadKey]);

  // Bring a just-saved record into view. The list is ordered by when each thing happened, not when it was saved, so a record
  // that started days ago can sit on a later page: keep loading pages (bounded) until it is there, then scroll and highlight it.
  useEffect(() => {
    if (!focusId || status !== 'ready') return;
    if (items.some((i) => i.id === focusId)) {
      focusPages.current = 0;
      setFresh(focusId);
      requestAnimationFrame(() => {
        const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        document.querySelector(`[data-item-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
      });
      onFocusDone?.();
    } else if (next && focusPages.current < 30) {
      focusPages.current += 1;
      void load(next);
    } else {
      focusPages.current = 0;
      onFocusDone?.();
    }
  }, [focusId, status, items, next, load, onFocusDone]);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 4000);
    return () => clearTimeout(t);
  }, [fresh]);

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


  return (
    <div className="na-stack">

      <FilterBar
        open={showFilters}
        onToggle={() => setShowFilters((v) => !v)}
        onReset={reset}
        active={[
          ...selected.map((t) => ({ key: `t-${t}`, label: A.common.recordType[t as TimelineItem['type']], onRemove: () => toggleType(t) })),
          ...(org ? [{ key: 'org', label: nameOf(A.lang, centers.current.get(org)), onRemove: () => setOrg('') }] : []),
          ...(from ? [{ key: 'from', label: `${A.common.filters.from}: ${formatDate(A.lang, from)}`, onRemove: () => setFrom('') }] : []),
          ...(to ? [{ key: 'to', label: `${A.common.filters.to}: ${formatDate(A.lang, to)}`, onRemove: () => setTo('') }] : []),
        ]}
      >
        <fieldset className="hp-fieldset">
          <legend>{A.common.filters.type}</legend>
          <div className="na-chips">
            {allowedTypes.map((t) => (
              <button key={t} type="button" className="na-chip" aria-pressed={selected.includes(t)} onClick={() => toggleType(t)}>
                {A.common.recordType[t]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="hp-fieldset">
          <legend>{A.health.common.dateRange}</legend>
          <div className="hp-pair">
            <Field label={A.common.filters.from} htmlFor="tl-from">
              <DatePicker id="tl-from" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={A.common.filters.to} htmlFor="tl-to">
              <DatePicker id="tl-to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        </fieldset>
        {centers.current.size > 1 && (
          <Field label={A.common.filters.center} htmlFor="tl-center">
            <Select id="tl-center" className="na-select" value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">{A.common.filters.allCenters}</option>
              {[...centers.current.values()].map((c) => (
                <option key={c.id} value={c.id}>
                  {nameOf(A.lang, c)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </FilterBar>

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
              <li key={item.id} className="na-tl-item" data-external={item.isExternal} data-item-id={item.id} data-fresh={fresh === item.id || undefined}>
                <span className="na-tl-dot" aria-hidden="true">
                  <AppIcon name={ICON[item.type]} />
                </span>
                <div className="na-tl-body">
                  <div className="na-tl-head">
                    <span className="na-tl-title">{titleOf(item, A)}</span>
                    <time className="na-tl-date" dateTime={item.occurredAt}>
                      {item.type === 'appointment'
                        ? `${formatDate(A.lang, String(item.data.date))} ${item.data.startTime}`
                        : formatDate(A.lang, item.occurredAt, item.type === 'visit' || (item.type === 'symptom_report' && !/T00:00:00(\.000)?Z$/.test(item.occurredAt)))}
                    </time>
                  </div>
                  <div className="na-tl-meta hp-meta">
                    <span>{A.common.recordType[item.type]}</span>
                    <span>{(A.common.provenance as Record<string, string>)[item.provenance]}</span>
                    {['draft', 'unreviewed', 'needs_review'].includes(item.reviewStatus) && <ReviewPill status={item.reviewStatus} />}
                    {item.organization.id && <span>{nameOf(A.lang, item.organization)}</span>}
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
                  {renderActions && <div className="na-row" style={{ marginTop: 6 }}>{renderActions(item)}</div>}
                  {openIds.has(item.id) && (
                    <div className="na-tl-detail">
                      <Details item={item} onDownload={!canDownload ? undefined : async () => {
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
      return d.reason || `${A.common.recordType.appointment} · ${(A.common.appointmentStatus as Record<string, string>)[d.status] || d.status}`;
    case 'symptom_report':
      return d.description;
    case 'patient_entry':
      return d.title;
  }
}

/** The recorded fields of one entry. Values are shown as stored; nothing is rated, ranked or summarized. */
const Details: React.FC<{ item: TimelineItem; onDownload?: () => void }> = ({ item, onDownload }) => {
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
        {onDownload && (
          <div>
            <Button small icon="download" onClick={onDownload}>
              {R.download}
            </Button>
          </div>
        )}
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
  if (item.type === 'patient_entry') {
    return (
      <dl className="na-dl">
        {row(R.value, d.value ? `${d.value}${d.unit ? ` ${d.unit}` : ''}` : '')}
        {row(R.sourceCenter, d.providerName)}
        {row(R.notes, d.notes)}
      </dl>
    );
  }
  return (
    <dl className="na-dl">
      {row(R.notes, d.description)}
      {row(A.health.symptoms.duration, d.durationText)}
      {row(A.health.symptoms.frequency, d.frequency ? (A.health.symptoms.freq as Record<string, string>)[d.frequency] : '')}
      {row(A.health.symptoms.better, d.betterFactors)}
      {row(A.health.symptoms.worse, d.worseFactors)}
      {row(R.severity, d.severityReportedByPatient ? `${d.severityReportedByPatient} / 10` : '')}
      {row(R.notes, d.notes)}
    </dl>
  );
};
