import React, { useEffect, useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { Timeline, type TimelineItem } from '../record/Timeline.js';
import { Button, Drawer, Loading, PageHead } from '../ui.js';
import { useA } from '../useA.js';
import { EntryForm, SymptomForm, type Entry, type EntryKind, type SymptomValue } from './forms.js';
import { ConfirmDialog, Toast, useToast } from './kit.js';

const hashParam = (name: string) => {
  const q = window.location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get(name) : null;
};

type Editing = { kind: 'symptom'; id?: string } | { kind: 'entry'; item: TimelineItem } | null;

/** Loads one symptom with its linked documents, then shows the form. */
const SymptomEditor: React.FC<{ id?: string; onDone: () => void; onSaved: () => void }> = ({ id, onDone, onSaved }) => {
  const list = useApiData<SymptomValue[]>(id ? '/api/record/symptoms?limit=200' : null);
  if (id && list.state.status !== 'ready') return <Loading />;
  const initial = id && list.state.status === 'ready' ? list.state.data.find((s) => s.id === id) : undefined;
  return <SymptomForm initial={initial} onCancel={onDone} onSaved={onSaved} />;
};

export const PatientSymptoms: React.FC = () => {
  const A = useA();
  const S = A.health.symptoms;
  const [editing, setEditing] = useState<Editing>(() => (hashParam('new') ? { kind: 'symptom' } : null));
  const [version, setVersion] = useState(0);
  const [asking, setAsking] = useState<TimelineItem | null>(null);
  const { run } = useMutation();
  const { toast, show, hide } = useToast();

  useEffect(() => {
    // Opening the page with ?new=1 (from Today) starts a new symptom once.
    if (hashParam('new')) window.history.replaceState(null, '', '#/patient/timeline');
  }, []);

  const base = (item: TimelineItem) => (item.type === 'symptom_report' ? '/api/record/symptoms' : '/api/record/entries');
  const changed = () => setVersion((v) => v + 1);

  const doDelete = async (item: TimelineItem) => {
    setAsking(null);
    const res = await run(`${base(item)}/${item.source.id}`, 'DELETE');
    if (!res.ok) return show({ text: A.health.common.failed, tone: 'danger' });
    changed();
    show({
      text: item.type === 'symptom_report' ? S.deletedUndo : A.health.common.deleted,
      undo: async () => {
        await run(`${base(item)}/${item.source.id}/restore`, 'POST');
        changed();
      },
    });
  };

  const actions = (item: TimelineItem) =>
    item.type === 'symptom_report' || item.type === 'patient_entry' ? (
      <>
        <Button small variant="quiet" onClick={() => setEditing(item.type === 'symptom_report' ? { kind: 'symptom', id: item.source.id } : { kind: 'entry', item })}>
          {A.health.common.edit}
        </Button>
        <Button small variant="quiet" onClick={() => setAsking(item)}>
          {A.health.common.remove}
        </Button>
      </>
    ) : null;

  const entryInitial = (item: TimelineItem): Partial<Entry> & { id: string } => ({
    id: item.source.id,
    kind: item.data.kind,
    title: item.data.title,
    eventDate: item.occurredAt.slice(0, 10),
    value: item.data.value ?? null,
    unit: item.data.unit ?? null,
    providerName: item.data.providerName ?? null,
    notes: item.data.notes ?? null,
  });

  return (
    <>
      <PageHead
        title={S.title}
        subtitle={S.subtitle}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing({ kind: 'symptom' })}>
            {S.record}
          </Button>
        }
      />
      <Timeline endpoint="/api/portal/timeline" audience="patient" renderActions={actions} reloadKey={version} />

      {editing?.kind === 'symptom' && (
        <Drawer title={editing.id ? S.editTitle : S.newTitle} onClose={() => setEditing(null)}>
          <SymptomEditor
            id={editing.id}
            onDone={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              changed();
              show({ text: S.saved });
            }}
          />
        </Drawer>
      )}
      {editing?.kind === 'entry' && (
        <Drawer title={A.health.profile.editTitle[editing.item.data.kind as EntryKind]} onClose={() => setEditing(null)}>
          <EntryForm
            kind={editing.item.data.kind as EntryKind}
            initial={entryInitial(editing.item)}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              changed();
              show({ text: A.health.common.saved });
            }}
          />
        </Drawer>
      )}
      {asking && <ConfirmDialog title={A.health.common.deleteTitle} body={A.health.common.deleteBody} confirmLabel={A.health.common.remove} danger onConfirm={() => void doDelete(asking)} onClose={() => setAsking(null)} />}
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
