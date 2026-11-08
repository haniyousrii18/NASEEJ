import React, { useMemo, useState } from 'react';
import { UserText } from '../translate/UserText.js';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate, localeOf, todayIso } from '../format.js';
import type { TimelineItem } from '../record/Timeline.js';
import { Async, Button, Drawer, EmptyState, Field, Notice, PageHead, Pill, Select } from '../ui.js';
import { useA } from '../useA.js';
import { EntryForm, type Entry } from './forms.js';
import { ConfirmDialog, Toast, useToast } from './kit.js';
import { DatePicker } from '../DatePicker.js';
import { failureMsg } from '../errors.js';
import { useMsgState } from '../useMsg.js';
import { Reveal } from '../../components/motion.js';
import { AppIcon } from '../AppIcons.js';

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
  const [error, setError] = useMsgState();
  const needsDate = !noDate && !date;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || needsDate) return;
    setError('');
    const res = await run<Prep>('/api/prep', 'POST', { visit_date: noDate ? null : date || null, reason: reason.trim(), lang });
    if (!res.ok) return setError(failureMsg(res.error, undefined, false));
    onCreated(res.data.id);
  };

  return (
    <form className="na-form na-form--stack" onSubmit={submit}>
      <label className="cg-check">
        <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} />
        <span>{V.noDate}</span>
      </label>
      {!noDate && (
        <Field label={V.date} htmlFor="pv-date" help={needsDate ? V.dateRequired : undefined}>
          <DatePicker id="pv-date" value={date} min={undefined} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <Field label={V.reason} htmlFor="pv-reason" help={V.reasonHelp}>
        <textarea id="pv-reason" className="na-textarea" dir="auto" rows={3} maxLength={500} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
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
        <Button type="submit" variant="primary" disabled={pending || needsDate}>
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

/** A calendar tile: the day large, the month small. A missing or unreadable date shows a calendar glyph instead. */
const DateTile: React.FC<{ date: string | null; lang: 'ar' | 'en'; muted?: boolean }> = ({ date, lang, muted }) => {
  const d = date ? new Date(`${date.slice(0, 10)}T00:00:00`) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return (
      <span className="hp-vx-tile hp-vx-tile--none" aria-hidden="true">
        <AppIcon name="calendar" size={22} />
      </span>
    );
  }
  return (
    <span className="hp-vx-tile" data-muted={muted || undefined} aria-hidden="true">
      <b>{new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric' }).format(d)}</b>
      <small>{new Intl.DateTimeFormat(localeOf(lang), { month: 'short' }).format(d)}</small>
    </span>
  );
};

const daysUntil = (iso: string) => Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime()) / 86400000);

const countItems = (p: Prep) => p.content.sections.filter((s) => s.included).reduce((n, s) => n + s.items.length, 0);

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

  const future = useMemo(() => {
    const items = upcoming.state.status === 'ready' ? upcoming.state.data : [];
    return items
      .filter((i) => (i.type === 'appointment' && String(i.data.date) >= today && !['cancelled', 'completed'].includes(String(i.data.status))) || (i.type === 'patient_entry' && i.data.kind === 'visit' && i.occurredAt.slice(0, 10) >= today))
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  }, [upcoming.state, today]);

  const [upSort, setUpSort] = useState<'soonest' | 'latest'>('soonest');
  const [prepSort, setPrepSort] = useState<'updated' | 'soonest' | 'latest' | 'drafts'>('updated');
  const futureSorted = useMemo(() => (upSort === 'soonest' ? future : [...future].reverse()), [future, upSort]);

  const prepList = preps.state.status === 'ready' ? preps.state.data : [];
  // A summary with no date always goes last when ordering by visit date.
  const prepsSorted = useMemo(() => {
    const byUpdated = (a: Prep, b: Prep) => b.updatedAt.localeCompare(a.updatedAt);
    const visit = (p: Prep) => p.visitDate?.slice(0, 10) ?? '';
    const dated = (dir: 1 | -1) => (a: Prep, b: Prep) => (!visit(a) ? 1 : !visit(b) ? -1 : dir * visit(a).localeCompare(visit(b))) || byUpdated(a, b);
    const by = {
      updated: byUpdated,
      soonest: dated(1),
      latest: dated(-1),
      drafts: (a: Prep, b: Prep) => Number(a.status === 'approved') - Number(b.status === 'approved') || byUpdated(a, b),
    }[prepSort];
    return [...prepList].sort(by);
  }, [prepList, prepSort]);
  const prepForDate = (date: string) => prepList.find((p) => p.visitDate?.slice(0, 10) === date);

  const doDelete = async (p: Prep) => {
    setAskDelete(null);
    const res = await run(`/api/prep/${p.id}`, 'DELETE');
    if (res.ok) {
      setVersion((v) => v + 1);
      show({ text: A.health.common.deleted });
    } else show({ text: A.health.common.failed, tone: 'danger' });
  };

  const when = (date: string) => {
    const n = daysUntil(date);
    return n <= 0 ? V.today : n === 1 ? V.tomorrow : n < 15 ? fill(V.inDays, { n }) : '';
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
      <div className="hp-vx">
        <section className="hp-vx-col" aria-labelledby="vx-up">
          <header className="hp-vx-head">
            <h2 id="vx-up">{V.upcoming}</h2>
            <div className="hp-vx-tools">
              {future.length > 1 && (
                <Select className="na-select hp-vx-sort" value={upSort} aria-label={V.sortLabel} onChange={(e) => setUpSort(e.target.value as 'soonest' | 'latest')}>
                  <option value="soonest">{V.sortUpcoming.soonest}</option>
                  <option value="latest">{V.sortUpcoming.latest}</option>
                </Select>
              )}
              <Button small variant="quiet" icon="plus" onClick={() => setAdding(true)}>
                {V.addVisit}
              </Button>
            </div>
          </header>
          <Async state={upcoming.state} onRetry={upcoming.reload} isEmpty={() => future.length === 0} empty={<EmptyState title={V.upcomingEmpty} action={<Button small icon="plus" onClick={() => setAdding(true)}>{V.addVisit}</Button>} />}>
            {() => (
              <ul className="hp-vx-list">
                {futureSorted.map((i, idx) => {
                  const date = i.type === 'appointment' ? String(i.data.date) : i.occurredAt.slice(0, 10);
                  const prep = prepForDate(date);
                  const soon = when(date);
                  return (
                    <Reveal as="li" y={10} i={idx} key={i.id} className="hp-vx-card" data-first={i.id === future[0]?.id || undefined}>
                      <DateTile date={date} lang={A.lang} />
                      <div className="hp-vx-body">
                        {i.id === future[0]?.id && <span className="hp-vx-next">{V.next}</span>}
                        <strong dir="auto">
                          <UserText text={i.type === 'appointment' ? i.data.reason || V.appointment : i.data.title} />
                        </strong>
                        <span className="hp-vx-sub">
                          {[formatDate(A.lang, date), i.type === 'appointment' ? i.data.startTime : '', soon].filter(Boolean).join(' · ')}
                        </span>
                        <span className="hp-vx-tags">
                          <Pill>{i.type === 'appointment' ? V.appointment : V.myVisit}</Pill>
                          {prep && <Pill tone={prep.status === 'approved' ? 'ok' : 'warn'}>{prep.status === 'approved' ? V.approved : V.draft}</Pill>}
                        </span>
                      </div>
                      <div className="hp-vx-act">
                        {prep ? (
                          <Button small variant="primary" onClick={() => navigate(`patient/visits/prep/${prep.id}`)}>
                            {V.openPrep}
                          </Button>
                        ) : (
                          <Button small onClick={() => setStarting({ date })}>
                            {V.prepare}
                          </Button>
                        )}
                      </div>
                    </Reveal>
                  );
                })}
              </ul>
            )}
          </Async>
        </section>

        <section className="hp-vx-col" aria-labelledby="vx-preps">
          <header className="hp-vx-head">
            <h2 id="vx-preps">{V.myPreps}</h2>
            {prepList.length > 1 && (
              <Select className="na-select hp-vx-sort" value={prepSort} aria-label={V.sortLabel} onChange={(e) => setPrepSort(e.target.value as typeof prepSort)}>
                <option value="updated">{V.sortPreps.updated}</option>
                <option value="soonest">{V.sortPreps.soonest}</option>
                <option value="latest">{V.sortPreps.latest}</option>
                <option value="drafts">{V.sortPreps.drafts}</option>
              </Select>
            )}
          </header>
          <Async state={preps.state} onRetry={preps.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={V.prepsEmpty} body={V.prepareBody} action={<Button variant="primary" onClick={() => setStarting({})}>{V.prepareTitle}</Button>} />}>
            {() => (
              <ul className="hp-vx-list">
                {prepsSorted.map((p, idx) => {
                  const n = countItems(p);
                  const title = p.content.reason ? <UserText text={p.content.reason} /> : p.visitDate ? fill(V.forDate, { date: formatDate(A.lang, p.visitDate) }) : V.noVisitDate;
                  return (
                    <Reveal as="li" y={10} i={idx} key={p.id} className="hp-vx-card hp-prepitem" data-status={p.status}>
                      <DateTile date={p.visitDate} lang={A.lang} muted={p.status === 'draft'} />
                      <div className="hp-vx-body">
                        <strong dir="auto">{title}</strong>
                        <span className="hp-vx-sub">
                          {[p.visitDate ? fill(V.forDate, { date: formatDate(A.lang, p.visitDate) }) : V.noVisitDate, n > 0 ? fill(V.itemsCount, { n }) : '', fill(V.updated, { date: formatDate(A.lang, p.updatedAt) })].filter(Boolean).join(' · ')}
                        </span>
                        <span className="hp-vx-tags">
                          <Pill tone={p.status === 'approved' ? 'ok' : 'warn'}>
                            <span aria-hidden="true">{p.status === 'approved' ? '✓' : '○'}</span> {p.status === 'approved' ? V.approved : V.draft}
                          </Pill>
                        </span>
                      </div>
                      <div className="hp-vx-act">
                        <Button small variant="primary" onClick={() => navigate(`patient/visits/prep/${p.id}`)}>
                          {V.open}
                        </Button>
                        <Button small variant="quiet" onClick={() => setAskDelete(p)}>
                          {V.deletePrep}
                        </Button>
                      </div>
                    </Reveal>
                  );
                })}
              </ul>
            )}
          </Async>
        </section>
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
