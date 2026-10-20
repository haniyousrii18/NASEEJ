import React, { useState } from 'react';
import { UserText } from '../translate/UserText.js';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate, todayIso } from '../format.js';
import type { TimelineItem } from '../record/Timeline.js';
import { Async, Button, Card, Drawer, EmptyState, Field, Notice, PageHead, Pill, Select } from '../ui.js';
import { useA } from '../useA.js';
import { EntryForm, type Entry } from './forms.js';
import { ConfirmDialog, Toast, useToast } from './kit.js';
import { DatePicker } from '../DatePicker.js';

export interface Prep {
  id: string;
  visitDate: string | null;
  status: 'draft' | 'approved';
  content: PrepContent;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface PrepItem {
  id: string;
  text: string;
  date: string | null;
  source: { kind: string; ref: string | null; label: string };
  edited?: boolean;
}
export interface PrepSection {
  key: string;
  included: boolean;
  items: PrepItem[];
}
export interface PrepContent {
  lang: 'ar' | 'en';
  reason: string;
  overview: string;
  sections: PrepSection[];
}

/** Start preparing: a date (or none) and the main reason. The draft itself is built on the server from the record. */
export const StartPrep: React.FC<{ presetDate?: string; onCreated: (id: string) => void; onCancel?: () => void }> = ({ presetDate, onCreated, onCancel }) => {
  const A = useA();
  const V = A.health.visits;
  const { run, pending } = useMutation();
  const [noDate, setNoDate] = useState(!presetDate);
  const [date, setDate] = useState(presetDate ?? '');
  const [reason, setReason] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>(A.lang);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await run<Prep>('/api/prep', 'POST', { visit_date: noDate ? null : date || null, reason: reason.trim(), lang });
    if (!res.ok) return setError(res.error.status === 0 ? A.health.common.offline : A.health.common.failed);
    onCreated(res.data.id);
  };

  return (
    <form className="na-form na-form--stack" onSubmit={submit}>
      <label className="cg-check">
        <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} />
        <span>{V.noDate}</span>
      </label>
      {!noDate && (
        <Field label={V.date} htmlFor="pv-date">
          <DatePicker id="pv-date" value={date} min={undefined} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <Field label={V.reason} htmlFor="pv-reason" help={V.reasonHelp}>
        <textarea id="pv-reason" className="na-textarea" dir="auto" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label={V.language} htmlFor="pv-lang">
        <Select id="pv-lang" className="na-select" value={lang} onChange={(e) => setLang(e.target.value as 'ar' | 'en')}>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </Select>
      </Field>
      {error && (
        <Notice tone="danger" icon="alert" live>
          {error}
        </Notice>
      )}
      <div className="na-form-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? V.starting : V.start}
        </Button>
        {onCancel && (
          <Button variant="quiet" onClick={onCancel}>
            {A.health.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
};

export const PatientVisits: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const V = A.health.visits;
  const [version, setVersion] = useState(0);
  const [starting, setStarting] = useState<{ date?: string } | null>(() => (/[?&]new=1/.test(window.location.hash) ? {} : null));
  const [adding, setAdding] = useState(false);
  const [askDelete, setAskDelete] = useState<Prep | null>(null);
  const preps = useApiData<Prep[]>(`/api/prep?v=${version}`);
  const upcoming = useApiData<TimelineItem[]>(`/api/portal/timeline?type=appointment,patient_entry&limit=40&v=${version}`);
  const { run } = useMutation();
  const { toast, show, hide } = useToast();
  const today = todayIso();

  const items = upcoming.state.status === 'ready' ? upcoming.state.data : [];
  const future = items
    .filter((i) => (i.type === 'appointment' && String(i.data.date) >= today && !['cancelled', 'completed'].includes(String(i.data.status))) || (i.type === 'patient_entry' && i.data.kind === 'visit' && i.occurredAt.slice(0, 10) >= today))
    .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));

  const doDelete = async (p: Prep) => {
    setAskDelete(null);
    const res = await run(`/api/prep/${p.id}`, 'DELETE');
    if (res.ok) {
      setVersion((v) => v + 1);
      show({ text: A.health.common.deleted });
    } else show({ text: A.health.common.failed, tone: 'danger' });
  };

  return (
    <>
      <PageHead
        title={V.title}
        subtitle={V.subtitle}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setStarting({})}>
            {V.prepareTitle}
          </Button>
        }
      />
      <div className="hp-stack">
        <Card title={V.myPreps}>
          <Async state={preps.state} onRetry={preps.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={V.prepsEmpty} body={V.prepareBody} action={<Button variant="primary" onClick={() => setStarting({})}>{V.prepareTitle}</Button>} />}>
            {(list) => (
              <ul className="na-list">
                {list.map((p) => (
                  <li key={p.id} className="na-list-item hp-prepitem">
                    <div className="na-row na-row--between">
                      <strong>{p.content.reason ? <UserText text={p.content.reason} /> : p.visitDate ? fill(V.forDate, { date: formatDate(A.lang, p.visitDate) }) : V.noVisitDate}</strong>
                      <Pill tone={p.status === 'approved' ? 'ok' : 'warn'}>
                        <span aria-hidden="true">{p.status === 'approved' ? '✓' : '○'}</span> {p.status === 'approved' ? V.approved : V.draft}
                      </Pill>
                    </div>
                    <span className="na-muted">
                      {[p.visitDate ? fill(V.forDate, { date: formatDate(A.lang, p.visitDate) }) : V.noVisitDate, fill(V.updated, { date: formatDate(A.lang, p.updatedAt) })].join(' · ')}
                    </span>
                    <div className="na-row">
                      <Button small variant="primary" onClick={() => navigate(`patient/visits/prep/${p.id}`)}>
                        {V.open}
                      </Button>
                      <Button small variant="quiet" onClick={() => setAskDelete(p)}>
                        {V.deletePrep}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Card>
        <Card
          title={V.upcoming}
          actions={
            <Button small variant="quiet" icon="plus" onClick={() => setAdding(true)}>
              {V.addVisit}
            </Button>
          }
        >
          <Async state={upcoming.state} onRetry={upcoming.reload} isEmpty={() => future.length === 0} empty={<EmptyState title={V.upcomingEmpty} />}>
            {() => (
              <ul className="na-list">
                {future.map((i) => {
                  const date = i.type === 'appointment' ? String(i.data.date) : i.occurredAt.slice(0, 10);
                  return (
                    <li key={i.id} className="na-list-item">
                      <strong><UserText text={i.type === 'appointment' ? i.data.reason || V.appointment : i.data.title} /></strong>
                      <span className="na-muted">{[formatDate(A.lang, date), i.type === 'appointment' ? i.data.startTime : ''].filter(Boolean).join(' · ')}</span>
                      <div className="na-row">
                        <Pill>{i.type === 'appointment' ? V.appointment : V.myVisit}</Pill>
                        <Button small onClick={() => setStarting({ date })}>
                          {V.prepare}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Async>
        </Card>
      </div>

      {starting && (
        <Drawer title={V.prepareTitle} subtitle={V.prepareBody} onClose={() => setStarting(null)}>
          <StartPrep presetDate={starting.date} onCancel={() => setStarting(null)} onCreated={(id) => navigate(`patient/visits/prep/${id}`)} />
        </Drawer>
      )}
      {adding && (
        <Drawer title={A.health.profile.newTitle.visit} onClose={() => setAdding(false)}>
          <EntryForm
            kind="visit"
            onCancel={() => setAdding(false)}
            onSaved={(_e: Entry) => {
              setAdding(false);
              setVersion((v) => v + 1);
              show({ text: A.health.common.saved });
            }}
          />
        </Drawer>
      )}
      {askDelete && <ConfirmDialog title={V.deletePrep} body={V.deletePrepBody} confirmLabel={A.health.common.remove} danger onConfirm={() => void doDelete(askDelete)} onClose={() => setAskDelete(null)} />}
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
