import React, { useEffect, useState } from 'react';
import { useApiData, useDownload, useMutation } from '../api.js';
import { fill, formatDate } from '../format.js';
import { Async, Button, EmptyState, Field, Notice, Pill, type Tone } from '../ui.js';
import { useA } from '../useA.js';
import { AppIcon } from '../AppIcons.js';

/**
 * AI-assisted document review for clinicians. Everything shown here is a SUGGESTION read from a file by a provider:
 * it is labelled as AI-generated, linked to the original file with the page and passage it came from, and stays
 * separate from verified clinical data until the clinician accepts, corrects or rejects it.
 */
export interface AiFact {
  id: string;
  documentId: string;
  documentTitle?: string;
  kind: 'condition' | 'medication' | 'allergy' | 'lab_value' | 'procedure' | 'followup' | 'other';
  label: string;
  value: string | null;
  unit: string | null;
  date: string | null;
  page: number | null;
  passage: string | null;
  confidence: number | null;
  why: string | null;
  reviewStatus: 'unreviewed' | 'accepted' | 'corrected' | 'rejected';
  original?: Record<string, any>;
}

const STATUS_TONE: Record<AiFact['reviewStatus'], Tone> = { unreviewed: 'warn', accepted: 'ok', corrected: 'info', rejected: 'danger' };

export const AiBadge: React.FC = () => {
  const A = useA();
  return (
    <Pill tone="lilac">
      <AppIcon name="pulse" size={12} /> {A.care.aiReview.label}
    </Pill>
  );
};

const FactCard: React.FC<{
  fact: AiFact;
  fileName: string;
  canReview: boolean;
  onReview: (action: 'accept' | 'reject' | 'correct', correction?: Record<string, string>) => Promise<string | null>;
  busy: boolean;
}> = ({ fact, fileName, canReview, onReview, busy }) => {
  const A = useA();
  const R = A.care.aiReview;
  const download = useDownload();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ label: fact.label, value: fact.value ?? '', unit: fact.unit ?? '', fact_date: fact.date ?? '' });
  const [error, setError] = useState('');

  const act = async (action: 'accept' | 'reject' | 'correct', correction?: Record<string, string>) => {
    const err = await onReview(action, correction);
    setError(err ?? '');
    if (!err) setEditing(false);
  };
  const id = `fact-${fact.id}`;

  return (
    <li className="ai-fact" data-status={fact.reviewStatus}>
      <div className="na-row na-row--between">
        <div className="na-row">
          <Pill tone="neutral">{R.kinds[fact.kind]}</Pill>
          <AiBadge />
        </div>
        <Pill tone={STATUS_TONE[fact.reviewStatus]}>{R.statuses[fact.reviewStatus]}</Pill>
      </div>
      <p className="ai-fact-main">
        <strong>{fact.label}</strong>
        {(fact.value || fact.unit) && (
          <span className="ai-fact-value" dir="ltr">
            {[fact.value, fact.unit].filter(Boolean).join(' ')}
          </span>
        )}
        {fact.date && <span className="na-muted"> · {formatDate(A.lang, fact.date)}</span>}
      </p>
      {fact.passage && (
        <blockquote className="ai-fact-passage" dir="auto">
          <span className="na-muted">
            {R.passage}
            {fact.page ? ` · ${fill(R.page, { n: fact.page })}` : ''}
          </span>
          <q>{fact.passage}</q>
        </blockquote>
      )}
      {fact.why && (
        <p className="na-muted">
          <strong>{R.why}:</strong> {fact.why}
        </p>
      )}
      <p className="na-muted">{fact.confidence === null ? R.noConfidence : fill(R.confidence, { n: Math.round(fact.confidence * 100) })}</p>
      {fact.original && <p className="na-muted">{R.original}: {JSON.stringify({ label: fact.original.label, value: fact.original.value, unit: fact.original.unit })}</p>}

      {canReview && !editing && (
        <div className="na-row">
          <Button small variant="primary" disabled={busy} onClick={() => act('accept')}>
            {R.accept}
          </Button>
          <Button small disabled={busy} onClick={() => setEditing(true)}>
            {R.correct}
          </Button>
          <Button small variant="danger" disabled={busy} onClick={() => act('reject')}>
            {R.reject}
          </Button>
          <Button small variant="quiet" icon="download" onClick={() => download(fact.documentId, fileName)}>
            {R.openSource}
          </Button>
        </div>
      )}
      {!canReview && (
        <Button small variant="quiet" icon="download" onClick={() => download(fact.documentId, fileName)}>
          {R.openSource}
        </Button>
      )}
      {editing && (
        <form
          className="na-form na-form--stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act('correct', draft);
          }}
        >
          <Field label={R.itemLabel} htmlFor={`${id}-l`}>
            <input id={`${id}-l`} className="na-input" maxLength={255} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} required />
          </Field>
          <div className="na-grid na-grid--3">
            <Field label={R.value} htmlFor={`${id}-v`}>
              <input id={`${id}-v`} className="na-input" maxLength={255} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
            </Field>
            <Field label={R.unit} htmlFor={`${id}-u`}>
              <input id={`${id}-u`} className="na-input" maxLength={50} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
            </Field>
            <Field label={R.date} htmlFor={`${id}-d`}>
              <input id={`${id}-d`} type="date" className="na-input" value={draft.fact_date} onChange={(e) => setDraft({ ...draft, fact_date: e.target.value })} />
            </Field>
          </div>
          <div className="na-form-actions">
            <Button type="submit" variant="primary" small disabled={busy}>
              {R.saveCorrection}
            </Button>
            <Button small variant="quiet" onClick={() => setEditing(false)}>
              {A.common.actions.cancel}
            </Button>
          </div>
        </form>
      )}
      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}
    </li>
  );
};

/** One document: processing state, start/retry, and the suggestions to review. */
export const DocumentAiPanel: React.FC<{ documentId: string; fileName: string; onChanged?: () => void }> = ({ documentId, fileName, onChanged }) => {
  const A = useA();
  const R = A.care.aiReview;
  const proc = useApiData<any>(`/api/documents/${documentId}/processing`);
  const facts = useApiData<AiFact[]>(`/api/documents/${documentId}/facts`);
  const refresh = () => {
    proc.reload();
    facts.reload();
  };
  const start = useMutation();
  const review = useMutation();
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const status = proc.state.status === 'ready' ? proc.state.data?.job?.status : null;
  // While the provider is working, ask again every few seconds. Nothing is shown as finished until the server says so.
  useEffect(() => {
    if (status !== 'processing' && status !== 'queued') return;
    const t = window.setInterval(() => {
      proc.reload();
      facts.reload();
    }, 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const run = async () => {
    const res = await start.run(`/api/documents/${documentId}/process`, 'POST');
    setMessage(res.ok ? { tone: 'ok', text: R.started } : { tone: 'danger', text: res.error.message });
    refresh();
  };

  const doReview = async (factId: string, action: 'accept' | 'reject' | 'correct', correction?: Record<string, string>) => {
    const res = await review.run(`/api/documents/${documentId}/facts/${factId}/review`, 'POST', { action, ...correction });
    if (!res.ok) return res.error.message;
    refresh();
    onChanged?.();
    return null;
  };

  return (
    <div className="ai-panel">
      <div className="na-row">
        <h3 className="ai-title">{R.title}</h3>
        <AiBadge />
      </div>
      <Notice tone="info" icon="alert">
        {R.banner}
      </Notice>
      <Async state={proc.state} onRetry={proc.reload}>
        {(p) => {
          const job = p.job;
          return (
            <div className="na-stack">
              {!p.available && !job && <Notice tone="warn">{R.unavailable}</Notice>}
              {p.available && !p.allowed && <Notice tone="warn">{R.notAllowed}</Notice>}
              {p.available && p.allowed && (!job || job.status === 'failed') && (
                <div className="na-row">
                  <Button small variant="primary" icon="pulse" disabled={start.pending} onClick={run}>
                    {job ? R.retry : R.process}
                  </Button>
                </div>
              )}
              {job && (job.status === 'processing' || job.status === 'queued') && (
                <Notice tone="info" live>
                  {R.processing}
                </Notice>
              )}
              {job?.status === 'failed' && (
                <Notice tone="danger" live>
                  {fill(R.failed, { code: job.errorCode ?? 'ERROR' })}
                </Notice>
              )}
              {job?.status === 'completed' && (
                <p className="na-muted">
                  {[
                    job.provider ? fill(R.provider, { provider: job.provider, model: job.model ?? '' }) : '',
                    job.suggestedType ? fill(R.suggestedType, { type: (A.care.library.types as Record<string, string>)[job.suggestedType] ?? job.suggestedType }) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
          );
        }}
      </Async>
      {message && (
        <Notice tone={message.tone} live>
          {message.text}
        </Notice>
      )}
      <Async
        state={facts.state}
        onRetry={facts.reload}
        isEmpty={(f) => f.length === 0}
        empty={proc.state.status === 'ready' && proc.state.data.job?.status === 'completed' ? <p className="na-muted">{R.completedEmpty}</p> : null}
      >
        {(list) => (
          <ul className="ai-facts">
            {list.map((f) => (
              <FactCard key={f.id} fact={f} fileName={fileName} canReview busy={review.pending} onReview={(a, c) => doReview(f.id, a, c)} />
            ))}
          </ul>
        )}
      </Async>
    </div>
  );
};

const GROUP_ORDER: AiFact['kind'][] = ['allergy', 'medication', 'condition', 'lab_value', 'procedure', 'followup', 'other'];

/** All of a patient's suggestions from this center's files, grouped by type. Each row names and opens its source file. */
export const AiOverview: React.FC<{ patientId: string; version?: number }> = ({ patientId, version = 0 }) => {
  const A = useA();
  const R = A.care.aiReview;
  const download = useDownload();
  const facts = useApiData<AiFact[]>(`/api/documents/facts?patientId=${patientId}&v=${version}`);

  return (
    <section className="rec-sec" aria-labelledby="ai-overview-h">
      <div className="na-row">
        <h2 className="rec-h" id="ai-overview-h">
          {R.overviewTitle}
        </h2>
        <AiBadge />
      </div>
      <p className="na-muted">{R.overviewBody}</p>
      <Async state={facts.state} onRetry={facts.reload} isEmpty={(f) => f.length === 0} empty={<EmptyState title={R.overviewEmpty} />}>
        {(list) => {
          const pending = list.filter((f) => f.reviewStatus === 'unreviewed').length;
          return (
            <div className="na-stack">
              {pending > 0 && <Pill tone="warn">{fill(R.pendingCount, { n: pending })}</Pill>}
              {GROUP_ORDER.filter((k) => list.some((f) => f.kind === k)).map((kind) => (
                <div key={kind}>
                  <h3 className="ai-group">{R.kinds[kind]}</h3>
                  <ul className="na-list">
                    {list
                      .filter((f) => f.kind === kind && f.reviewStatus !== 'rejected')
                      .map((f) => (
                        <li key={f.id} className="na-list-item" data-status={f.reviewStatus}>
                          <div className="na-row na-row--between">
                            <span>
                              <strong>{f.label}</strong>
                              {(f.value || f.unit) && (
                                <span dir="ltr" className="ai-fact-value">
                                  {[f.value, f.unit].filter(Boolean).join(' ')}
                                </span>
                              )}
                            </span>
                            <span className="na-row">
                              {f.reviewStatus === 'unreviewed' && <AiBadge />}
                              <Pill tone={STATUS_TONE[f.reviewStatus]}>{R.statuses[f.reviewStatus]}</Pill>
                            </span>
                          </div>
                          <span className="na-muted">
                            {[f.documentTitle, f.page ? fill(R.page, { n: f.page }) : ''].filter(Boolean).join(' · ')}
                          </span>
                          {f.why && <span className="na-muted">{f.why}</span>}
                          <Button small variant="quiet" icon="download" onClick={() => download(f.documentId, f.documentTitle || 'document')}>
                            {R.openSource}
                          </Button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        }}
      </Async>
    </section>
  );
};
