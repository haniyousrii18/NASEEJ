import React, { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData } from '../api.js';
import { fill, nameOf, todayIso } from '../format.js';
import { Button, Card, Field, Notice } from '../ui.js';
import { useA } from '../useA.js';

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });

interface UploadOutcome {
  ok: boolean;
  status: number;
  data?: any;
  message?: string;
}

/** POSTs JSON with upload progress (fetch cannot report it). The bearer token never leaves the Authorization header. */
function postWithProgress(url: string, body: unknown, headers: Record<string, string>, onProgress: (pct: number) => void): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => resolve({ ok: false, status: 0, message: 'Network error' });
    xhr.onload = () => {
      let json: any = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* a gateway error or an empty body */
      }
      const ok = xhr.status >= 200 && xhr.status < 300 && json?.success !== false;
      resolve({ ok, status: xhr.status, data: json?.data, message: json?.error?.message });
    };
    xhr.send(JSON.stringify(body));
  });
}

/**
 * Upload form for PDF/PNG/JPEG. The server checks the file's own bytes, size, ownership and center; this form
 * only saves the user a round trip for the obvious mistakes. A patient chooses one of their centers,
 * a clinician uploads for the patient being viewed (`patientId`).
 * A patient may also allow THIS file to be read by the configured AI provider. That is off by default and is only
 * offered when the server reports a provider; otherwise the file just waits for clinician review.
 */
export const DocumentUpload: React.FC<{
  centers?: Array<{ id: string; name_ar: string; name_en: string }>;
  patientId?: string;
  onUploaded: () => void;
}> = ({ centers, patientId, onUploaded }) => {
  const A = useA();
  const D = A.record.documents;
  const L = A.care.library;
  const { token, currentOrgId } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso());
  const [center, setCenter] = useState('');
  const [ai, setAi] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const aiStatus = useApiData<{ configured: boolean }>(centers ? '/api/documents/ai/status' : null);
  const aiConfigured = aiStatus.state.status === 'ready' && aiStatus.state.data.configured;
  const pending = progress !== null;

  const chosenCenter = center || centers?.[0]?.id || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return setMsg({ tone: 'danger', text: D.choose });
    if (file.size > MAX_BYTES) return setMsg({ tone: 'danger', text: D.tooBig });
    if (file.type && !ALLOWED.includes(file.type)) return setMsg({ tone: 'danger', text: D.badType });
    setMsg(null);
    setProgress(0);
    const content_base64 = await toBase64(file);
    const body: Record<string, unknown> = { file_name: file.name, content_base64, title: title.trim() || undefined, document_date: date || undefined };
    if (patientId) body.patient_id = patientId;
    else {
      body.organization_id = chosenCenter;
      if (ai && aiConfigured) body.ai_processing_allowed = true;
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (currentOrgId) headers['X-Organization-Id'] = currentOrgId;
    const res = await postWithProgress('/api/documents', body, headers, setProgress);
    setProgress(null);
    if (!res.ok) {
      const text = res.status === 415 ? D.badType : res.status === 413 ? D.tooBig : D.uploadFailed;
      return setMsg({ tone: 'danger', text });
    }
    setMsg({ tone: 'ok', text: patientId ? D.uploaded : res.data?.aiProcessingStarted ? L.uploadedAi : L.uploadedRaw });
    setTitle('');
    setAi(false);
    if (input.current) input.current.value = '';
    onUploaded();
  };

  return (
    <Card title={patientId ? undefined : D.upload}>
      <form className="na-form" onSubmit={submit} noValidate>
        <Field label={D.choose} htmlFor="doc-file">
          <input id="doc-file" ref={input} type="file" className="na-input na-file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" />
        </Field>
        <Field label={D.titleField} htmlFor="doc-title">
          <input id="doc-title" className="na-input" maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={D.dateField} htmlFor="doc-date">
          <input id="doc-date" type="date" className="na-input" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {centers && (
          <Field label={D.centerField} htmlFor="doc-center">
            <select id="doc-center" className="na-select" value={chosenCenter} onChange={(e) => setCenter(e.target.value)}>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {nameOf(A.lang, c)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {centers && (
          <div className="na-form-span-all">
            <label className="cg-check">
              <input type="checkbox" checked={ai && aiConfigured} disabled={!aiConfigured} onChange={(e) => setAi(e.target.checked)} />
              <span>
                <strong>{L.aiAllow}</strong>
                {!aiConfigured && <span className="na-help">{L.aiUnavailable}</span>}
              </span>
            </label>
          </div>
        )}
        <div className="na-form-actions">
          <Button type="submit" variant="primary" icon="upload" disabled={pending}>
            {pending ? L.sending : D.upload}
          </Button>
        </div>
      </form>
      {pending && (
        <div className="up-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} aria-label={fill(L.progress, { n: progress ?? 0 })}>
          <span style={{ inlineSize: `${progress}%` }} />
          <small>{fill(L.progress, { n: progress ?? 0 })}</small>
        </div>
      )}
      {msg && (
        <div style={{ marginTop: 12 }}>
          <Notice tone={msg.tone} live>
            {msg.text}
          </Notice>
        </div>
      )}
    </Card>
  );
};
