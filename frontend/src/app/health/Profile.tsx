import React, { useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate } from '../format.js';
import { Timeline } from '../record/Timeline.js';
import { SummaryView, type PortalSummary } from '../pages/patient.js';
import { Async, Button, Card, Drawer, EmptyState, PageHead } from '../ui.js';
import { useA } from '../useA.js';
import { ENTRY_KINDS, EntryForm, type Entry, type EntryKind } from './forms.js';
import { ConfirmDialog, SourceLine, Toast, useToast } from './kit.js';

type Tab = EntryKind | 'clinicians';

/** One health fact: what it is, the few details that matter, and where it came from as a quiet line. */
const EntryRow: React.FC<{ e: Entry; onEdit: () => void; onDelete: () => void }> = ({ e, onEdit, onDelete }) => {
  const A = useA();
  const H = A.health.profile;
  const date = e.kind === 'condition' || e.kind === 'medication' ? e.startDate : e.eventDate;
  const status = e.kind === 'condition' || e.kind === 'medication' ? (e.status === 'past' ? H.fields.past[e.kind] : H.fields.active[e.kind]) : null;
  const details = [e.dose, e.frequency, e.reaction, e.severity ? H.fields.sev[e.severity] : null, e.value ? `${e.value}${e.unit ? ` ${e.unit}` : ''}` : null, e.providerName, status].filter(Boolean) as string[];
  return (
    <li className="hp-entry">
      <div className="hp-entry-main">
        <strong dir="auto" className="hp-entry-title">
          {e.title}
        </strong>
        {details.length > 0 && <span dir="auto">{details.join(' · ')}</span>}
        {e.notes && (
          <span className="na-muted" dir="auto">
            {e.notes}
          </span>
        )}
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
    </li>
  );
};

export const EntryList: React.FC<{ kind: EntryKind; version: number; adding: boolean; onAddClose: () => void; onAdd: () => void; onChanged: () => void; toast: ReturnType<typeof useToast>['show'] }> = ({ kind, version, adding, onAddClose, onAdd, onChanged, toast }) => {
  const A = useA();
  const H = A.health.profile;
  const list = useApiData<Entry[]>(`/api/record/entries?kind=${kind}&v=${version}`);
  const { run } = useMutation();
  const [editing, setEditing] = useState<Entry | null>(null);
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
      <Async
        state={list.state}
        onRetry={list.reload}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            title={H.empty[kind]}
            body={H.emptyBody}
          />
        }
      >
        {(items) => (
          <Card flat>
            <ul className="hp-entries">
              {items.map((e) => (
                <EntryRow key={e.id} e={e} onEdit={() => setEditing(e)} onDelete={() => setAsking(e)} />
              ))}
            </ul>
          </Card>
        )}
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
  const [tab, setTab] = useState<Tab>('condition');
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
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
      <nav className="na-tabs" aria-label={H.title}>
        {[...ENTRY_KINDS, 'clinicians' as const].map((t) => (
          <button key={t} type="button" className="na-tab" aria-current={tab === t ? 'page' : undefined} onClick={() => { setTab(t); setAdding(false); }}>
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
