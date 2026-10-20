import React, { useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate } from '../format.js';
import { Timeline } from '../record/Timeline.js';
import { SummaryView, type PortalSummary } from '../pages/patient.js';
import { Async, Button, Card, Drawer, EmptyState, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { ENTRY_KINDS, EntryForm, type Entry, type EntryKind } from './forms.js';
import { ConfirmDialog, OriginPill, Toast, useToast } from './kit.js';

type Tab = EntryKind | 'clinicians';

/** One health fact as a calm card: what it is, the few details, and where it came from. */
const EntryCard: React.FC<{ e: Entry; onEdit: () => void; onDelete: () => void }> = ({ e, onEdit, onDelete }) => {
  const A = useA();
  const H = A.health.profile;
  const date = e.kind === 'condition' || e.kind === 'medication' ? e.startDate : e.eventDate;
  const details = [
    e.dose,
    e.frequency,
    e.reaction,
    e.severity ? H.fields.sev[e.severity] : null,
    e.value ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : null,
    e.providerName,
    e.kind === 'condition' || e.kind === 'medication' ? (e.status === 'past' ? H.fields.past[e.kind] : H.fields.active[e.kind]) : null,
  ].filter(Boolean) as string[];
  return (
    <li className="na-list-item hp-entry">
      <div className="na-row na-row--between">
        <strong dir="auto" className="na-item-title">
          {e.title}
        </strong>
        <div className="na-row">
          <Button small variant="quiet" onClick={onEdit}>
            {A.health.common.edit}
          </Button>
          <Button small variant="quiet" onClick={onDelete}>
            {A.health.common.remove}
          </Button>
        </div>
      </div>
      {details.length > 0 && <p dir="auto">{details.join(' · ')}</p>}
      {e.notes && (
        <p className="na-muted" dir="auto">
          {e.notes}
        </p>
      )}
      <div className="na-row">
        <OriginPill origin={e.source} />
        <Pill tone={e.reviewStatus === 'confirmed' ? 'ok' : 'warn'}>
          <span aria-hidden="true">{e.reviewStatus === 'confirmed' ? '✓' : '○'}</span> {e.reviewStatus === 'confirmed' ? A.health.common.reviewConfirmed : A.health.common.reviewNeeds}
        </Pill>
        {date && <span className="na-muted">{e.kind === 'condition' ? fill(H.since, { date: formatDate(A.lang, date) }) : formatDate(A.lang, date)}</span>}
      </div>
    </li>
  );
};

export const EntryList: React.FC<{ kind: EntryKind; version: number; onChanged: () => void; toast: ReturnType<typeof useToast>['show'] }> = ({ kind, version, onChanged, toast }) => {
  const A = useA();
  const H = A.health.profile;
  const list = useApiData<Entry[]>(`/api/record/entries?kind=${kind}&v=${version}`);
  const { run } = useMutation();
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  const [asking, setAsking] = useState<Entry | null>(null);

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
      <Card
        title={H.tabs[kind]}
        actions={
          <Button small variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {H.add[kind]}
          </Button>
        }
      >
        <Async state={list.state} onRetry={list.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={H.empty[kind]} body={H.emptyBody} action={<Button variant="primary" onClick={() => setEditing('new')}>{H.add[kind]}</Button>} />}>
          {(items) => (
            <ul className="na-list">
              {items.map((e) => (
                <EntryCard key={e.id} e={e} onEdit={() => setEditing(e)} onDelete={() => setAsking(e)} />
              ))}
            </ul>
          )}
        </Async>
      </Card>
      {editing && (
        <Drawer title={editing === 'new' ? H.newTitle[kind] : H.editTitle[kind]} onClose={() => setEditing(null)}>
          <EntryForm
            kind={kind}
            initial={editing === 'new' ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
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
  const [tab, setTab] = useState<Tab>('condition');
  const [version, setVersion] = useState(0);
  const { toast, show, hide } = useToast();
  const summary = useApiData<PortalSummary>(tab === 'clinicians' ? '/api/portal/summary' : null);

  return (
    <>
      <PageHead title={H.title} subtitle={H.subtitle} />
      <nav className="na-tabs" aria-label={H.title}>
        {[...ENTRY_KINDS, 'clinicians' as const].map((t) => (
          <button key={t} type="button" className="na-tab" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            {H.tabs[t]}
          </button>
        ))}
      </nav>
      {tab === 'clinicians' ? (
        <div className="na-stack">
          <p className="na-muted">{H.clinicianNote}</p>
          <Async state={summary.state} onRetry={summary.reload}>
            {(s) => <SummaryView s={s} />}
          </Async>
          <Card title={A.nav.items.patientMedications}>
            <Timeline endpoint="/api/portal/timeline" audience="patient" types={['prescription']} pageSize={10} />
          </Card>
        </div>
      ) : (
        <EntryList key={tab} kind={tab} version={version} onChanged={() => setVersion((v) => v + 1)} toast={show} />
      )}
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
