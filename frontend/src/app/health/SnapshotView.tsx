import React from 'react';
import { UserText } from '../translate/UserText.js';
import { formatDate } from '../format.js';
import { appT } from '../i18n/index.js';
import { AppIcon, type IconName } from '../AppIcons.js';
import { sourceText } from './sourceLabel.js';

/**
 * The clinician-facing summary. The same component renders the patient's preview, the printed copy and the page a doctor
 * opens from the QR code, so what the patient approves is exactly what is shown. It lays out what it is given and adds
 * nothing: no scores, no interpretation.
 */
export interface Snapshot {
  lang: 'ar' | 'en';
  /** dateOfBirth is null for a patient who registered by email and has not entered one. */
  patient: { name: string; dateOfBirth: string | null } | null;
  visitDate: string | null;
  reason: string;
  overview: string;
  sections: Array<{ key: string; items: Array<{ text: string; date: string | null; source: string }> }>;
  documents: Array<{ id: string; title: string; docType: string | null; providerName: string | null; mimeType: string; fileSize: number; documentDate: string | null }>;
}

/**
 * Order for a clinician's glance: what changes a prescribing or safety decision first (allergies, medicines, conditions),
 * then what brought the patient in. The set of sections and their content are exactly what the patient approved.
 */
const SECTION_ORDER = ['allergies', 'medications', 'conditions', 'symptoms', 'procedures', 'measurements', 'questions', 'notes'];
const SECTION_ICON: Record<string, IconName> = {
  allergies: 'alert',
  medications: 'pill',
  conditions: 'pulse',
  symptoms: 'message',
  procedures: 'visit',
  measurements: 'flask',
  questions: 'message',
  notes: 'scroll',
};

/** Smooth-scroll to a section without touching location.hash, which carries the share token on the QR page. */
const jumpTo = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
};

/**
 * `lang` is the language of the interface around the content (headings, labels, source sentences, dates). It defaults to the
 * language the summary was approved in, and the QR page passes the reader's own choice. The patient's text is never rewritten.
 */
export const SnapshotView: React.FC<{ snapshot: Snapshot; lang?: 'ar' | 'en'; onOpenDoc?: (id: string) => void; docError?: string; jump?: boolean }> = ({ snapshot, lang, onOpenDoc, docError, jump }) => {
  const L = lang ?? snapshot.lang;
  const T = appT[L].health.shareView;
  const V = appT[L].health.vault;
  const sections = [...snapshot.sections].sort((a, b) => SECTION_ORDER.indexOf(a.key) - SECTION_ORDER.indexOf(b.key));
  const sid = (key: string) => `sv-sec-${key}`;
  const hasDocs = snapshot.documents.length > 0;
  const stops = [...sections.map((s) => ({ id: sid(s.key), label: (T.sections as Record<string, string>)[s.key] ?? s.key, count: s.items.length, key: s.key })), ...(hasDocs ? [{ id: 'sv-sec-docs', label: T.documents, count: snapshot.documents.length, key: 'docs' }] : [])];
  const renderSection = (s: Snapshot['sections'][number]) => (
    <section key={s.key} id={sid(s.key)} tabIndex={-1} className={`hp-sv-sec hp-sv-sec--${s.key}`} aria-labelledby={`${sid(s.key)}-h`}>
      <h2 id={`${sid(s.key)}-h`}>
        <AppIcon name={SECTION_ICON[s.key] ?? 'scroll'} size={18} />
        {(T.sections as Record<string, string>)[s.key] ?? s.key}
        <span className="hp-sv-count">{s.items.length}</span>
      </h2>
      <ul className="hp-sv-list">
        {s.items.map((it, i) => (
          <li key={i}>
            <span className="hp-sv-item">
              <UserText text={it.text} lang={L} />
            </span>
            <span className="hp-sv-src">
              {T.sourceLabel}: {sourceText(L, it.source)}
              {it.date && s.key !== 'symptoms' ? ` · ${formatDate(L, it.date)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <article className="hp-sv" dir={L === 'ar' ? 'rtl' : 'ltr'} lang={L}>
      {(snapshot.patient || snapshot.visitDate) && (
        <section className="hp-sv-id" aria-label={T.patient}>
          {snapshot.patient && (
            <div className="hp-sv-who">
              <span className="hp-sv-avatar" aria-hidden="true">
                <AppIcon name="user" size={22} />
              </span>
              <div>
                <span className="hp-sv-k">{T.patient}</span>
                <p className="hp-sv-name" dir="auto">
                  {snapshot.patient.name}
                </p>
              </div>
            </div>
          )}
          <dl className="hp-sv-facts">
            {snapshot.patient?.dateOfBirth && (
              <div>
                <dt>{T.dob}</dt>
                <dd>{formatDate(L, snapshot.patient.dateOfBirth)}</dd>
              </div>
            )}
            {snapshot.visitDate && (
              <div>
                <dt>{T.visit}</dt>
                <dd>{formatDate(L, snapshot.visitDate)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {jump && stops.length > 1 && (
        <nav className="hp-sv-jump hp-noprint" aria-label={T.jumpTo}>
          {stops.map((st) => (
            <button key={st.id} type="button" className={`hp-sv-chip${st.key === 'allergies' ? ' is-alert' : ''}`} onClick={() => jumpTo(st.id)}>
              {st.label}
              <b>{st.count}</b>
            </button>
          ))}
        </nav>
      )}

      {sections.filter((x) => x.key === 'allergies').map(renderSection)}

      {snapshot.reason && (
        <section className="hp-sv-sec hp-sv-lead" aria-labelledby="sv-sec-reason">
          <h2 id="sv-sec-reason">{T.reason}</h2>
          <p className="hp-sv-reason">
            <UserText text={snapshot.reason} lang={L} />
          </p>
        </section>
      )}
      {snapshot.overview && (
        <section className="hp-sv-sec" aria-labelledby="sv-sec-overview">
          <h2 id="sv-sec-overview">{T.overview}</h2>
          <p className="hp-sv-text">
            <UserText text={snapshot.overview} lang={L} />
          </p>
        </section>
      )}

      {sections.filter((x) => x.key !== 'allergies').map(renderSection)}

      {hasDocs && (
        <section id="sv-sec-docs" tabIndex={-1} className="hp-sv-sec hp-sv-docs" aria-labelledby="sv-sec-docs-h">
          <h2 id="sv-sec-docs-h">
            <AppIcon name="documents" size={18} />
            {T.documents}
            <span className="hp-sv-count">{snapshot.documents.length}</span>
          </h2>
          <ul className="hp-sv-list">
            {snapshot.documents.map((d) => (
              <li key={d.id} className="hp-sv-doc">
                <span className="hp-sv-item">
                  <UserText text={d.title} lang={L} />
                  <span className="hp-sv-src">
                    {[d.docType ? ((V.types as Record<string, string>)[d.docType] ?? d.docType) : null, d.documentDate ? formatDate(L, d.documentDate) : null, d.providerName ? <UserText key="p" text={d.providerName} lang={L} /> : null]
                      .filter(Boolean)
                      .map((part, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && ' · '}
                          {part}
                        </React.Fragment>
                      ))}
                  </span>
                </span>
                {onOpenDoc && (
                  <button type="button" className="na-btn na-btn--small hp-sv-open hp-noprint" onClick={() => onOpenDoc(d.id)}>
                    {T.openDoc}
                    <AppIcon name="external" size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {docError && (
            <p className="hp-sv-err" role="alert">
              {docError}
            </p>
          )}
        </section>
      )}

      <p className="hp-sv-disclaimer">
        <AppIcon name="shield" size={16} />
        <span>{T.disclaimer}</span>
      </p>
    </article>
  );
};
