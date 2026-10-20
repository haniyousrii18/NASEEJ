import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate } from '../format.js';
import type { PortalSummary } from '../pages/patient.js';
import { Async, Button, Card, Drawer, EmptyState, Field, Notice, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { ConfirmDialog, Toast, useToast } from './kit.js';
import { SnapshotView, type Snapshot } from './SnapshotView.js';
import { StartPrep, type Prep, type PrepContent, type PrepItem, type PrepSection } from './Visits.js';
import type { VaultDoc } from './Vault.js';

const ORDER = ['symptoms', 'conditions', 'medications', 'allergies', 'procedures', 'measurements', 'documents', 'questions', 'notes'];
const FREE_TEXT = new Set(['questions', 'notes']);

export function toSnapshot(content: PrepContent, visitDate: string | null, patient: Snapshot['patient'], docs: VaultDoc[]): Snapshot {
  return {
    lang: content.lang,
    patient,
    visitDate,
    reason: content.reason,
    overview: content.overview,
    sections: content.sections.filter((s) => s.included && s.items.length > 0 && s.key !== 'documents').map((s) => ({ key: s.key, items: s.items.map((i) => ({ text: i.text, date: i.date, source: i.source.label })) })),
    documents: docs.map((d) => ({ id: d.id, title: d.title, docType: d.docType, providerName: d.providerName, mimeType: d.mimeType, fileSize: d.fileSize, documentDate: d.documentDate })),
  };
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`.replace(/\./g, ''));

const Section: React.FC<{
  section: PrepSection;
  onChange: (s: PrepSection) => void;
  onPickDocs: () => void;
}> = ({ section, onChange, onPickDocs }) => {
  const A = useA();
  const E = A.health.visits.editor;
  const [draft, setDraft] = useState('');
  const title = (E.sections as Record<string, string>)[section.key];
  const isFree = FREE_TEXT.has(section.key);

  const setItem = (id: string, text: string) => onChange({ ...section, items: section.items.map((i) => (i.id === id ? { ...i, text, edited: true } : i)) });
  const removeItem = (id: string) => onChange({ ...section, items: section.items.filter((i) => i.id !== id) });
  const addFree = () => {
    const text = draft.trim();
    if (!text) return;
    const item: PrepItem = { id: newId(), text, date: null, source: { kind: 'patient', ref: null, label: A.health.common.source.patient } };
    onChange({ ...section, included: true, items: [...section.items, item] });
    setDraft('');
  };

  return (
    <Card
      title={title}
      actions={
        <label className="hp-switch">
          <input type="checkbox" checked={section.included} onChange={(e) => onChange({ ...section, included: e.target.checked })} />
          <span>{E.include}</span>
        </label>
      }
      className={section.included ? undefined : 'hp-off'}
    >
      {section.items.length === 0 && !isFree ? <p className="na-muted">{E.emptySection}</p> : null}
      <ul className="na-list">
        {section.items.map((it) => (
          <li key={it.id} className="na-list-item hp-item">
            <textarea
              className="na-textarea hp-item-text"
              dir="auto"
              rows={Math.min(5, Math.max(1, Math.ceil(it.text.length / 60)))}
              aria-label={E.editItem}
              value={it.text}
              maxLength={600}
              onChange={(e) => setItem(it.id, e.target.value)}
            />
            <div className="na-row na-row--between">
              <span className="na-muted">
                {it.source.label}
                {it.date ? ` · ${formatDate(A.lang, it.date)}` : ''}
                {it.edited ? ` · ${E.edited}` : ''}
              </span>
              <Button small variant="quiet" onClick={() => removeItem(it.id)}>
                {E.removeItem}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {isFree && (
        <div className="hp-add">
          <input
            className="na-input"
            dir="auto"
            aria-label={section.key === 'questions' ? E.addQuestion : E.addNote}
            placeholder={E.itemPlaceholder}
            value={draft}
            maxLength={600}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFree();
              }
            }}
          />
          <Button small onClick={addFree} disabled={!draft.trim()}>
            {section.key === 'questions' ? E.addQuestion : E.addNote}
          </Button>
        </div>
      )}
      {section.key === 'documents' && (
        <div>
          <Button small onClick={onPickDocs}>
            {E.chooseDocs}
          </Button>
        </div>
      )}
    </Card>
  );
};

const DocPicker: React.FC<{ chosen: string[]; onSave: (docs: VaultDoc[]) => void; onClose: () => void }> = ({ chosen, onSave, onClose }) => {
  const A = useA();
  const E = A.health.visits.editor;
  const docs = useApiData<VaultDoc[]>('/api/vault/documents?limit=100');
  const [sel, setSel] = useState<string[]>(chosen);
  return (
    <Drawer title={E.chooseDocs} subtitle={E.docsHint} onClose={onClose}>
      <Async state={docs.state} onRetry={docs.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={E.docsNone} />}>
        {(list) => (
          <div className="na-stack">
            <ul className="na-list">
              {list.map((d) => (
                <li key={d.id}>
                  <label className="cg-check">
                    <input type="checkbox" checked={sel.includes(d.id)} onChange={() => setSel((s) => (s.includes(d.id) ? s.filter((x) => x !== d.id) : [...s, d.id]))} />
                    <span dir="auto">
                      <strong>{d.title}</strong>
                      <span className="na-help">{[(A.health.vault.types as Record<string, string>)[d.docType ?? ''], d.documentDate ? formatDate(A.lang, d.documentDate) : ''].filter(Boolean).join(' · ')}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="na-form-actions">
              <Button variant="primary" onClick={() => onSave(list.filter((d) => sel.includes(d.id)))}>
                {A.health.common.done}
              </Button>
              <Button variant="quiet" onClick={onClose}>
                {A.health.common.cancel}
              </Button>
            </div>
          </div>
        )}
      </Async>
    </Drawer>
  );
};

export const PrepEditor: React.FC<{ id: string; navigate: (r: string) => void }> = ({ id, navigate }) => {
  const A = useA();
  const E = A.health.visits.editor;
  const [version, setVersion] = useState(0);
  const loaded = useApiData<Prep>(`/api/prep/${id}?v=${version}`);
  const summary = useApiData<PortalSummary>('/api/portal/summary');
  const ai = useApiData<{ configured: boolean; consent: boolean }>('/api/assistant/status');
  const [content, setContent] = useState<PrepContent | null>(null);
  const [visitDate, setVisitDate] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'approved'>('draft');
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [picking, setPicking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [restart, setRestart] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const { run, pending } = useMutation();
  const { toast, show, hide } = useToast();
  const docsCache = useRef<VaultDoc[]>([]);

  useEffect(() => {
    if (loaded.state.status === 'ready') {
      setContent(loaded.state.data.content);
      setVisitDate(loaded.state.data.visitDate);
      setStatus(loaded.state.data.status);
      setDirty(false);
    }
  }, [loaded.state]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const ordered = useMemo(() => (content ? [...content.sections].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)) : []), [content]);
  const identity = useMemo(() => {
    if (summary.state.status !== 'ready') return null;
    const p = summary.state.data.profile;
    return { name: content?.lang === 'ar' ? p.full_name_ar || p.full_name_en : p.full_name_en || p.full_name_ar, dateOfBirth: p.date_of_birth };
  }, [summary.state, content?.lang]);

  const edit = (next: PrepContent) => {
    setContent(next);
    setDirty(true);
    if (status === 'approved') setStatus('draft');
  };
  const setSection = (s: PrepSection) => content && edit({ ...content, sections: content.sections.map((x) => (x.key === s.key ? s : x)) });

  const save = async (): Promise<boolean> => {
    if (!content) return false;
    setError('');
    const res = await run<Prep>(`/api/prep/${id}`, 'PUT', { content, visit_date: visitDate });
    if (!res.ok) {
      setError(res.error.status === 0 ? A.health.common.offline : res.error.code === 'INVALID_SOURCE' ? E.outdated : res.error.status === 400 ? res.error.message : A.health.common.failed);
      return false;
    }
    setDirty(false);
    setStatus(res.data.status);
    show({ text: A.health.common.saved });
    return true;
  };

  const approve = async () => {
    setApproving(false);
    if (dirty && !(await save())) return;
    const res = await run<Prep>(`/api/prep/${id}/approve`, 'POST', { confirm: true });
    if (!res.ok) return setError(res.error.code === 'PREP_OUTDATED' ? E.outdated : res.error.status === 400 ? res.error.message : E.approveFailed);
    setStatus('approved');
    setVersion((v) => v + 1);
  };

  const pickDocs = (docs: VaultDoc[]) => {
    if (!content) return;
    docsCache.current = docs;
    const sec = content.sections.find((s) => s.key === 'documents')!;
    const items: PrepItem[] = docs.map((d) => {
      const prior = sec.items.find((i) => i.source.ref === d.id);
      return (
        prior ?? {
          id: newId(),
          text: [d.title, (A.health.vault.types as Record<string, string>)[d.docType ?? ''], d.providerName].filter(Boolean).join(' — '),
          date: d.documentDate,
          source: { kind: 'document', ref: d.id, label: A.health.common.source.upload },
        }
      );
    });
    setSection({ ...sec, included: items.length > 0, items });
    setPicking(false);
  };

  const suggest = async () => {
    if (dirty && !(await save())) return;
    setSuggesting(true);
    setSuggestion('');
    const res = await run<{ overview: string }>('/api/assistant/overview', 'POST', { prep_id: id });
    setSuggesting(false);
    if (!res.ok) return setError((A.health.assistant.errors as Record<string, string>)[res.error.code] ?? res.error.message ?? A.health.common.failed);
    setSuggestion(res.data.overview);
  };

  if (loaded.state.status === 'error') {
    return (
      <>
        <PageHead title={E.title} back={{ label: E.back, onClick: () => navigate('patient/visits') }} />
        <Async state={loaded.state} onRetry={loaded.reload}>
          {() => null}
        </Async>
      </>
    );
  }
  if (!content) {
    return (
      <>
        <PageHead title={E.title} back={{ label: E.back, onClick: () => navigate('patient/visits') }} />
        <Async state={loaded.state}>{() => null}</Async>
      </>
    );
  }

  const chosenDocIds = content.sections.find((s) => s.key === 'documents')?.items.map((i) => i.source.ref!).filter(Boolean) ?? [];
  const previewDocs: VaultDoc[] = docsCache.current.filter((d) => chosenDocIds.includes(d.id));
  const snapshot = toSnapshot(content, visitDate, identity, previewDocs.length ? previewDocs : []);
  // Document titles for the preview come from the item text when the picker has not been opened in this session.
  if (snapshot.documents.length === 0 && chosenDocIds.length > 0) {
    const sec = content.sections.find((s) => s.key === 'documents')!;
    snapshot.documents = sec.items.filter((i) => i.source.ref).map((i) => ({ id: i.source.ref!, title: i.text, docType: null, providerName: null, mimeType: '', fileSize: 0, documentDate: i.date }));
  }
  const canSuggest = ai.state.status === 'ready' && ai.state.data.configured && ai.state.data.consent;

  return (
    <>
      <PageHead
        title={E.title}
        subtitle={visitDate ? fill(A.health.visits.forDate, { date: formatDate(A.lang, visitDate) }) : A.health.visits.noVisitDate}
        back={{ label: E.back, onClick: () => navigate('patient/visits') }}
        actions={
          <>
            <Button variant="quiet" onClick={() => setPreview((p) => !p)}>
              {preview ? E.editMode : E.preview}
            </Button>
            {status === 'approved' && !dirty && (
              <Button variant="primary" icon="link" onClick={() => navigate(`patient/sharing?prep=${id}`)}>
                {E.share}
              </Button>
            )}
          </>
        }
      />

      <div className="na-stack">
        <Notice tone={status === 'approved' && !dirty ? 'ok' : 'info'} icon={status === 'approved' && !dirty ? 'check' : 'alert'}>
          {status === 'approved' && !dirty ? E.approvedBanner : E.draftBanner} {E.notDiagnosis}
        </Notice>
        {error && (
          <Notice tone="danger" icon="alert" live>
            {error}
          </Notice>
        )}

        {preview ? (
          <Card title={E.preview}>
            <SnapshotView snapshot={snapshot} />
            <div className="na-form-actions hp-noprint">
              <Button icon="download" onClick={() => window.print()}>
                {A.health.common.print}
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <Card title={E.reason}>
              <Field label={E.reason} htmlFor="pe-reason">
                <textarea id="pe-reason" className="na-textarea" dir="auto" rows={2} maxLength={500} value={content.reason} onChange={(e) => edit({ ...content, reason: e.target.value })} />
              </Field>
            </Card>
            <Card title={E.overview} hint={E.overviewHelp}>
              <Field label={E.overview} htmlFor="pe-overview">
                <textarea id="pe-overview" className="na-textarea" dir="auto" rows={3} maxLength={1500} value={content.overview} onChange={(e) => edit({ ...content, overview: e.target.value })} />
              </Field>
              <div className="na-row">
                <Button small onClick={() => void suggest()} disabled={!canSuggest || suggesting || pending}>
                  {suggesting ? E.suggesting : E.suggest}
                </Button>
                {!canSuggest && <span className="na-help">{E.suggestNeedsAi}</span>}
              </div>
              {suggestion && (
                <div className="hp-suggest">
                  <Pill tone="warn">{E.suggestion}</Pill>
                  <p dir="auto">{suggestion}</p>
                  <div className="na-row">
                    <Button
                      small
                      variant="primary"
                      onClick={() => {
                        edit({ ...content, overview: suggestion });
                        setSuggestion('');
                      }}
                    >
                      {E.useSuggestion}
                    </Button>
                    <Button small variant="quiet" onClick={() => setSuggestion('')}>
                      {E.discard}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
            {ordered.map((s) => (
              <Section key={s.key} section={s} onChange={setSection} onPickDocs={() => setPicking(true)} />
            ))}
          </>
        )}

        <div className="hp-savebar hp-noprint">
          {dirty && <span className="na-help" role="status">{E.unsaved}</span>}
          <Button onClick={() => void save()} disabled={!dirty || pending}>
            {pending ? A.health.common.saving : E.save}
          </Button>
          <Button variant="primary" onClick={() => setApproving(true)} disabled={pending || (status === 'approved' && !dirty)}>
            {E.approve}
          </Button>
          <Button variant="quiet" onClick={() => setRestart(true)}>
            {E.startOver}
          </Button>
        </div>
      </div>

      {picking && <DocPicker chosen={chosenDocIds} onSave={pickDocs} onClose={() => setPicking(false)} />}
      {approving && <ConfirmDialog title={E.approveTitle} body={E.approveBody} requireCheck={E.approveCheck} confirmLabel={E.approveConfirm} onConfirm={() => void approve()} onClose={() => setApproving(false)} />}
      {restart && (
        <Drawer title={E.startOver} subtitle={E.startOverBody} onClose={() => setRestart(false)}>
          <StartPrep
            presetDate={visitDate ?? undefined}
            onCancel={() => setRestart(false)}
            onCreated={async (newId2) => {
              await run(`/api/prep/${id}`, 'DELETE');
              navigate(`patient/visits/prep/${newId2}`);
            }}
          />
        </Drawer>
      )}
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
