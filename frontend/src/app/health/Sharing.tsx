import React, { useEffect, useMemo, useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { fill, formatDate } from '../format.js';
import type { PortalSummary } from '../pages/patient.js';
import { Async, Button, Card, Drawer, EmptyState, Field, Notice, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { ConfirmDialog, Toast, useToast } from './kit.js';
import { toSnapshot } from './PrepEditor.js';
import { SnapshotView } from './SnapshotView.js';
import type { Prep } from './Visits.js';
import type { VaultDoc } from './Vault.js';

interface Share {
  id: string;
  label: string | null;
  state: 'active' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  documentCount: number;
  prepId: string | null;
}

const hashParam = (name: string) => {
  const q = window.location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get(name) : null;
};

const DURATIONS: Array<{ key: 'h1' | 'h6' | 'h24' | 'd3' | 'd7'; hours: number }> = [
  { key: 'h1', hours: 1 },
  { key: 'h6', hours: 6 },
  { key: 'h24', hours: 24 },
  { key: 'd3', hours: 72 },
  { key: 'd7', hours: 168 },
];

/** The QR holds only this link. The token after "#/share/" never reaches a server log because browsers do not send the fragment. */
export const shareUrl = (token: string) => `${window.location.origin}/#/share/${token}`;

const QrImage: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    void import('qrcode').then(async (mod) => {
      const url = await mod.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 288, color: { dark: '#1f1a17', light: '#ffffff' } });
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [value]);
  return src ? <img className="hp-qr" src={src} width={288} height={288} alt={label} /> : <div className="hp-qr hp-qr--wait" aria-hidden="true" />;
};

const Created: React.FC<{ token: string; expiresAt: string; shareId: string; onDone: () => void; onRevoked: () => void }> = ({ token, expiresAt, shareId, onDone, onRevoked }) => {
  const A = useA();
  const S = A.health.sharing;
  const { run, pending } = useMutation();
  const [copied, setCopied] = useState(false);
  const url = shareUrl(token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* the link is shown in a field, it can be copied by hand */
    }
  };
  return (
    <Card title={S.created}>
      <div className="hp-qrbox">
        <QrImage value={url} label={S.scan} />
        <div className="na-stack">
          <p>{S.scan}</p>
          <Pill tone="info">{fill(S.expiresAt, { date: formatDate(A.lang, expiresAt, true) })}</Pill>
          <Notice tone="warn" icon="alert">
            {S.shownOnce}
          </Notice>
          <Field label={S.link} htmlFor="sh-link">
            <input id="sh-link" className="na-input na-ltr" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <div className="na-row hp-noprint">
            <Button small onClick={() => void copy()}>
              {copied ? A.health.common.copied : A.health.common.copy}
            </Button>
            <Button small onClick={() => window.print()}>
              {A.health.common.print}
            </Button>
            <Button
              small
              variant="danger"
              disabled={pending}
              onClick={async () => {
                const res = await run(`/api/shares/${shareId}/revoke`, 'POST');
                if (res.ok) onRevoked();
              }}
            >
              {S.revokeNow}
            </Button>
            <Button small variant="primary" onClick={onDone}>
              {S.done}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

const NewShare: React.FC<{ presetPrep: string | null; maxHours: number; navigate: (r: string) => void; onCreated: () => void }> = ({ presetPrep, maxHours, navigate, onCreated }) => {
  const A = useA();
  const S = A.health.sharing;
  const preps = useApiData<Prep[]>('/api/prep?limit=50');
  const docs = useApiData<VaultDoc[]>('/api/vault/documents?limit=100');
  const summary = useApiData<PortalSummary>('/api/portal/summary');
  const { run, pending } = useMutation();
  const [prepId, setPrepId] = useState<string | null>(presetPrep);
  const [docIds, setDocIds] = useState<string[] | null>(null);
  const [identity, setIdentity] = useState(true);
  const [hours, setHours] = useState(24);
  const [label, setLabel] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; token: string; expiresAt: string } | null>(null);

  const approved = preps.state.status === 'ready' ? preps.state.data.filter((p) => p.status === 'approved') : [];
  const prep = approved.find((p) => p.id === (prepId ?? approved[0]?.id)) ?? null;
  const allDocs = docs.state.status === 'ready' ? docs.state.data : [];

  // The documents the summary points at are pre-selected, but the person decides.
  const defaultDocs = useMemo(() => {
    const sec = prep?.content.sections.find((s) => s.key === 'documents');
    return sec?.included ? sec.items.map((i) => i.source.ref!).filter((id) => allDocs.some((d) => d.id === id)) : [];
  }, [prep, allDocs]);
  const chosenDocs = docIds ?? defaultDocs;
  const allowed = DURATIONS.filter((d) => d.hours <= maxHours);

  const identityData = summary.state.status === 'ready' ? summary.state.data.profile : null;
  const preview = prep
    ? toSnapshot(
        prep.content,
        prep.visitDate,
        identity && identityData ? { name: prep.content.lang === 'ar' ? identityData.full_name_ar || identityData.full_name_en : identityData.full_name_en || identityData.full_name_ar, dateOfBirth: identityData.date_of_birth } : null,
        allDocs.filter((d) => chosenDocs.includes(d.id)),
      )
    : null;

  const create = async () => {
    setConfirming(false);
    if (!prep) return;
    setError('');
    const res = await run<{ id: string; token: string; expiresAt: string }>('/api/shares', 'POST', {
      confirm: true,
      prep_id: prep.id,
      expires_in_hours: hours,
      document_ids: chosenDocs,
      include_identity: identity,
      label: label.trim() || undefined,
    });
    if (!res.ok) return setError(res.error.status === 0 ? A.health.common.offline : res.error.code === 'PREP_OUTDATED' ? S.outdated : S.failed);
    setCreated(res.data);
    onCreated();
  };

  if (created) {
    return <Created token={created.token} expiresAt={created.expiresAt} shareId={created.id} onDone={() => setCreated(null)} onRevoked={() => setCreated(null)} />;
  }

  return (
    <Card title={S.newTitle}>
      <Async
        state={preps.state}
        onRetry={preps.reload}
        isEmpty={() => approved.length === 0}
        empty={<EmptyState title={S.noApproved} body={S.noApprovedBody} action={<Button variant="primary" onClick={() => navigate('patient/visits')}>{S.goPrepare}</Button>} />}
      >
        {() => (
          <div className="na-stack">
            <fieldset className="na-fieldset">
              <legend>{S.step1}</legend>
              <ul className="na-list">
                {approved.map((p) => (
                  <li key={p.id}>
                    <label className="cg-check">
                      <input type="radio" name="sh-prep" checked={prep?.id === p.id} onChange={() => { setPrepId(p.id); setDocIds(null); }} />
                      <span dir="auto">
                        <strong>{p.content.reason || S.summary}</strong>
                        <span className="na-help">{p.visitDate ? formatDate(A.lang, p.visitDate) : formatDate(A.lang, p.updatedAt)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <fieldset className="na-fieldset">
              <legend>{S.step2}</legend>
              <p className="na-help">{S.docsHint}</p>
              {allDocs.length === 0 ? (
                <p className="na-muted">{S.docsNone}</p>
              ) : (
                <ul className="na-list">
                  {allDocs.map((d) => (
                    <li key={d.id}>
                      <label className="cg-check">
                        <input type="checkbox" checked={chosenDocs.includes(d.id)} onChange={() => setDocIds(chosenDocs.includes(d.id) ? chosenDocs.filter((x) => x !== d.id) : [...chosenDocs, d.id])} />
                        <span dir="auto">{d.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            <fieldset className="na-fieldset">
              <legend>{S.step3}</legend>
              <div className="na-form na-form--stack">
                <Field label={S.duration} htmlFor="sh-dur">
                  <select id="sh-dur" className="na-select" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                    {allowed.map((d) => (
                      <option key={d.key} value={d.hours}>
                        {S.durations[d.key]}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="cg-check">
                  <input type="checkbox" checked={identity} onChange={(e) => setIdentity(e.target.checked)} />
                  <span>
                    <strong>{S.identity}</strong>
                    <span className="na-help">{S.identityHelp}</span>
                  </span>
                </label>
                <Field label={S.label} htmlFor="sh-label" help={S.labelHelp}>
                  <input id="sh-label" className="na-input" dir="auto" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="na-fieldset">
              <legend>{S.step4}</legend>
              <p className="na-help">{S.previewNote}</p>
              {preview && (
                <div className="hp-preview">
                  <SnapshotView snapshot={preview} />
                </div>
              )}
            </fieldset>

            {error && (
              <Notice tone="danger" icon="alert" live>
                {error}
              </Notice>
            )}
            <div>
              <Button variant="primary" icon="link" onClick={() => setConfirming(true)} disabled={pending || !prep}>
                {pending ? S.creating : S.create}
              </Button>
            </div>
          </div>
        )}
      </Async>
      {confirming && <ConfirmDialog title={S.createTitle} body={S.createBody} confirmLabel={S.createConfirm} onConfirm={() => void create()} onClose={() => setConfirming(false)} />}
    </Card>
  );
};

const History: React.FC<{ share: Share; onClose: () => void }> = ({ share, onClose }) => {
  const A = useA();
  const S = A.health.sharing;
  const events = useApiData<Array<{ id: string; event: string; device: string | null; deviceMark: string | null; occurredAt: string }>>(`/api/shares/${share.id}/events`);
  return (
    <Drawer title={S.history} subtitle={share.label ?? undefined} onClose={onClose}>
      <Async state={events.state} onRetry={events.reload} isEmpty={(d) => d.length === 0} empty={<EmptyState title={S.historyEmpty} />}>
        {(list) => (
          <ul className="na-list">
            {list.map((e) => (
              <li key={e.id} className="na-list-item">
                <strong>{(S.events as Record<string, string>)[e.event] ?? e.event}</strong>
                <span className="na-muted">
                  {formatDate(A.lang, e.occurredAt, true)} · {(S.devices as Record<string, string>)[e.device ?? 'other']}
                  {e.deviceMark ? ` · #${e.deviceMark}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </Drawer>
  );
};

const ShareRow: React.FC<{ s: Share; onRevoke: (s: Share) => void; onHistory: (s: Share) => void }> = ({ s, onRevoke, onHistory }) => {
  const A = useA();
  const S = A.health.sharing;
  return (
    <li className="na-list-item">
      <div className="na-row na-row--between">
        <strong dir="auto">{s.label || formatDate(A.lang, s.createdAt, true)}</strong>
        <Pill tone={s.state === 'active' ? 'ok' : 'neutral'}>
          <span aria-hidden="true">{s.state === 'active' ? '●' : '○'}</span> {S.states[s.state]}
        </Pill>
      </div>
      <span className="na-muted">
        {[fill(S.expiresAt, { date: formatDate(A.lang, s.expiresAt, true) }), s.viewCount > 0 ? fill(S.opens, { n: s.viewCount }) : S.neverOpened, s.lastViewedAt ? fill(S.lastOpened, { date: formatDate(A.lang, s.lastViewedAt, true) }) : '', s.documentCount ? fill(S.docsCount, { n: s.documentCount }) : ''].filter(Boolean).join(' · ')}
      </span>
      <div className="na-row">
        <Button small variant="quiet" onClick={() => onHistory(s)}>
          {S.history}
        </Button>
        {s.state === 'active' && (
          <Button small variant="danger" onClick={() => onRevoke(s)}>
            {S.revoke}
          </Button>
        )}
      </div>
    </li>
  );
};

export const PatientSharing: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const S = A.health.sharing;
  const [version, setVersion] = useState(0);
  const shares = useApiData<Share[]>(`/api/shares?v=${version}`);
  const [revoking, setRevoking] = useState<Share | null>(null);
  const [history, setHistory] = useState<Share | null>(null);
  const { run, pending } = useMutation();
  const { toast, show, hide } = useToast();
  const preset = hashParam('prep');

  const revoke = async (s: Share) => {
    setRevoking(null);
    const res = await run(`/api/shares/${s.id}/revoke`, 'POST');
    show(res.ok ? { text: S.revoked } : { text: A.health.common.failed, tone: 'danger' });
    setVersion((v) => v + 1);
  };

  const list = shares.state.status === 'ready' ? shares.state.data : [];
  const active = list.filter((s) => s.state === 'active');
  const past = list.filter((s) => s.state !== 'active');

  return (
    <>
      <PageHead title={S.title} subtitle={S.subtitle} />
      <div className="na-stack">
        <NewShare presetPrep={preset} maxHours={shares.state.status === 'ready' ? Number(shares.state.meta?.maxHours) || 168 : 168} navigate={navigate} onCreated={() => setVersion((v) => v + 1)} />
        <Card title={S.active}>
          <Async state={shares.state} onRetry={shares.reload} isEmpty={() => active.length === 0} empty={<EmptyState title={S.none} body={S.noneBody} />}>
            {() => (
              <ul className="na-list">
                {active.map((s) => (
                  <ShareRow key={s.id} s={s} onRevoke={setRevoking} onHistory={setHistory} />
                ))}
              </ul>
            )}
          </Async>
        </Card>
        {past.length > 0 && (
          <Card title={S.past}>
            <ul className="na-list">
              {past.map((s) => (
                <ShareRow key={s.id} s={s} onRevoke={setRevoking} onHistory={setHistory} />
              ))}
            </ul>
          </Card>
        )}
        <Card title={S.related} hint={S.relatedBody}>
          <div className="na-row">
            <Button small onClick={() => navigate('patient/consents')}>
              {S.consents}
            </Button>
            <Button small onClick={() => navigate('patient/caregivers')}>
              {S.caregivers}
            </Button>
          </div>
        </Card>
      </div>
      {revoking && <ConfirmDialog title={S.revokeTitle} body={S.revokeBody} confirmLabel={S.revokeConfirm} danger pending={pending} onConfirm={() => void revoke(revoking)} onClose={() => setRevoking(null)} />}
      {history && <History share={history} onClose={() => setHistory(null)} />}
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
