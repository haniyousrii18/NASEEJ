import React, { useState } from 'react';
import { UserText } from '../translate/UserText.js';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate } from '../format.js';
import { Timeline } from '../record/Timeline.js';
import { SummaryView, type PortalSummary } from '../pages/patient.js';
import { Async, Button, Card, Drawer, EmptyState, PageHead, Pill, Select } from '../ui.js';
import { AppIcon, type IconName } from '../AppIcons.js';
import { Reveal } from '../../components/motion.js';
import { useA } from '../useA.js';
import { cleanQuery } from '../search/normalize.js';
import { useSearch } from '../search/useSearch.js';
import { ENTRY_KINDS, EntryForm, type Entry, type EntryKind } from './forms.js';
import { ConfirmDialog, SourceLine, Toast, useToast } from './kit.js';

type Tab = EntryKind | 'clinicians';

const KIND_ICON: Record<Tab, IconName> = { condition: 'pulse', medication: 'pill', allergy: 'alert', procedure: 'scroll', measurement: 'chart', visit: 'visit', clinicians: 'users' };
const SEV_TONE = { mild: 'info', moderate: 'warn', severe: 'danger' } as const;
const dateOf = (e: Entry) => (e.kind === 'condition' || e.kind === 'medication' ? e.startDate : e.eventDate) ?? e.createdAt.slice(0, 10);

/** One health fact: what it is, the few details that matter, and where it came from as a quiet line. */
const EntryRow: React.FC<{ e: Entry; index: number; onEdit: () => void; onDelete: () => void }> = ({ e, index, onEdit, onDelete }) => {
  const A = useA();
  const H = A.health.profile;
  const date = e.kind === 'condition' || e.kind === 'medication' ? e.startDate : e.eventDate;
  const status = e.kind === 'condition' || e.kind === 'medication' ? (e.status === 'past' ? H.fields.past[e.kind] : H.fields.active[e.kind]) : null;
  // Typed text is translated piece by piece (a joined string mixing two languages is never translated); labels from the app are plain.
  const details: React.ReactNode[] = [
    e.dose && <UserText key="dose" text={e.dose} />,
    e.frequency && <UserText key="freq" text={e.frequency} />,
    e.reaction && <UserText key="reaction" text={e.reaction} />,
    e.value ? <bdi key="value" dir="ltr">{`${e.value}${e.unit ? ` ${e.unit}` : ''}`}</bdi> : null,
    e.providerName && <UserText key="provider" text={e.providerName} />,
  ].filter(Boolean);
  return (
    <Reveal as="li" y={10} i={index % 4} className="hp-entry hp-pf-card" data-kind={e.kind} data-past={e.status === 'past' || undefined}>
      <span className="hp-pf-ico" aria-hidden="true">
        <AppIcon name={KIND_ICON[e.kind]} size={22} />
      </span>
      <div className="hp-entry-main">
        <strong className="hp-entry-title" dir="auto">
          <UserText text={e.title} />
        </strong>
        {details.length > 0 && (
          <span className="hp-pf-details">
            {details.map((d, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                {d}
              </React.Fragment>
            ))}
          </span>
        )}
        {e.notes && (
          <span className="na-muted">
            <UserText text={e.notes} />
          </span>
        )}
        <span className="hp-pf-tags">
          {e.severity && <Pill tone={SEV_TONE[e.severity]}>{H.fields.sev[e.severity]}</Pill>}
          {status && <Pill tone={e.status === 'past' ? 'neutral' : 'ok'}>{status}</Pill>}
        </span>
        <SourceLine origin={e.source} confirmed={e.reviewStatus === 'confirmed'} date={date ? (e.kind === 'condition' ? fill(H.since, { date: formatDate(A.lang, date) }) : formatDate(A.lang, date)) : undefined} />
      </div>
      <div className="hp-entry-actions">
        <Button small variant="quiet" onClick={onEdit} aria-label={`${A.health.common.edit}: ${e.title}`}>
          {A.health.common.edit}
        </Button>
        <Button small variant="quiet" onClick={onDelete} aria-label={`${A.health.common.remove}: ${e.title}`}>
          {A.health.common.remove}
        </Button>
      </div>
    </Reveal>
  );
};

type EntrySort = 'newest' | 'oldest' | 'name' | 'best';

export const EntryList: React.FC<{ kind: EntryKind; version: number; adding: boolean; onAddClose: () => void; onAdd: () => void; onChanged: () => void; toast: ReturnType<typeof useToast>['show'] }> = ({ kind, version, adding, onAddClose, onAdd, onChanged, toast }) => {
  const A = useA();
  const H = A.health.profile;
  const list = useApiData<Entry[]>(`/api/record/entries?kind=${kind}&v=${version}`);
  const { run } = useMutation();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [asking, setAsking] = useState<Entry | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<EntrySort | null>(null);
  // Typing a search ranks by relevance until the person chooses another order.
  const search = useSearch({ types: [kind], limit: 200 });
  const typed = cleanQuery(q);
  const [scope, setScope] = useState<'all' | 'active' | 'past'>('all');
  const L = H.lib;
  const hasStatus = kind === 'condition' || kind === 'medication';

  const doDelete = async (e: Entry) => {
    setAsking(null);
    const res = await run(`/api/record/entries/${e.id}`, 'DELETE');
    if (!res.ok) return toast({ text: A.health.common.failed, tone: 'danger' });
    onChanged();
    toast({
      text: A.health.common.deleted,
      undo: async () => {
        await run(`/api/record/entries/${e.id}/restore`, 'POST');
        onChanged();
      },
    });
  };

  return (
    <>
      <Async
        state={list.state}
        onRetry={list.reload}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title={H.empty[kind]}
            body={H.emptyBody}
            action={
              <Button variant="primary" icon="plus" onClick={onAdd}>
                {H.add[kind]}
              </Button>
            }
          />
        }
      >
        {(items) => {
          const needle = typed.toLowerCase();
          // The server finds matches in either language (stored text, saved translations, spelling variants, small typos);
          // the plain filter below is only the fallback for one letter or when search is unavailable.
          const ranked = needle.length >= 2 && search.state.status !== 'error' && search.state.status !== 'idle' ? new Map(search.state.hits.map((h, i) => [h.id, i])) : null;
          const sort: EntrySort = picked ?? (ranked ? 'best' : 'newest');
          const shown = items
            .filter((e) => (scope === 'all' || !hasStatus ? true : (e.status ?? 'active') === scope))
            .filter((e) => (ranked ? ranked.has(e.id) : !needle || [e.title, e.dose, e.frequency, e.reaction, e.providerName, e.notes, e.value].some((t) => t?.toLowerCase().includes(needle))))
            .sort((a, b) =>
              sort === 'best' && ranked ? (ranked.get(a.id) ?? 0) - (ranked.get(b.id) ?? 0) : sort === 'name' ? a.title.localeCompare(b.title, A.lang) : sort === 'oldest' ? dateOf(a).localeCompare(dateOf(b)) : dateOf(b).localeCompare(dateOf(a)),
            );
          const filtered = !!needle || scope !== 'all';
          return (
            <div className="hp-pf">
              {items.length > 1 && (
                <div className="hp-pf-bar">
                  <div className="hp-lib-search" role="search">
                    <label className="hp-visually-hidden" htmlFor={`pf-q-${kind}`}>
                      {L.search}
                    </label>
                    <AppIcon name="search" size={19} className="hp-lib-search-icon" />
                    <input id={`pf-q-${kind}`} type="search" dir="auto" value={q} placeholder={L.searchPh} onChange={(e) => { setQ(e.target.value); search.setQuery(e.target.value); }} />
                    {q && (
                      <button type="button" className="hp-lib-clear" aria-label={A.health.common.searchClear} onClick={() => { setQ(''); search.reset(); }}>
                        <AppIcon name="close" size={16} />
                      </button>
                    )}
                  </div>
                  <Select className="na-select hp-vx-sort" value={sort} aria-label={L.sortLabel} onChange={(e) => setPicked(e.target.value as EntrySort)}>
                    {ranked && <option value="best">{L.best}</option>}
                    <option value="newest">{L.newest}</option>
                    <option value="oldest">{L.oldest}</option>
                    <option value="name">{L.name}</option>
                  </Select>
                </div>
              )}
              {hasStatus && items.length > 1 && (
                <div className="hp-lib-types" role="group" aria-label={H.fields.status}>
                  {(['all', 'active', 'past'] as const).map((k) => (
                    <button key={k} type="button" className="hp-lib-chip" aria-pressed={scope === k} onClick={() => setScope(k)}>
                      {k === 'all' ? L.all : H.fields[k][kind as 'condition' | 'medication']}
                      <b>{k === 'all' ? items.length : items.filter((e) => (e.status ?? 'active') === k).length}</b>
                    </button>
                  ))}
                </div>
              )}
              <p className="hp-lib-count" role="status">
                <span>{filtered ? fill(L.countOf, { n: shown.length, total: items.length }) : fill(L.count, { n: shown.length })}</span>
                {filtered && (
                  <button type="button" className="hp-lib-reset" onClick={() => { setQ(''); search.reset(); setScope('all'); setPicked(null); }}>
                    {L.clear}
                  </button>
                )}
              </p>
              {shown.length === 0 ? (
                <EmptyState title={L.noMatch} />
              ) : (
                <ul className="hp-entries hp-pf-list">
                  {shown.map((e, i) => (
                    <EntryRow key={e.id} e={e} index={i} onEdit={() => setEditing(e)} onDelete={() => setAsking(e)} />
                  ))}
                </ul>
              )}
            </div>
          );
        }}
      </Async>
      {(adding || editing) && (
        <Drawer title={editing ? H.editTitle[kind] : H.newTitle[kind]} onClose={() => (editing ? setEditing(null) : onAddClose())}>
          <EntryForm
            kind={kind}
            initial={editing ?? undefined}
            onCancel={() => (editing ? setEditing(null) : onAddClose())}
            onSaved={() => {
              setEditing(null);
              onAddClose();
              onChanged();
              toast({ text: A.health.common.saved });
            }}
          />
        </Drawer>
      )}
      {asking && <ConfirmDialog title={A.health.common.deleteTitle} body={A.health.common.deleteBody} confirmLabel={A.health.common.remove} danger onConfirm={() => void doDelete(asking)} onClose={() => setAsking(null)} />}
    </>
  );
};

export const PatientProfile: React.FC<{ navigate: (r: string) => void }> = () => {
  const A = useA();
  const H = A.health.profile;
  // Opening the page with ?tab=visit&new=1 (from Today) lands on visits with the add form open.
  const [tab, setTab] = useState<Tab>(() => (/[?&]tab=visit/.test(window.location.hash) ? 'visit' : 'condition'));
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(() => /[?&]tab=visit/.test(window.location.hash) && /[?&]new=1/.test(window.location.hash));
  const { toast, show, hide } = useToast();
  const summary = useApiData<PortalSummary>(tab === 'clinicians' ? '/api/portal/summary' : null);

  return (
    <>
      <PageHead
        title={H.title}
        subtitle={H.subtitle}
        actions={
          tab !== 'clinicians' && (
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              {H.add[tab]}
            </Button>
          )
        }
      />
      <nav className="na-tabs hp-pf-tabs" aria-label={H.title}>
        {[...ENTRY_KINDS, 'clinicians' as const].map((t) => (
          <button key={t} type="button" className="na-tab" aria-current={tab === t ? 'page' : undefined} onClick={() => { setTab(t); setAdding(false); }}>
            <AppIcon name={KIND_ICON[t]} size={17} />
            {H.tabs[t]}
          </button>
        ))}
      </nav>
      {tab === 'clinicians' ? (
        <div className="hp-stack">
          <p className="na-muted">{H.clinicianNote}</p>
          <Async state={summary.state} onRetry={summary.reload}>
            {(s) => <SummaryView s={s} />}
          </Async>
          <Card title={A.nav.items.patientMedications}>
            <Timeline endpoint="/api/portal/timeline" audience="patient" types={['prescription']} pageSize={10} />
          </Card>
        </div>
      ) : (
        <EntryList key={tab} kind={tab} version={version} adding={adding} onAdd={() => setAdding(true)} onAddClose={() => setAdding(false)} onChanged={() => setVersion((v) => v + 1)} toast={show} />
      )}
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
