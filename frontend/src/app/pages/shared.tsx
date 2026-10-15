import React, { useRef, useState } from 'react';
import { useMutation } from '../api.js';
import { nameOf, todayIso } from '../format.js';
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

/**
 * Upload form for PDF/PNG/JPEG. The server checks the file's own bytes, size, ownership and center; this form
 * only saves the user a round trip for the obvious mistakes. A patient chooses one of their centers,
 * a clinician uploads for the patient being viewed (`patientId`).
 */
export const DocumentUpload: React.FC<{
  centers?: Array<{ id: string; name_ar: string; name_en: string }>;
  patientId?: string;
  onUploaded: () => void;
}> = ({ centers, patientId, onUploaded }) => {
  const A = useA();
  const D = A.record.documents;
  const { run, pending } = useMutation();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso());
  const [center, setCenter] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const chosenCenter = center || centers?.[0]?.id || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return setMsg({ tone: 'danger', text: D.choose });
    if (file.size > MAX_BYTES) return setMsg({ tone: 'danger', text: D.tooBig });
    if (file.type && !ALLOWED.includes(file.type)) return setMsg({ tone: 'danger', text: D.badType });
    const content_base64 = await toBase64(file);
    const body: Record<string, unknown> = { file_name: file.name, content_base64, title: title.trim() || undefined, document_date: date || undefined };
    if (patientId) body.patient_id = patientId;
    else body.organization_id = chosenCenter;
    const res = await run('/api/documents', 'POST', body);
    if (!res.ok) {
      const text = res.error.status === 415 ? D.badType : res.error.status === 413 ? D.tooBig : D.uploadFailed;
      return setMsg({ tone: 'danger', text });
    }
    setMsg({ tone: 'ok', text: D.uploaded });
    setTitle('');
    if (input.current) input.current.value = '';
    onUploaded();
  };

  return (
    <Card title={patientId ? D.uploadFor : D.upload} hint={D.uploadHint}>
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
        <div className="na-form-actions">
          <Button type="submit" variant="primary" icon="upload" disabled={pending}>
            {pending ? D.uploading : D.upload}
          </Button>
        </div>
      </form>
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
