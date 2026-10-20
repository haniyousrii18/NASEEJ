import React from 'react';
import { UserText } from '../translate/UserText.js';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData } from '../api.js';
import { fill, formatDate } from '../format.js';
import { AppIcon, type IconName } from '../AppIcons.js';
import { titleOf, type TimelineItem } from '../record/Timeline.js';
import { Async, Button, PageHead } from '../ui.js';
import { useA } from '../useA.js';

interface HomeData {
  counts: { entries: number; symptoms: number; documents: number };
  lastSymptom: { id: string; description: string; onsetDate: string } | null;
  upcoming: { kind: 'appointment'; id: string; date: string; time: string } | { kind: 'visit'; id: string; date: string; title: string } | null;
  latestPrep: { id: string; visitDate: string | null; status: 'draft' | 'approved' } | null;
  activeShares: number;
  documentsWithSuggestions: number;
  assistantConsent: boolean;
}

/** A quiet row that leads somewhere. Used for the secondary actions and for things that need the patient's attention. */
const Row: React.FC<{ icon: IconName; title: string; body?: string; onClick: () => void }> = ({ icon, title, body, onClick }) => (
  <li>
    <button type="button" className="hp-row" onClick={onClick}>
      <span className="hp-row-icon" aria-hidden="true">
        <AppIcon name={icon} size={20} />
      </span>
      <span className="hp-row-text">
        <strong>{title}</strong>
        {body && <span>{body}</span>}
      </span>
      <AppIcon name="chevron" size={16} className="hp-row-go" />
    </button>
  </li>
);

/**
 * Today. One clear first step (record a symptom), the other things a patient does as quiet rows, and a short
 * "needs you" list that only appears when something does. No scores, streaks or reminders about what was not done.
 */
export const PatientToday: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const H = A.health.home;
  const { user } = useAuth();
  const home = useApiData<HomeData>('/api/record/home');
  const recent = useApiData<TimelineItem[]>('/api/portal/timeline?limit=4');
  const name = user ? (A.lang === 'ar' ? user.fullNameAr : user.fullNameEn) : '';
  const first = name.trim().split(/\s+/)[0] ?? '';

  return (
    <>
      <PageHead title={fill(H.greeting, { name: first })} />
      <div className="hp-stack">
        <section className="hp-hero" aria-labelledby="today-do">
          <h2 id="today-do" className="hp-h2">
            {H.start}
          </h2>
          <Button variant="primary" icon="plus" className="hp-hero-cta" onClick={() => navigate('patient/timeline?new=1')}>
            {H.actions.symptom.title}
          </Button>
          <ul className="hp-rows">
            <Row icon="upload" title={H.actions.document.title} body={H.actions.document.body} onClick={() => navigate('patient/documents?new=1')} />
            <Row icon="visit" title={H.actions.prepare.title} body={H.actions.prepare.body} onClick={() => navigate('patient/visits?new=1')} />
            <Row icon="pulse" title={H.actions.assistant.title} body={H.actions.assistant.body} onClick={() => navigate('patient/assistant')} />
          </ul>
        </section>

        <Async state={home.state} onRetry={home.reload}>
          {(d) => {
            const attention: Array<{ key: string; icon: IconName; title: string; body: string; go: string }> = [];
            if (d.latestPrep?.status === 'draft') attention.push({ key: 'prep', icon: 'visit', title: H.continuePrep, body: H.continuePrepBody, go: `patient/visits/prep/${d.latestPrep.id}` });
            if (d.documentsWithSuggestions > 0) attention.push({ key: 'sug', icon: 'documents', title: H.suggestionsTitle, body: fill(H.suggestionsBody, { n: d.documentsWithSuggestions }), go: 'patient/documents' });
            if (d.activeShares > 0) attention.push({ key: 'shares', icon: 'link', title: H.sharesTitle, body: fill(H.sharesBody, { n: d.activeShares }), go: 'patient/sharing' });
            return (
              <>
                {d.upcoming && (
                  <section className="hp-section" aria-labelledby="today-next">
                    <h2 id="today-next" className="hp-h2">
                      {H.upNext}
                    </h2>
                    <ul className="hp-rows">
                      <Row
                        icon="calendar"
                        title={d.upcoming.kind === 'appointment' ? fill(H.appointment, { date: formatDate(A.lang, d.upcoming.date), time: d.upcoming.time }) : fill(H.visit, { title: d.upcoming.title, date: formatDate(A.lang, d.upcoming.date) })}
                        body={H.prepareThis}
                        onClick={() => navigate('patient/visits?new=1')}
                      />
                    </ul>
                  </section>
                )}
                {attention.length > 0 && (
                  <section className="hp-section" aria-labelledby="today-attn">
                    <h2 id="today-attn" className="hp-h2">
                      {H.attention}
                    </h2>
                    <ul className="hp-rows">
                      {attention.map((a) => (
                        <Row key={a.key} icon={a.icon} title={a.title} body={a.body} onClick={() => navigate(a.go)} />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            );
          }}
        </Async>

        <section className="hp-section" aria-labelledby="today-recent">
          <div className="hp-section-h">
            <h2 id="today-recent" className="hp-h2">
              {H.recent}
            </h2>
            <Button small variant="quiet" onClick={() => navigate('patient/timeline')}>
              {H.seeAll}
            </Button>
          </div>
          <Async state={recent.state} onRetry={recent.reload}>
            {(items) =>
              items.length === 0 ? (
                <div className="hp-first">
                  <p className="hp-first-title">{H.emptyTitle}</p>
                  <p className="na-muted">{H.emptyBody}</p>
                  <ol className="hp-steps">
                    <li>{H.step1}</li>
                    <li>{H.step2}</li>
                    <li>{H.step3}</li>
                  </ol>
                </div>
              ) : (
                <ul className="hp-recent">
                  {items.map((i) => (
                    <li key={i.id}>
                      <span className="hp-recent-title">
                        <UserText text={titleOf(i, A)} />
                      </span>
                      <span className="na-muted">
                        {A.common.recordType[i.type]} · {formatDate(A.lang, i.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </Async>
        </section>
      </div>
    </>
  );
};
