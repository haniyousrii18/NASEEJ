import React, { useCallback, useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { AppIcon } from '../AppIcons.js';
import { fill, todayIso } from '../format.js';
import { Button, Field, Notice, Select } from '../ui.js';
import { useA } from '../useA.js';
import { MicButton, SEVERITY_VALUE, SeverityPicker, UrgentNotice, extractCheckTokens, severityWord, useSafetyCheck, useSpeech } from './kit.js';
import { DatePicker } from '../DatePicker.js';

export type EntryKind = 'condition' | 'medication' | 'allergy' | 'procedure' | 'measurement' | 'visit';
export const ENTRY_KINDS: EntryKind[] = ['condition', 'medication', 'allergy', 'procedure', 'measurement', 'visit'];

export interface Entry {
  id: string;
  kind: EntryKind;
  title: string;
  status: 'active' | 'past' | null;
  startDate: string | null;
  endDate: string | null;
  eventDate: string | null;
  dose: string | null;
  frequency: string | null;
  reaction: string | null;
  severity: 'mild' | 'moderate' | 'severe' | null;
  value: string | null;
  unit: string | null;
  providerName: string | null;
  notes: string | null;
  source: 'patient' | 'assistant' | 'document' | 'clinician';
  reviewStatus: 'confirmed' | 'needs_review';
  sourceDocumentId: string | null;
  createdAt: string;
  deletedAt: string | null;
}

const hasDates = (k: EntryKind) => k === 'condition' || k === 'medication';

/** Add or correct one health fact. Short, one column on a phone; only the fields that mean something for the kind. */
export const EntryForm: React.FC<{ kind: EntryKind; initial?: Partial<Entry> & { id?: string }; onSaved: (e: Entry) => void; onCancel: () => void; capturedVia?: 'assistant' }> = ({ kind, initial, onSaved, onCancel, capturedVia }) => {
  const A = useA();
  const H = A.health.profile;
  const F = H.fields;
  const { run, pending } = useMutation();
  const editing = !!initial?.id;
  const [v, setV] = useState({
    title: initial?.title ?? '',
    status: initial?.status ?? 'active',
    start_date: initial?.startDate ?? '',
    end_date: initial?.endDate ?? '',
    event_date: initial?.eventDate ?? (kind === 'visit' ? '' : todayIso()),
    dose: initial?.dose ?? '',
    frequency: initial?.frequency ?? '',
    reaction: initial?.reaction ?? '',
    severity: initial?.severity ?? '',
    value: initial?.value ?? '',
    unit: initial?.unit ?? '',
    provider_name: initial?.providerName ?? '',
    notes: initial?.notes ?? '',
  });
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<{ title?: string; value?: string; date?: string }>({});
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const titleLabel = F.title[kind];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const body: Record<string, unknown> = { kind, title: v.title.trim(), notes: v.notes.trim() || null };
    if (hasDates(kind)) Object.assign(body, { status: v.status, start_date: v.start_date || null, end_date: v.end_date || null });
    if (kind === 'medication') Object.assign(body, { dose: v.dose.trim() || null, frequency: v.frequency.trim() || null, provider_name: v.provider_name.trim() || null });
    if (kind === 'allergy') Object.assign(body, { reaction: v.reaction.trim() || null, severity: v.severity || null });
    if (kind === 'measurement') Object.assign(body, { value: v.value.trim(), unit: v.unit.trim() || null, event_date: v.event_date });
    if (kind === 'procedure' || kind === 'visit') Object.assign(body, { event_date: v.event_date, provider_name: v.provider_name.trim() || null });
    if (capturedVia && !editing) body.captured_via = capturedVia;
    const next: { title?: string; value?: string; date?: string } = {};
    if (!body.title) next.title = fill(A.health.common.errFill, { field: titleLabel });
    if (kind === 'measurement' && !v.value.trim()) next.value = fill(A.health.common.errFill, { field: F.value });
    if ((kind === 'measurement' || kind === 'procedure' || kind === 'visit') && !v.event_date) next.date = fill(A.health.common.errFill, { field: F.eventDate });
    setErrors(next);
    if (Object.keys(next).length) return;
    const res = await run<Entry>(editing ? `/api/record/entries/${initial!.id}` : '/api/record/entries', editing ? 'PATCH' : 'POST', body);
    if (!res.ok) return setError(res.error.status === 0 ? A.health.common.offline : res.error.status === 400 ? res.error.message : A.health.common.failed);
    onSaved(res.data);
  };

  return (
    <form className="na-form na-form--stack" onSubmit={submit} noValidate>
      <Field label={titleLabel} htmlFor="en-title" required error={errors.title}>
        <input id="en-title" className="na-input" value={v.title} maxLength={255} onChange={set('title')} autoFocus />
      </Field>

      {hasDates(kind) && (
        <fieldset className="na-fieldset hp-seg">
          <legend>{F.status}</legend>
          <div className="hp-seg-row" role="radiogroup" aria-label={F.status}>
            {(['active', 'past'] as const).map((s) => (
              <label key={s} className="hp-seg-opt" data-on={v.status === s}>
                <input type="radio" name="en-status" checked={v.status === s} onChange={() => setV((x) => ({ ...x, status: s }))} />
                <span>{(s === 'active' ? F.active : F.past)[kind as 'condition' | 'medication']}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {kind === 'medication' && (
        <>
          <Field label={F.dose} htmlFor="en-dose">
            <input id="en-dose" className="na-input" dir="auto" value={v.dose} maxLength={120} onChange={set('dose')} />
          </Field>
          <Field label={F.frequency} htmlFor="en-freq">
            <input id="en-freq" className="na-input" dir="auto" value={v.frequency} maxLength={120} onChange={set('frequency')} />
          </Field>
        </>
      )}

      {kind === 'allergy' && (
        <>
          <Field label={F.reaction} htmlFor="en-reaction">
            <input id="en-reaction" className="na-input" dir="auto" value={v.reaction} maxLength={255} onChange={set('reaction')} />
          </Field>
          <SeverityPicker
            value={v.severity ? SEVERITY_VALUE[v.severity as keyof typeof SEVERITY_VALUE] : null}
            onChange={(n) => setV((x) => ({ ...x, severity: severityWord(n) ?? '' }))}
            labels={F.sev}
            name="en-sev"
            legend={F.severity}
          />
        </>
      )}

      {kind === 'measurement' && (
        <>
          <Field label={F.value} htmlFor="en-value" required error={errors.value}>
            <input id="en-value" className="na-input na-ltr" inputMode="decimal" value={v.value} maxLength={60} onChange={set('value')} />
          </Field>
          <Field label={F.unit} htmlFor="en-unit">
            <input id="en-unit" className="na-input na-ltr" value={v.unit} maxLength={30} onChange={set('unit')} />
          </Field>
        </>
      )}

      {hasDates(kind) ? (
        <>
          <Field label={F.startDate} htmlFor="en-start">
            <DatePicker id="en-start" max={todayIso()} value={v.start_date} onChange={set('start_date')} />
          </Field>
          {v.status === 'past' && (
            <Field label={F.endDate} htmlFor="en-end">
              <DatePicker id="en-end" min={v.start_date || undefined} value={v.end_date} onChange={set('end_date')} />
            </Field>
          )}
        </>
      ) : kind !== 'allergy' ? (
        <Field label={F.eventDate} htmlFor="en-date" required error={errors.date}>
          <DatePicker id="en-date" max={kind === 'visit' ? undefined : todayIso()} value={v.event_date} onChange={set('event_date')} />
        </Field>
      ) : null}

      {(kind === 'procedure' || kind === 'visit') && (
        <Field label={F.provider[kind]} htmlFor="en-provider">
          <input id="en-provider" className="na-input" dir="auto" value={v.provider_name} maxLength={200} onChange={set('provider_name')} />
        </Field>
      )}

      <Field label={F.notes} htmlFor="en-notes">
        <textarea id="en-notes" className="na-textarea" dir="auto" rows={3} maxLength={2000} value={v.notes} onChange={set('notes')} />
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
        <Button variant="quiet" onClick={onCancel} disabled={pending}>
          {A.health.common.cancel}
        </Button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------- symptoms

export interface SymptomValue {
  id?: string;
  description?: string;
  severity?: number | null;
  onsetDate?: string | null;
  durationText?: string | null;
  frequency?: string | null;
  betterFactors?: string | null;
  worseFactors?: string | null;
  notes?: string | null;
  documentIds?: string[];
}

export const SYMPTOM_FREQ = ['once', 'constant', 'intermittent', 'daily', 'weekly', 'occasional'] as const;

/** Record or correct a symptom: the few things a person can say in one breath. The mic fills the same text box the person can edit. */
export const SymptomForm: React.FC<{
  initial?: SymptomValue;
  /** 'assistant' when the fields came from an assistant draft the person is now reviewing. */
  origin?: 'form' | 'assistant' | 'voice';
  /** Called with the saved symptom (its id), so the list can show it. */
  onSaved: (saved?: { id: string }) => void;
  onCancel: () => void;
}> = ({ initial, origin = 'form', onSaved, onCancel }) => {
  const A = useA();
  const S = A.health.symptoms;
  const { run, pending } = useMutation();
  const editing = !!initial?.id;
  const [v, setV] = useState({
    description: initial?.description ?? '',
    severity: initial?.severity ?? null,
    onset: initial?.onsetDate ? initial.onsetDate.slice(0, 10) : todayIso(),
    duration: initial?.durationText ?? '',
    frequency: initial?.frequency ?? '',
    better: initial?.betterFactors ?? '',
    worse: initial?.worseFactors ?? '',
    notes: initial?.notes ?? '',
  });
  const [docIds, setDocIds] = useState<string[]>(initial?.documentIds ?? []);
  const [docsOpen, setDocsOpen] = useState(false);
  const [voiced, setVoiced] = useState(origin === 'voice');
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<{ description?: string; severity?: string; check?: string }>({});
  const [urgent, setUrgent] = useState<string | null>(null);
  const safety = useSafetyCheck();
  const docs = useApiData<any[]>(docsOpen ? '/api/vault/documents?limit=50' : null);

  const append = useCallback((text: string) => {
    setVoiced(true);
    setChecked(false);
    setV((s) => ({ ...s, description: s.description ? `${s.description} ${text}` : text }));
  }, []);
  const speech = useSpeech(A.lang, append);

  const tokens = voiced || origin === 'assistant' ? extractCheckTokens(`${v.description} ${v.duration} ${v.notes}`) : [];
  const needsCheck = (voiced || origin === 'assistant') && tokens.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const next: { description?: string; severity?: string; check?: string } = {};
    if (!v.description.trim()) next.description = S.errDescription;
    if (!v.severity) next.severity = S.errSeverity;
    if (needsCheck && !checked) next.check = S.errCheck;
    setErrors(next);
    if (Object.keys(next).length) return;
    // The emergency message appears first; saving the symptom is never blocked by it.
    if (urgent === null) {
      const msg = await safety(`${v.description} ${v.notes}`);
      if (msg) {
        setUrgent(msg);
        return;
      }
    }
    const body: Record<string, unknown> = {
      symptom_description: v.description.trim(),
      severity: v.severity,
      onset_date: v.onset,
      duration_text: v.duration.trim() || null,
      frequency: v.frequency || null,
      better_factors: v.better.trim() || null,
      worse_factors: v.worse.trim() || null,
      notes: v.notes.trim() || null,
      document_ids: docIds,
    };
    if (!editing) body.captured_via = origin === 'assistant' ? 'assistant' : voiced ? 'voice' : 'form';
    const res = await run(editing ? `/api/record/symptoms/${initial!.id}` : '/api/record/symptoms', editing ? 'PATCH' : 'POST', body);
    if (!res.ok) return setError(res.error.status === 0 ? A.health.common.offline : res.error.status === 400 ? res.error.message : A.health.common.failed);
    onSaved(res.data as { id: string } | undefined);
  };

  const toggleDoc = (id: string) => setDocIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form className="na-form na-form--stack" onSubmit={submit} noValidate>
      <Field label={S.what} htmlFor="sy-what" help={S.whatHelp} required error={errors.description}>
        <textarea id="sy-what" className="na-textarea" dir="auto" rows={3} maxLength={1000} value={v.description} onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))} autoFocus />
      </Field>
      <MicButton listening={speech.listening} supported={speech.supported} onStart={speech.start} onStop={speech.stop} error={speech.error} />

      <SeverityPicker value={v.severity} onChange={(n) => { setErrors((x) => ({ ...x, severity: undefined })); setV((s) => ({ ...s, severity: n })); }} labels={S.sev} name="sy-sev" legend={S.severity} required error={errors.severity} />

      <Field label={S.start} htmlFor="sy-start">
        <DatePicker id="sy-start" max={todayIso()} value={v.onset} onChange={(e) => setV((s) => ({ ...s, onset: e.target.value }))} />
      </Field>
      <Field label={S.duration} htmlFor="sy-dur" help={S.durationHelp}>
        <input id="sy-dur" className="na-input" dir="auto" maxLength={100} value={v.duration} onChange={(e) => setV((s) => ({ ...s, duration: e.target.value }))} />
      </Field>
      <Field label={S.frequency} htmlFor="sy-freq">
        <Select id="sy-freq" className="na-select" value={v.frequency} onChange={(e) => setV((s) => ({ ...s, frequency: e.target.value }))}>
          <option value="">—</option>
          {SYMPTOM_FREQ.map((f) => (
            <option key={f} value={f}>
              {S.freq[f]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={S.better} htmlFor="sy-better">
        <input id="sy-better" className="na-input" dir="auto" maxLength={500} value={v.better} onChange={(e) => setV((s) => ({ ...s, better: e.target.value }))} />
      </Field>
      <Field label={S.worse} htmlFor="sy-worse">
        <input id="sy-worse" className="na-input" dir="auto" maxLength={500} value={v.worse} onChange={(e) => setV((s) => ({ ...s, worse: e.target.value }))} />
      </Field>
      <Field label={S.notes} htmlFor="sy-notes">
        <textarea id="sy-notes" className="na-textarea" dir="auto" rows={2} maxLength={2000} value={v.notes} onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} />
      </Field>

      <details className="hp-disclose" open={docsOpen} onToggle={(e) => setDocsOpen((e.target as HTMLDetailsElement).open)}>
        <summary>{S.docs}</summary>
        {docs.state.status === 'ready' &&
          (docs.state.data.length === 0 ? (
            <p className="na-muted">{S.docsNone}</p>
          ) : (
            <ul className="na-list">
              {docs.state.data.map((d) => (
                <li key={d.id}>
                  <label className="cg-check">
                    <input type="checkbox" checked={docIds.includes(d.id)} onChange={() => toggleDoc(d.id)} />
                    <span dir="auto">{d.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          ))}
      </details>

      {needsCheck && (
        <div className="hp-check" role="group" aria-label={S.checkDetails}>
          <p className="na-help">{S.micCheck}</p>
          <p>
            <strong>{S.checkDetails}</strong>{' '}
            {tokens.map((t) => (
              <bdi key={t} className="hp-token">
                {t}
              </bdi>
            ))}
          </p>
          <label className="cg-check">
            <input type="checkbox" checked={checked} onChange={(e) => { setChecked(e.target.checked); setErrors((x) => ({ ...x, check: undefined })); }} />
            <span>{S.checkedConfirm}</span>
          </label>
          {errors.check && (
            <p className="na-error" role="alert">
              <AppIcon name="alert" size={14} />
              {errors.check}
            </p>
          )}
        </div>
      )}

      {urgent && <UrgentNotice message={urgent} />}
      {error && (
        <Notice tone="danger" icon="alert" live>
          {error}
        </Notice>
      )}
      <div className="na-form-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? A.health.common.saving : A.health.common.save}
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={pending}>
          {A.health.common.cancel}
        </Button>
      </div>
    </form>
  );
};
