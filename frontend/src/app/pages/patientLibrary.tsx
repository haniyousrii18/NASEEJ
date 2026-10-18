import React, { useMemo, useState } from 'react';
import { useApiData, useDownload, useMutation } from '../api.js';
import { fill, formatBytes, formatDate, nameOf } from '../format.js';
import { ProvenancePill } from '../record/badges.js';
import { ResultsComparison } from '../record/ResultsComparison.js';
import type { TimelineItem } from '../record/Timeline.js';
import { Async, Button, Card, EmptyState, Field, Notice, PageHead, Pill, type Tone } from '../ui.js';
import { useA } from '../useA.js';
import { DocumentUpload } from './shared.js';

type Sort = 'newest' | 'oldest';

const AI_TONE: Record<string, Tone> = { queued: 'info', processing: 'info', failed: 'danger', completed: 'info' };

/** One document in the library: where it came from, whether a clinician has reviewed it, and the original file. */
const DocRow: React.FC<{ item: TimelineItem; aiConfigured: boolean; onChanged: () => void }> = ({ item, aiConfigured, onChanged }) => {
  const A = useA();
  const L = A.care.library;
  const download = useDownload();
  const grant = useMutation();
  const [note, setNote] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const reviewed = item.reviewStatus === 'reviewed';
  const mine = item.provenance === 'patient_uploaded';
  const aiState = item.data.aiStatus as string | null;

  const allow = async () => {
    const res = await grant.run(`/api/documents/${item.source.id}/ai-consent`, 'POST', { allowed: true });
    setNote(res.ok ? { tone: 'ok', text: L.aiGranted } : { tone: 'danger', text: res.error.message });
    onChanged();
  };

  return (
    <li className="na-list-item doc-row">
      <div className="na-row na-row--between">
        <strong dir="auto">{String(item.data.title || item.data.fileName)}</strong>
        <Pill tone={reviewed ? 'ok' : 'warn'}>
          <span aria-hidden="true">{reviewed ? '✓' : '○'}</span> {reviewed ? L.verified : L.pending}
        </Pill>
      </div>
      <span className="na-muted">
        {[formatDate(A.lang, item.occurredAt), nameOf(A.lang, item.organization), formatBytes(Number(item.data.fileSize))].filter(Boolean).join(' · ')}
      </span>
      <div className="na-row">
        <ProvenancePill provenance={item.provenance} />
        {aiState && <Pill tone={AI_TONE[aiState] ?? 'neutral'}>{(L.aiStates as Record<string, string>)[aiState] ?? aiState}</Pill>}
        {Number(item.data.factsReviewed) > 0 && <Pill tone="ok">{fill(L.factsReviewed, { n: Number(item.data.factsReviewed) })}</Pill>}
      </div>
      <span className="na-help">{reviewed ? L.verifiedHelp : L.pendingHelp}</span>
      <div className="na-row">
        <Button small variant="quiet" icon="download" onClick={() => download(item.source.id, String(item.data.fileName || 'document'))}>
          {L.sourceFile}
        </Button>
        {mine && !item.data.aiProcessingAllowed && aiConfigured && !aiState && (
          <Button small disabled={grant.pending} onClick={allow}>
            {L.aiGrant}
          </Button>
        )}
        {mine && item.data.aiProcessingAllowed && !aiState && <span className="na-muted">{L.aiAllowed}</span>}
      </div>
      {note && (
        <Notice tone={note.tone} live>
          {note.text}
        </Notice>
      )}
    </li>
  );
};

export const PatientLibrary: React.FC = () => {
  const A = useA();
  const L = A.care.library;
  const [version, setVersion] = useState(0);
  const summary = useApiData<{ affiliatedCenters: Array<{ id: string; name_ar: string; name_en: string }> }>('/api/portal/summary');
  const docs = useApiData<TimelineItem[]>(`/api/portal/timeline?type=document&limit=100&v=${version}`);
  const ai = useApiData<{ configured: boolean }>('/api/documents/ai/status');
  const [q, setQ] = useState('');
  const [center, setCenter] = useState('');
  const [source, setSource] = useState('');
  const [review, setReview] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const aiConfigured = ai.state.status === 'ready' && ai.state.data.configured;

  const visible = useMemo(() => {
    if (docs.state.status !== 'ready') return [];
    const needle = q.trim().toLowerCase();
    return docs.state.data
      .filter((i) => (!center || i.organization.id === center) && (!source || i.provenance === source) && (!review || (review === 'reviewed') === (i.reviewStatus === 'reviewed')))
      .filter((i) => !needle || String(i.data.title || i.data.fileName).toLowerCase().includes(needle))
      .sort((a, b) => (sort === 'newest' ? -1 : 1) * a.occurredAt.localeCompare(b.occurredAt));
  }, [docs.state, q, center, source, review, sort]);

  const total = docs.state.status === 'ready' ? docs.state.data.length : 0;
  const centers = summary.state.status === 'ready' ? summary.state.data.affiliatedCenters : [];

  return (
    <>
      <PageHead title={L.title} subtitle={L.subtitle} />
      <div className="na-stack">
        {summary.state.status === 'ready' && <DocumentUpload centers={centers} onUploaded={() => setVersion((v) => v + 1)} />}

        <Card title={A.record.documents.sectionDocs}>
          <div className="na-form doc-filters">
            <Field label={L.search} htmlFor="lib-q">
              <input id="lib-q" type="search" className="na-input" value={q} onChange={(e) => setQ(e.target.value)} />
            </Field>
            <Field label={L.center} htmlFor="lib-center">
              <select id="lib-center" className="na-select" value={center} onChange={(e) => setCenter(e.target.value)}>
                <option value="">{L.all}</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nameOf(A.lang, c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={L.source} htmlFor="lib-source">
              <select id="lib-source" className="na-select" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">{L.all}</option>
                {(['patient_uploaded', 'clinician_uploaded', 'imported'] as const).map((s) => (
                  <option key={s} value={s}>
                    {A.common.provenance[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={L.review} htmlFor="lib-review">
              <select id="lib-review" className="na-select" value={review} onChange={(e) => setReview(e.target.value)}>
                <option value="">{L.all}</option>
                <option value="reviewed">{L.verified}</option>
                <option value="unreviewed">{L.pending}</option>
              </select>
            </Field>
            <Field label={L.sort} htmlFor="lib-sort">
              <select id="lib-sort" className="na-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="newest">{L.newest}</option>
                <option value="oldest">{L.oldest}</option>
              </select>
            </Field>
          </div>
          <p className="na-help">{L.specialtyNote}</p>
          <Async state={docs.state} onRetry={docs.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={A.record.documents.docsEmpty} body={A.record.documents.docsEmptyBody} />}>
            {() =>
              visible.length === 0 ? (
                <p className="na-muted">{L.noMatch}</p>
              ) : (
                <>
                  <p className="na-muted" aria-live="polite">
                    {fill(L.shown, { n: visible.length, total })}
                  </p>
                  <ul className="na-list">
                    {visible.map((i) => (
                      <DocRow key={i.id} item={i} aiConfigured={aiConfigured} onChanged={() => setVersion((v) => v + 1)} />
                    ))}
                  </ul>
                </>
              )
            }
          </Async>
        </Card>
        <ResultsComparison endpoint="/api/portal/timeline" />
      </div>
    </>
  );
};
