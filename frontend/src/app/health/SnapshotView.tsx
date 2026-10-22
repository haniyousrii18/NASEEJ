import React from 'react';
import { UserText } from '../translate/UserText.js';
import { formatDate } from '../format.js';
import { appT } from '../i18n/index.js';

/**
 * The clinician-facing summary. The same component renders the patient's preview, the printed copy and the page a doctor
 * opens from the QR code, so what the patient approves is exactly what is shown. It lays out what it is given and adds
 * nothing: no scores, no interpretation.
 */
export interface Snapshot {
  lang: 'ar' | 'en';
  patient: { name: string; dateOfBirth: string } | null;
  visitDate: string | null;
  reason: string;
  overview: string;
  sections: Array<{ key: string; items: Array<{ text: string; date: string | null; source: string }> }>;
  documents: Array<{ id: string; title: string; docType: string | null; providerName: string | null; mimeType: string; fileSize: number; documentDate: string | null }>;
}

const SECTION_ORDER = ['symptoms', 'conditions', 'medications', 'allergies', 'procedures', 'measurements', 'questions', 'notes'];

export const SnapshotView: React.FC<{ snapshot: Snapshot; onOpenDoc?: (id: string) => void; docError?: string }> = ({ snapshot, onOpenDoc, docError }) => {
  const T = appT[snapshot.lang].health.shareView;
  const V = appT[snapshot.lang].health.vault;
  const sections = [...snapshot.sections].sort((a, b) => SECTION_ORDER.indexOf(a.key) - SECTION_ORDER.indexOf(b.key));
  return (
    <article className="hp-sv" dir={snapshot.lang === 'ar' ? 'rtl' : 'ltr'} lang={snapshot.lang}>
      {(snapshot.patient || snapshot.visitDate) && (
        <dl className="na-dl hp-sv-id">
          {snapshot.patient && (
            <>
              <dt>{T.patient}</dt>
              <dd dir="auto">{snapshot.patient.name}</dd>
              <dt>{T.dob}</dt>
              <dd>{formatDate(snapshot.lang, snapshot.patient.dateOfBirth)}</dd>
            </>
          )}
          {snapshot.visitDate && (
            <>
              <dt>{T.visit}</dt>
              <dd>{formatDate(snapshot.lang, snapshot.visitDate)}</dd>
            </>
          )}
        </dl>
      )}

      {snapshot.reason && (
        <section className="hp-sv-sec">
          <h2>{T.reason}</h2>
          <p className="hp-sv-reason">
            <UserText text={snapshot.reason} lang={snapshot.lang} />
          </p>
        </section>
      )}
      {snapshot.overview && (
        <section className="hp-sv-sec">
          <h2>{T.overview}</h2>
          <p>
            <UserText text={snapshot.overview} lang={snapshot.lang} />
          </p>
        </section>
      )}

      {sections.map((s) => (
        <section key={s.key} className="hp-sv-sec">
          <h2>{(T.sections as Record<string, string>)[s.key] ?? s.key}</h2>
          <ul className="hp-sv-list">
            {s.items.map((it, i) => (
              <li key={i}>
                <UserText text={it.text} lang={snapshot.lang} />
                <span className="hp-sv-src">
                  {T.sourceLabel}: {it.source}
                  {it.date && s.key !== 'symptoms' ? ` · ${formatDate(snapshot.lang, it.date)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {snapshot.documents.length > 0 && (
        <section className="hp-sv-sec hp-sv-docs">
          <h2>{T.documents}</h2>
          <ul className="hp-sv-list">
            {snapshot.documents.map((d) => (
              <li key={d.id}>
                <span>
                  <UserText text={d.title} lang={snapshot.lang} />
                  {d.docType ? ` · ${(V.types as Record<string, string>)[d.docType] ?? d.docType}` : ''}
                  {d.documentDate ? ` · ${formatDate(snapshot.lang, d.documentDate)}` : ''}
                  {d.providerName ? ` · ${d.providerName}` : ''}
                </span>
                {onOpenDoc && (
                  <button type="button" className="na-btn na-btn--small hp-noprint" onClick={() => onOpenDoc(d.id)}>
                    {T.openDoc}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {docError && (
            <p className="na-help" role="alert">
              {docError}
            </p>
          )}
        </section>
      )}

      <p className="hp-sv-disclaimer">{T.disclaimer}</p>
    </article>
  );
};
