import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData, useDownload, useMutation } from '../api.js';
import { fill, formatBytes, formatDate, todayIso } from '../format.js';
import { Async, Button, Card, Drawer, EmptyState, Field, Notice, PageHead, Pill, Select } from '../ui.js';
import { useA } from '../useA.js';
import { ENTRY_KINDS, type EntryKind } from './forms.js';
import { FilterBar } from './filters.js';
import { ConfirmDialog, MAX_BYTES, OriginPill, Toast, shrinkImage, toBase64, useToast } from './kit.js';

export interface VaultDoc {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  docType: string | null;
  providerName: string | null;
  sourceType: string;
  center: { id: string; name_ar: string; name_en: string } | null;
  documentDate: string | null;
  createdAt: string;
  deletedAt: string | null;
  aiAllowed: boolean;
  aiStatus: 'queued' | 'processing' | 'failed' | 'completed' | null;
  aiError: string | null;
  suggestedType: string | null;
  openSuggestions: number;
  links: Array<{ type: string; id: string }>;
}

const DOC_TYPES = ['lab_report', 'imaging_report', 'prescription', 'discharge_summary', 'clinical_note', 'referral', 'vaccination_record', 'administrative', 'other'] as const;
const hashParam = (name: string) => {
  const q = window.location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get(name) : null;
};

/** XHR so the upload can report progress; the bearer token stays in the Authorization header. */
function post(url: string, body: unknown, headers: Record<string, string>, onProgress: (pct: number) => void): Promise<{ ok: boolean; status: number; data?: any }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    xhr.onload = () => {
      let json: any = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* gateway error or empty body */
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300 && json?.success !== false, status: xhr.status, data: json?.data });
    };
    xhr.send(JSON.stringify(body));
  });
}

interface AiInfo {
  configured: boolean;
  provider: string | null;
}

const Upload: React.FC<{ ai: AiInfo; onUploaded: () => void; onCancel: () => void }> = ({ ai, onUploaded, onCancel }) => {
  const A = useA();
  const V = A.health.vault;
  const { token } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState({ title: '', type: '', date: todayIso(), provider: '' });
  const [allowAi, setAllowAi] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const pending = progress !== null;

  const choose = async (f: File | undefined) => {
    setMsg(null);
    setFileError('');
    if (!f) return setFile(null);
    if (f.type && !['application/pdf', 'image/png', 'image/jpeg'].includes(f.type)) return setFileError(V.badType);
    const small = await shrinkImage(f);
    if (small.size > MAX_BYTES) return setFileError(V.tooBig);
    setFile(small);
    setV((s) => ({ ...s, title: s.title || small.name.replace(/\.\w+$/, '') }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setFileError(V.chooseFile);
    setMsg(null);
    setProgress(0);
    const body = {
      file_name: file.name,
      content_base64: await toBase64(file),
      title: v.title.trim() || undefined,
      doc_type: v.type || undefined,
      document_date: v.date || undefined,
      provider_name: v.provider.trim() || undefined,
      ai_processing_allowed: allowAi && ai.configured,
    };
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await post('/api/vault/documents', body, headers, setProgress);
    setProgress(null);
    if (!res.ok) return setMsg({ tone: 'danger', text: res.status === 415 ? V.badType : res.status === 413 ? V.tooBig : res.status === 0 ? A.health.common.offline : V.uploadFailed });
    setMsg({ tone: 'ok', text: V.uploaded });
    onUploaded();
  };

  return (
    <Card title={V.add}>
      <form className="na-form na-form--stack" onSubmit={submit} noValidate>
        <Field label={V.file} htmlFor="vd-file" help={V.fileHelp} required error={fileError}>
          <div className="na-row">
            <input id="vd-file" ref={input} type="file" className="hp-visually-hidden" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(e) => void choose(e.target.files?.[0])} />
            <Button small icon="upload" onClick={() => input.current?.click()}>
              {V.pick}
            </Button>
            <label className="na-btn na-btn--small" style={{ cursor: 'pointer' }}>
              {V.capture}
              <input type="file" className="hp-visually-hidden" accept="image/*" capture="environment" onChange={(e) => void choose(e.target.files?.[0])} />
            </label>
          </div>
          {file && (
            <p className="na-help" dir="auto">
              {fill(V.chosen, { name: file.name })} · {formatBytes(file.size)}
            </p>
          )}
        </Field>
        <Field label={V.title_} htmlFor="vd-title" help={V.titleHelp}>
          <input id="vd-title" className="na-input" dir="auto" maxLength={255} value={v.title} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} />
        </Field>
        <Field label={V.type} htmlFor="vd-type">
          <Select id="vd-type" className="na-select" value={v.type} onChange={(e) => setV((s) => ({ ...s, type: e.target.value }))}>
            <option value="">{V.typeAny}</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {V.types[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={V.date} htmlFor="vd-date">
          <input id="vd-date" type="date" className="na-input" max={todayIso()} value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} />
        </Field>
        <Field label={V.provider} htmlFor="vd-provider">
          <input id="vd-provider" className="na-input" dir="auto" maxLength={200} value={v.provider} onChange={(e) => setV((s) => ({ ...s, provider: e.target.value }))} />
        </Field>
        <div className="na-form-span-all">
          <label className="cg-check">
            <input type="checkbox" checked={allowAi && ai.configured} disabled={!ai.configured} onChange={(e) => setAllowAi(e.target.checked)} />
            <span>
              <strong>{V.ai}</strong>
              <span className="na-help">{ai.configured ? fill(V.aiOn, { provider: ai.provider ?? '' }) : V.aiOff}</span>
            </span>
          </label>
        </div>
        {pending && (
          <div className="up-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} aria-label={fill(V.uploading, { n: progress ?? 0 })}>
            <span style={{ inlineSize: `${progress}%` }} />
            <small>{fill(V.uploading, { n: progress ?? 0 })}</small>
          </div>
        )}
        {msg && (
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        )}
        <div className="na-form-actions">
          <Button type="submit" variant="primary" icon="upload" disabled={pending}>
            {V.upload}
          </Button>
          <Button variant="quiet" onClick={onCancel} disabled={pending}>
            {A.health.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
};

// ---------------------------------------------------------------- details drawer

const EditDoc: React.FC<{ doc: VaultDoc; onDone: () => void; onSaved: () => void }> = ({ doc, onDone, onSaved }) => {
  const A = useA();
  const V = A.health.vault;
  const { run, pending } = useMutation();
  const [v, setV] = useState({ title: doc.title, type: doc.docType ?? '', date: doc.documentDate ?? '', provider: doc.providerName ?? '' });
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run(`/api/vault/documents/${doc.id}`, 'PATCH', { title: v.title.trim() || null, doc_type: v.type || null, document_date: v.date || null, provider_name: v.provider.trim() || null });
    if (!res.ok) return setError(res.error.status === 0 ? A.health.common.offline : A.health.common.failed);
    onSaved();
  };
  return (
    <form className="na-form na-form--stack" onSubmit={submit}>
      <Field label={V.title_} htmlFor="de-title">
        <input id="de-title" className="na-input" dir="auto" maxLength={255} value={v.title} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} />
      </Field>
      <Field label={V.type} htmlFor="de-type">
        <Select id="de-type" className="na-select" value={v.type} onChange={(e) => setV((s) => ({ ...s, type: e.target.value }))}>
          <option value="">{V.typeAny}</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {V.types[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={V.date} htmlFor="de-date">
        <input id="de-date" type="date" className="na-input" max={todayIso()} value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} />
      </Field>
      <Field label={V.provider} htmlFor="de-provider">
        <input id="de-provider" className="na-input" dir="auto" maxLength={200} value={v.provider} onChange={(e) => setV((s) => ({ ...s, provider: e.target.value }))} />
      </Field>
      {error && (
        <Notice tone="danger" icon="alert" live>
          {error}
        </Notice>
      )}
      <div className="na-form-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? A.health.common.saving : A.health.common.save}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          {A.health.common.cancel}
        </Button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------- AI suggestions the patient confirms or dismisses

interface Fact {
  id: string;
  kind: string;
  label: string;
  value: string | null;
  unit: string | null;
  date: string | null;
  page: number | null;
  passage: string | null;
  confidence: number | null;
}

const DEFAULT_KIND: Record<string, EntryKind> = { condition: 'condition', medication: 'medication', allergy: 'allergy', procedure: 'procedure', lab_value: 'measurement' };

const FactRow: React.FC<{ docId: string; fact: Fact; onDone: (msg: string) => void }> = ({ docId, fact, onDone }) => {
  const A = useA();
  const V = A.health.vault;
  const { run, pending } = useMutation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EntryKind>(DEFAULT_KIND[fact.kind] ?? 'measurement');
  const [v, setV] = useState({ title: fact.label, value: fact.value ?? '', unit: fact.unit ?? '', date: fact.date ?? '' });
  const [error, setError] = useState('');

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { kind, title: v.title.trim(), date: v.date || undefined };
    if (kind === 'measurement') Object.assign(body, { value: v.value.trim() || undefined, unit: v.unit.trim() || undefined });
    if (kind === 'medication' && v.value.trim()) body.dose = `${v.value.trim()}${v.unit.trim() ? ` ${v.unit.trim()}` : ''}`;
    const res = await run(`/api/vault/documents/${docId}/suggestions/${fact.id}/confirm`, 'POST', body);
    if (!res.ok) return setError(res.error.status === 400 ? res.error.message : A.health.common.failed);
    onDone(V.sugAdded);
  };
  const dismiss = async () => {
    const res = await run(`/api/vault/documents/${docId}/suggestions/${fact.id}/dismiss`, 'POST');
    if (!res.ok) return setError(A.health.common.failed);
    onDone(V.sugDismissed);
  };

  return (
    <li className="na-list-item hp-suggestion">
      <div className="na-row">
        <OriginPill origin="ai_suggestion" />
        <Pill>{V.kinds[(DEFAULT_KIND[fact.kind] ?? 'measurement') as EntryKind]}</Pill>
        {fact.page && <span className="na-muted">{fill(V.sugPage, { n: fact.page })}</span>}
      </div>
      <strong dir="auto">{fact.label}</strong>
      {(fact.value || fact.unit) && (
        <p dir="auto">
          {fact.value} {fact.unit}
        </p>
      )}
      {fact.passage && (
        <blockquote className="hp-quote" dir="auto">
          {fact.passage}
        </blockquote>
      )}
      {!open ? (
        <div className="na-row">
          <Button small variant="primary" onClick={() => setOpen(true)} disabled={pending}>
            {V.sugAdd}
          </Button>
          <Button small variant="quiet" onClick={() => void dismiss()} disabled={pending}>
            {V.sugDismiss}
          </Button>
        </div>
      ) : (
        <form className="na-form na-form--stack" onSubmit={confirm}>
          <Field label={V.sugAsKind} htmlFor={`sk-${fact.id}`}>
            <Select id={`sk-${fact.id}`} className="na-select" value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
              {ENTRY_KINDS.filter((k) => k !== 'visit').map((k) => (
                <option key={k} value={k}>
                  {V.kinds[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={A.health.profile.fields.title[kind]} htmlFor={`st-${fact.id}`}>
            <input id={`st-${fact.id}`} className="na-input" dir="auto" value={v.title} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} />
          </Field>
          {(kind === 'measurement' || kind === 'medication') && (
            <>
              <Field label={A.health.profile.fields.value} htmlFor={`sv-${fact.id}`}>
                <input id={`sv-${fact.id}`} className="na-input na-ltr" value={v.value} onChange={(e) => setV((s) => ({ ...s, value: e.target.value }))} />
              </Field>
              <Field label={A.health.profile.fields.unit} htmlFor={`su-${fact.id}`}>
                <input id={`su-${fact.id}`} className="na-input na-ltr" value={v.unit} onChange={(e) => setV((s) => ({ ...s, unit: e.target.value }))} />
              </Field>
            </>
          )}
          <Field label={A.health.profile.fields.eventDate} htmlFor={`sd-${fact.id}`}>
            <input id={`sd-${fact.id}`} type="date" className="na-input" max={todayIso()} value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} />
          </Field>
          {error && (
            <Notice tone="danger" icon="alert" live>
              {error}
            </Notice>
          )}
          <div className="na-form-actions">
            <Button type="submit" variant="primary" disabled={pending}>
              {V.sugConfirm}
            </Button>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              {A.health.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
};

const Suggestions: React.FC<{ doc: VaultDoc; onChanged: () => void }> = ({ doc, onChanged }) => {
  const A = useA();
  const V = A.health.vault;
  const [version, setVersion] = useState(0);
  const data = useApiData<{ status: string | null; error: string | null; suggestedType: string | null; facts: Fact[] }>(`/api/vault/documents/${doc.id}/suggestions?v=${version}`);
  const { run } = useMutation();
  const [note, setNote] = useState('');

  const useType = async (t: string) => {
    const res = await run(`/api/vault/documents/${doc.id}`, 'PATCH', { doc_type: t });
    if (res.ok) {
      setNote(A.health.common.saved);
      onChanged();
    }
  };
  return (
    <div className="na-stack">
      <Notice tone="warn" icon="alert">
        {V.sugNote}
      </Notice>
      {note && (
        <Notice tone="ok" live>
          {note}
        </Notice>
      )}
      <Async state={data.state} onRetry={data.reload}>
        {(d) => (
          <>
            {d.status === 'processing' || d.status === 'queued' ? <Notice tone="info">{V.sugPending}</Notice> : null}
            {d.suggestedType && DOC_TYPES.includes(d.suggestedType as (typeof DOC_TYPES)[number]) && d.suggestedType !== doc.docType && (
              <div className="na-row">
                <Pill tone="warn">{fill(V.sugType, { type: V.types[d.suggestedType as (typeof DOC_TYPES)[number]] })}</Pill>
                <Button small onClick={() => void useType(d.suggestedType!)}>
                  {V.sugUseType}
                </Button>
              </div>
            )}
            {d.facts.length === 0 && d.status !== 'processing' && d.status !== 'queued' ? (
              <EmptyState title={V.sugNone} />
            ) : (
              <ul className="na-list">
                {d.facts.map((f) => (
                  <FactRow
                    key={f.id}
                    docId={doc.id}
                    fact={f}
                    onDone={(m) => {
                      setNote(m);
                      setVersion((x) => x + 1);
                      onChanged();
                    }}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </Async>
    </div>
  );
};

// ---------------------------------------------------------------- one document

const AI_TONE = { queued: 'info', processing: 'info', failed: 'danger', completed: 'ok' } as const;

const DocCard: React.FC<{ doc: VaultDoc; ai: AiInfo; trash: boolean; onChanged: () => void; toast: ReturnType<typeof useToast>['show'] }> = ({ doc, ai, trash, onChanged, toast }) => {
  const A = useA();
  const V = A.health.vault;
  const download = useDownload();
  const { run, pending } = useMutation();
  const [panel, setPanel] = useState<'edit' | 'suggestions' | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [askAi, setAskAi] = useState(false);

  const open = async () => {
    const failure = await download(doc.id, doc.fileName);
    if (failure) toast({ text: V.downloadFailed, tone: 'danger' });
  };
  const remove = async () => {
    setAskDelete(false);
    const res = await run(`/api/vault/documents/${doc.id}`, 'DELETE');
    if (!res.ok) return toast({ text: A.health.common.failed, tone: 'danger' });
    onChanged();
    toast({
      text: V.deletedUndo,
      undo: async () => {
        await run(`/api/vault/documents/${doc.id}/restore`, 'POST');
        onChanged();
      },
    });
  };
  const restore = async () => {
    const res = await run(`/api/vault/documents/${doc.id}/restore`, 'POST');
    toast(res.ok ? { text: A.health.common.restored } : { text: A.health.common.failed, tone: 'danger' });
    onChanged();
  };
  const analyze = async () => {
    setAskAi(false);
    const res = await run(`/api/vault/documents/${doc.id}/analyze`, 'POST', { confirm: true });
    if (!res.ok) toast({ text: res.error.code === 'AI_NOT_CONFIGURED' ? V.aiOff : res.error.status === 409 ? V.ai_states.processing : A.health.common.failed, tone: 'danger' });
    onChanged();
  };

  const failedText = doc.aiError ? (V.aiError as Record<string, string>)[doc.aiError] ?? V.aiError.default : V.aiError.default;
  const mine = doc.sourceType === 'patient_uploaded';

  return (
    <li className="hp-doc">
      <div className="hp-doc-main">
        <strong dir="auto" className="hp-entry-title">
          {doc.title}
        </strong>
        <span className="na-muted" dir="auto">
          {[doc.docType ? (V.types as Record<string, string>)[doc.docType] ?? doc.docType : null, doc.documentDate ? formatDate(A.lang, doc.documentDate) : formatDate(A.lang, doc.createdAt), doc.providerName, formatBytes(doc.fileSize)].filter(Boolean).join(' · ')}
        </span>
        <span className="hp-source">
          {mine ? <span>{V.byMe}</span> : <OriginPill origin="clinician" />}
          {doc.center && <span>{A.lang === 'ar' ? doc.center.name_ar : doc.center.name_en}</span>}
          {doc.aiStatus && <Pill tone={AI_TONE[doc.aiStatus]}>{V.ai_states[doc.aiStatus]}</Pill>}
        </span>
        {doc.aiStatus === 'failed' && (
          <Notice tone="danger" icon="alert" live>
            {failedText}
          </Notice>
        )}
      </div>
      <div className="hp-doc-actions">
        {trash ? (
          <Button small variant="primary" onClick={() => void restore()} disabled={pending}>
            {A.health.common.restore}
          </Button>
        ) : (
          <>
            {doc.openSuggestions > 0 && (
              <Button small variant="primary" onClick={() => setPanel('suggestions')}>
                {fill(V.reviewSuggestions, { n: doc.openSuggestions })}
              </Button>
            )}
            <Button small icon="download" onClick={() => void open()}>
              {V.original}
            </Button>
            {mine && (
              <Button small variant="quiet" onClick={() => setPanel('edit')}>
                {V.details}
              </Button>
            )}
            {mine && ai.configured && (!doc.aiStatus || doc.aiStatus === 'failed') && (
              <Button small variant="quiet" onClick={() => setAskAi(true)} disabled={pending}>
                {doc.aiStatus === 'failed' ? V.analyzeAgain : V.analyze}
              </Button>
            )}
            {mine && (
              <Button small variant="quiet" onClick={() => setAskDelete(true)}>
                {A.health.common.remove}
              </Button>
            )}
          </>
        )}
      </div>
      {panel === 'edit' && (
        <Drawer title={V.details} onClose={() => setPanel(null)}>
          <EditDoc
            doc={doc}
            onDone={() => setPanel(null)}
            onSaved={() => {
              setPanel(null);
              onChanged();
              toast({ text: A.health.common.saved });
            }}
          />
        </Drawer>
      )}
      {panel === 'suggestions' && (
        <Drawer title={V.sugTitle} subtitle={doc.title} onClose={() => setPanel(null)}>
          <Suggestions doc={doc} onChanged={onChanged} />
        </Drawer>
      )}
      {askDelete && <ConfirmDialog title={A.health.common.deleteTitle} body={A.health.common.deleteBody} confirmLabel={A.health.common.remove} danger onConfirm={() => void remove()} onClose={() => setAskDelete(false)} />}
      {askAi && <ConfirmDialog title={V.analyze} body={fill(V.analyzeConfirm, { provider: ai.provider ?? '' })} confirmLabel={V.analyzeYes} onConfirm={() => void analyze()} onClose={() => setAskAi(false)} />}
    </li>
  );
};

// ---------------------------------------------------------------- page

export const PatientVault: React.FC = () => {
  const A = useA();
  const V = A.health.vault;
  const [adding, setAdding] = useState(() => !!hashParam('new'));
  const [trash, setTrash] = useState(() => hashParam('trash') === '1');
  const [version, setVersion] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { toast, show, hide } = useToast();

  useEffect(() => {
    if (hashParam('new') || hashParam('trash')) window.history.replaceState(null, '', '#/patient/documents');
  }, []);

  const path = useMemo(() => {
    const p = new URLSearchParams({ limit: '100' });
    if (q.trim()) p.set('q', q.trim());
    if (type) p.set('type', type);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (trash) p.set('trash', '1');
    p.set('v', String(version));
    return `/api/vault/documents?${p.toString()}`;
  }, [q, type, from, to, trash, version]);

  const docs = useApiData<VaultDoc[]>(path);
  const aiInfo = useApiData<{ configured: boolean; provider: string | null }>('/api/documents/ai/status');
  const ai: AiInfo = aiInfo.state.status === 'ready' ? aiInfo.state.data : { configured: false, provider: null };
  const reload = docs.reload;

  // While any document is being read, check again every few seconds so the state is never stale.
  const working = docs.state.status === 'ready' && docs.state.data.some((d) => d.aiStatus === 'processing' || d.aiStatus === 'queued');
  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(() => void reload(), 4000);
    return () => window.clearInterval(t);
  }, [working, reload]);

  const changed = () => setVersion((v) => v + 1);

  return (
    <>
      <PageHead
        title={V.title}
        subtitle={V.subtitle}
        actions={
          !trash && (
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              {V.add}
            </Button>
          )
        }
      />
      <div className="na-stack">
        {adding && !trash && (
          <Upload
            ai={ai}
            onCancel={() => setAdding(false)}
            onUploaded={() => {
              setAdding(false);
              changed();
              show({ text: V.uploaded });
            }}
          />
        )}
        <Card title={trash ? V.trash : undefined}>
          {!trash && (
            <FilterBar
              search={{ id: 'vl-q', label: V.search, placeholder: V.searchShort, value: q, onChange: setQ }}
              open={filtersOpen}
              onToggle={() => setFiltersOpen((o) => !o)}
              onReset={() => {
                setQ('');
                setType('');
                setFrom('');
                setTo('');
              }}
              active={[
                ...(type ? [{ key: 'type', label: (V.types as Record<string, string>)[type] ?? type, onRemove: () => setType('') }] : []),
                ...(from ? [{ key: 'from', label: `${V.from}: ${formatDate(A.lang, from)}`, onRemove: () => setFrom('') }] : []),
                ...(to ? [{ key: 'to', label: `${V.to}: ${formatDate(A.lang, to)}`, onRemove: () => setTo('') }] : []),
              ]}
            >
              <Field label={V.type} htmlFor="vl-type">
                <Select id="vl-type" className="na-select" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">{V.allTypes}</option>
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {V.types[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset className="hp-fieldset">
                <legend>{A.health.common.dateRange}</legend>
                <div className="hp-pair">
                  <Field label={V.from} htmlFor="vl-from">
                    <input id="vl-from" type="date" className="na-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label={V.to} htmlFor="vl-to">
                    <input id="vl-to" type="date" className="na-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                </div>
              </fieldset>
            </FilterBar>
          )}
          <Async
            state={docs.state}
            onRetry={docs.reload}
            isEmpty={(d) => d.length === 0}
            empty={
              trash ? (
                <EmptyState title={V.trashEmpty} />
              ) : q || type || from || to ? (
                <EmptyState title={V.noMatch} />
              ) : (
                <EmptyState title={V.empty} body={V.emptyBody} />
              )
            }
          >
            {(items) => (
              <ul className="hp-docs">
                {items.map((d) => (
                  <DocCard key={d.id} doc={d} ai={ai} trash={trash} onChanged={changed} toast={show} />
                ))}
              </ul>
            )}
          </Async>
        </Card>
        <div>
          <Button small variant="quiet" onClick={() => setTrash((t) => !t)}>
            {trash ? V.back : V.trash}
          </Button>
        </div>
      </div>
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
