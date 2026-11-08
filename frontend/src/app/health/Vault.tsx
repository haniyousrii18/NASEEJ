import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { failureMsg } from '../errors.js';
import { useMsg, useMsgState, type Msg } from '../useMsg.js';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData, useDownload, useMutation } from '../api.js';
import { fill, formatBytes, formatDate, localeOf, todayIso } from '../format.js';
import { AppIcon, type IconName } from '../AppIcons.js';
import { Reveal } from '../../components/motion.js';
import { Async, Button, Drawer, EmptyState, Field, Notice, PageHead, Pill, Select } from '../ui.js';
import { useA } from '../useA.js';
import { ENTRY_KINDS, type EntryKind } from './forms.js';
import { ConfirmDialog, MAX_BYTES, OriginPill, Toast, shrinkImage, toBase64, useToast } from './kit.js';
import { UserText } from '../translate/UserText.js';
import { DatePicker } from '../DatePicker.js';

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
  const [msg, setMsgState] = useState<{ tone: 'ok' | 'danger'; text: Msg } | null>(null);
  const say = useMsg();
  const setMsg = setMsgState;
  const [fileError, setFileError] = useMsgState();
  const pending = progress !== null;

  const choose = async (f: File | undefined) => {
    setMsg(null);
    setFileError('');
    if (!f) return setFile(null);
    if (f.type && !['application/pdf', 'image/png', 'image/jpeg'].includes(f.type)) return setFileError((X) => X.health.vault.badType);
    const small = await shrinkImage(f);
    if (small.size > MAX_BYTES) return setFileError((X) => X.health.vault.tooBig);
    setFile(small);
    setV((s) => ({ ...s, title: s.title || small.name.replace(/\.\w+$/, '') }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setFileError((X) => X.health.vault.chooseFile);
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
    if (!res.ok) return setMsg({ tone: 'danger', text: (X) => (res.status === 415 ? X.health.vault.badType : res.status === 413 ? X.health.vault.tooBig : res.status === 0 ? X.health.common.offline : X.health.vault.uploadFailed) });
    setMsg({ tone: 'ok', text: (X) => X.health.vault.uploaded });
    onUploaded();
  };

  return (
    <>
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
              {fill(V.chosen, { name: file.name })} · {formatBytes(file.size, A.lang)}
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
          <DatePicker id="vd-date" max={todayIso()} value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} />
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
            {say(msg.text)}
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
    </>
  );
};

// ---------------------------------------------------------------- details drawer

const EditDoc: React.FC<{ doc: VaultDoc; onDone: () => void; onSaved: () => void }> = ({ doc, onDone, onSaved }) => {
  const A = useA();
  const V = A.health.vault;
  const { run, pending } = useMutation();
  const [v, setV] = useState({ title: doc.title, type: doc.docType ?? '', date: doc.documentDate ?? '', provider: doc.providerName ?? '' });
  const [error, setError] = useMsgState();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run(`/api/vault/documents/${doc.id}`, 'PATCH', { title: v.title.trim() || null, doc_type: v.type || null, document_date: v.date || null, provider_name: v.provider.trim() || null });
    if (!res.ok) return setError((X) => (res.error.status === 0 ? X.health.common.offline : X.health.common.failed));
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
        <DatePicker id="de-date" max={todayIso()} value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} />
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

const FactRow: React.FC<{ docId: string; fact: Fact; onDone: (msg: Msg) => void }> = ({ docId, fact, onDone }) => {
  const A = useA();
  const V = A.health.vault;
  const { run, pending } = useMutation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EntryKind>(DEFAULT_KIND[fact.kind] ?? 'measurement');
  const [v, setV] = useState({ title: fact.label, value: fact.value ?? '', unit: fact.unit ?? '', date: fact.date ?? '' });
  const [error, setError] = useMsgState();

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { kind, title: v.title.trim(), date: v.date || undefined };
    if (kind === 'measurement') Object.assign(body, { value: v.value.trim() || undefined, unit: v.unit.trim() || undefined });
    if (kind === 'medication' && v.value.trim()) body.dose = `${v.value.trim()}${v.unit.trim() ? ` ${v.unit.trim()}` : ''}`;
    const res = await run(`/api/vault/documents/${docId}/suggestions/${fact.id}/confirm`, 'POST', body);
    if (!res.ok) return setError(failureMsg(res.error));
    onDone((X) => X.health.vault.sugAdded);
  };
  const dismiss = async () => {
    const res = await run(`/api/vault/documents/${docId}/suggestions/${fact.id}/dismiss`, 'POST');
    if (!res.ok) return setError((X) => X.health.common.failed);
    onDone((X) => X.health.vault.sugDismissed);
  };

  return (
    <li className="na-list-item hp-suggestion">
      <div className="na-row">
        <OriginPill origin="ai_suggestion" />
        <Pill>{V.kinds[(DEFAULT_KIND[fact.kind] ?? 'measurement') as EntryKind]}</Pill>
        {fact.page && <span className="na-muted">{fill(V.sugPage, { n: fact.page })}</span>}
      </div>
      <strong dir="auto"><UserText text={fact.label} /></strong>
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
            <DatePicker id={`sd-${fact.id}`} max={todayIso()} value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} />
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
  const [note, setNote] = useMsgState();

  const useType = async (t: string) => {
    const res = await run(`/api/vault/documents/${doc.id}`, 'PATCH', { doc_type: t });
    if (res.ok) {
      setNote((X) => X.health.common.saved);
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

const DocCard: React.FC<{ doc: VaultDoc; ai: AiInfo; trash: boolean; index: number; onChanged: () => void; toast: ReturnType<typeof useToast>['show'] }> = ({ doc, ai, trash, index, onChanged, toast }) => {
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
    <Reveal as="li" y={10} i={index % 4} className="hp-doc" data-type={doc.docType ?? 'other'}>
      <span className="hp-doc-ico" aria-hidden="true">
        <AppIcon name={TYPE_ICON[doc.docType ?? 'other'] ?? 'documents'} size={22} />
      </span>
      <div className="hp-doc-main">
        <strong dir="auto" className="hp-doc-title">
          <UserText text={doc.title} />
        </strong>
        <span className="hp-doc-meta" dir="auto">
          {[
            <span key="type" className="hp-doc-type">{(V.types as Record<string, string>)[doc.docType ?? 'other'] ?? V.types.other}</span>,
            doc.providerName ? <UserText key="provider" text={doc.providerName} /> : null,
            doc.center ? <span key="center">{A.lang === 'ar' ? doc.center.name_ar : doc.center.name_en}</span> : null,
          ]
            .filter(Boolean)
            .map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="hp-doc-dot" aria-hidden="true">·</span>}
                {part}
              </React.Fragment>
            ))}
        </span>
        <span className="hp-doc-tags">
          {mine ? <span className="hp-doc-origin">{V.byMe}</span> : <OriginPill origin="clinician" />}
          {doc.aiStatus && <Pill tone={AI_TONE[doc.aiStatus]}>{V.ai_states[doc.aiStatus]}</Pill>}
          {doc.openSuggestions > 0 && !trash && (
            <button type="button" className="hp-doc-review" onClick={() => setPanel('suggestions')}>
              {fill(V.library.toReview, { n: doc.openSuggestions })}
            </button>
          )}
        </span>
        {doc.aiStatus === 'failed' && (
          <Notice tone="danger" icon="alert" live>
            {failedText}
          </Notice>
        )}
      </div>
      <div className="hp-doc-facts">
        <time className="hp-doc-date" dateTime={doc.documentDate ?? doc.createdAt}>
          {formatDate(A.lang, doc.documentDate ?? doc.createdAt)}
        </time>
        {formatBytes(doc.fileSize, A.lang) && (
          <bdi className="hp-doc-size" dir="ltr">
            {formatBytes(doc.fileSize, A.lang)}
          </bdi>
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
        <Drawer title={V.sugTitle} subtitle={<UserText text={doc.title} />} onClose={() => setPanel(null)}>
          <Suggestions doc={doc} onChanged={onChanged} />
        </Drawer>
      )}
      {askDelete && <ConfirmDialog title={A.health.common.deleteTitle} body={A.health.common.deleteBody} confirmLabel={A.health.common.remove} danger onConfirm={() => void remove()} onClose={() => setAskDelete(false)} />}
      {askAi && <ConfirmDialog title={V.analyze} body={fill(V.analyzeConfirm, { provider: ai.provider ?? '' })} confirmLabel={V.analyzeYes} onConfirm={() => void analyze()} onClose={() => setAskAi(false)} />}
    </Reveal>
  );
};

// ---------------------------------------------------------------- page

const TYPE_ICON: Record<string, IconName> = {
  lab_report: 'flask',
  imaging_report: 'pulse',
  prescription: 'pill',
  discharge_summary: 'summary',
  clinical_note: 'scroll',
  referral: 'link',
  vaccination_record: 'shield',
  administrative: 'folder',
  other: 'documents',
};

type Sort = 'date_desc' | 'date_asc' | 'name' | 'type' | 'size';
const SORTS: Sort[] = ['date_desc', 'date_asc', 'name', 'type', 'size'];
type View = 'list' | 'grid';

const VIEW_KEY = 'naseej_docs_view';
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
};

const dayOf = (d: VaultDoc) => d.documentDate ?? d.createdAt.slice(0, 10);

export const PatientVault: React.FC = () => {
  const A = useA();
  const V = A.health.vault;
  const L = V.library;
  const [adding, setAdding] = useState(() => !!hashParam('new'));
  const [trash, setTrash] = useState(() => hashParam('trash') === '1');
  const [version, setVersion] = useState(0);
  const [datesOpen, setDatesOpen] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<Sort>('date_desc');
  const [view, setViewState] = useState<View>(readView);
  const { toast, show, hide } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const datesId = useId();

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* the choice just is not remembered */
    }
  };

  useEffect(() => {
    if (hashParam('new') || hashParam('trash')) window.history.replaceState(null, '', '#/patient/documents');
  }, []);

  // "/" jumps to the search box from anywhere on the page, unless the person is already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Search and dates are asked of the server; type and order are applied here, so the type counts and the sort answer at once.
  const path = useMemo(() => {
    const p = new URLSearchParams({ limit: '100' });
    if (q.trim()) p.set('q', q.trim());
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (trash) p.set('trash', '1');
    p.set('v', String(version));
    return `/api/vault/documents?${p.toString()}`;
  }, [q, from, to, trash, version]);

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
  const all = useMemo(() => (docs.state.status === 'ready' ? docs.state.data : []), [docs.state]);

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of all) m.set(d.docType ?? 'other', (m.get(d.docType ?? 'other') ?? 0) + 1);
    return m;
  }, [all]);

  const shown = useMemo(() => {
    const list = type ? all.filter((d) => (d.docType ?? 'other') === type) : [...all];
    const typeName = (d: VaultDoc) => (V.types as Record<string, string>)[d.docType ?? 'other'] ?? '';
    const by: Record<Sort, (a: VaultDoc, b: VaultDoc) => number> = {
      date_desc: (a, b) => dayOf(b).localeCompare(dayOf(a)),
      date_asc: (a, b) => dayOf(a).localeCompare(dayOf(b)),
      name: (a, b) => a.title.localeCompare(b.title, A.lang),
      type: (a, b) => typeName(a).localeCompare(typeName(b), A.lang) || dayOf(b).localeCompare(dayOf(a)),
      size: (a, b) => b.fileSize - a.fileSize,
    };
    return list.sort(by[sort]);
  }, [all, type, sort, A.lang, V.types]);

  // Dates read as months when the list is ordered by date; other orders are one flat run.
  const groups = useMemo(() => {
    if (sort !== 'date_desc' && sort !== 'date_asc') return [{ key: 'all', label: '', items: shown }];
    const fmt = new Intl.DateTimeFormat(localeOf(A.lang), { month: 'long', year: 'numeric' });
    const out: Array<{ key: string; label: string; items: VaultDoc[] }> = [];
    for (const d of shown) {
      const day = dayOf(d);
      const key = day.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(d);
      else {
        const date = new Date(`${day}T00:00:00`);
        out.push({ key, label: Number.isNaN(date.getTime()) ? L.undated : fmt.format(date), items: [d] });
      }
    }
    return out;
  }, [shown, sort, A.lang, L.undated]);

  const filtered = !!(q || type || from || to);
  const reset = () => {
    setQ('');
    setType('');
    setFrom('');
    setTo('');
  };
  const total = all.length;

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
      <div className="hp-lib">
        {adding && !trash && (
          <Drawer title={V.add} onClose={() => setAdding(false)}>
            <Upload
              ai={ai}
              onCancel={() => setAdding(false)}
              onUploaded={() => {
                setAdding(false);
                changed();
                show({ text: V.uploaded });
              }}
            />
          </Drawer>
        )}

        <div className="hp-lib-scope" role="tablist" aria-label={L.library}>
          <button type="button" role="tab" aria-selected={!trash} className="hp-lib-tab" onClick={() => setTrash(false)}>
            {L.library}
          </button>
          <button type="button" role="tab" aria-selected={trash} className="hp-lib-tab" onClick={() => setTrash(true)}>
            {V.trash}
          </button>
        </div>

        <section className="hp-lib-panel" aria-label={trash ? V.trash : L.library}>
          <div className="hp-lib-bar">
            <div className="hp-lib-search" role="search">
              <label className="hp-visually-hidden" htmlFor="vl-q">
                {V.search}
              </label>
              <AppIcon name="search" size={19} className="hp-lib-search-icon" />
              <input ref={searchRef} id="vl-q" type="search" dir="auto" value={q} placeholder={V.searchShort} onChange={(e) => setQ(e.target.value)} />
              {q ? (
                <button type="button" className="hp-lib-clear" aria-label={A.health.common.searchClear} onClick={() => setQ('')}>
                  <AppIcon name="close" size={16} />
                </button>
              ) : (
                <kbd className="hp-lib-kbd" aria-hidden="true" title={L.shortcut}>
                  /
                </kbd>
              )}
            </div>
            <div className="hp-lib-tools">
              <label className="hp-lib-sort">
                <span className="hp-visually-hidden">{L.sortLabel}</span>
                <Select className="na-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={L.sortLabel}>
                  {SORTS.map((k) => (
                    <option key={k} value={k}>
                      {L.sort[k]}
                    </option>
                  ))}
                </Select>
              </label>
              <button type="button" className="hp-lib-btn" aria-expanded={datesOpen} aria-controls={datesId} data-on={!!(from || to) || undefined} onClick={() => setDatesOpen((o) => !o)}>
                <AppIcon name="calendar" size={17} />
                {L.dates}
              </button>
              <div className="hp-lib-seg" role="group" aria-label={L.viewLabel}>
                <button type="button" aria-pressed={view === 'list'} aria-label={L.list} title={L.list} onClick={() => setView('list')}>
                  <AppIcon name="list" size={18} />
                </button>
                <button type="button" aria-pressed={view === 'grid'} aria-label={L.grid} title={L.grid} onClick={() => setView('grid')}>
                  <AppIcon name="grid" size={18} />
                </button>
              </div>
            </div>
          </div>

          {datesOpen && (
            <div className="hp-lib-dates" id={datesId} role="group" aria-label={A.health.common.dateRange}>
              <Field label={V.from} htmlFor="vl-from">
                <DatePicker id="vl-from" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label={V.to} htmlFor="vl-to">
                <DatePicker id="vl-to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
          )}

          {!trash && total > 0 && (
            <div className="hp-lib-types" role="group" aria-label={L.typeFilter}>
              <button type="button" className="hp-lib-chip" aria-pressed={!type} onClick={() => setType('')}>
                {L.all}
                <b>{total}</b>
              </button>
              {DOC_TYPES.filter((t) => typeCounts.get(t)).map((t) => (
                <button key={t} type="button" className="hp-lib-chip" aria-pressed={type === t} onClick={() => setType(type === t ? '' : t)}>
                  <AppIcon name={TYPE_ICON[t] ?? 'documents'} size={15} />
                  {V.types[t]}
                  <b>{typeCounts.get(t)}</b>
                </button>
              ))}
            </div>
          )}

          <Async
            state={docs.state}
            onRetry={docs.reload}
            isEmpty={(d) => d.length === 0}
            empty={
              trash ? (
                <EmptyState title={V.trashEmpty} />
              ) : q || from || to ? (
                <EmptyState
                  title={V.noMatch}
                  action={
                    <Button small onClick={reset}>
                      {L.clear}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title={V.empty}
                  body={V.emptyBody}
                  action={
                    <Button small variant="primary" icon="plus" onClick={() => setAdding(true)}>
                      {V.add}
                    </Button>
                  }
                />
              )
            }
          >
            {() => (
              <>
                <p className="hp-lib-count" role="status">
                  <span>{filtered && shown.length !== total ? fill(L.countOf, { n: shown.length, total }) : fill(L.count, { n: shown.length })}</span>
                  {filtered && (
                    <button type="button" className="hp-lib-reset" onClick={reset}>
                      {L.clear}
                    </button>
                  )}
                </p>
                {shown.length === 0 ? (
                  <EmptyState
                    title={V.noMatch}
                    action={
                      <Button small onClick={reset}>
                        {L.clear}
                      </Button>
                    }
                  />
                ) : (
                  groups.map((g) => (
                    <div key={g.key} className="hp-lib-group">
                      {g.label && <h2 className="hp-lib-month">{g.label}</h2>}
                      <ul className={`hp-docs hp-docs--${view}`}>
                        {g.items.map((d, i) => (
                          <DocCard key={d.id} doc={d} ai={ai} trash={trash} index={i} onChanged={changed} toast={show} />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </>
            )}
          </Async>
        </section>
      </div>
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
