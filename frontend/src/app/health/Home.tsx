import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData } from '../api.js';
import { fill, formatDate } from '../format.js';
import { ProvenancePill, ReviewPill } from '../record/badges.js';
import { titleOf, type TimelineItem } from '../record/Timeline.js';
import { Async, Button, Card, EmptyState, Notice, PageHead, Pill } from '../ui.js';
import { AppIcon, type IconName } from '../AppIcons.js';
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

/** One big, plain action. The four things people come here to do. */
const Action: React.FC<{ icon: IconName; title: string; body: string; onClick: () => void }> = ({ icon, title, body, onClick }) => (
  <button type="button" className="hp-action" onClick={onClick}>
    <span className="hp-action-icon" aria-hidden="true">
      <AppIcon name={icon} size={24} />
    </span>
    <span className="hp-action-text">
      <strong>{title}</strong>
      <span>{body}</span>
    </span>
  </button>
);

/** Today: four actions first, then only what needs attention. No scores, streaks or reminders about what was not done. */
export const PatientToday: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const H = A.health.home;
  const { user } = useAuth();
  const home = useApiData<HomeData>('/api/record/home');
  const recent = useApiData<TimelineItem[]>('/api/portal/timeline?limit=5');
  const name = user ? (A.lang === 'ar' ? user.fullNameAr : user.fullNameEn) : '';

  return (
    <>
      <PageHead title={fill(H.greeting, { name })} subtitle={H.sub} />
      <div className="hp-actions">
        <Action icon="plus" title={H.actions.symptom.title} body={H.actions.symptom.body} onClick={() => navigate('patient/timeline?new=1')} />
        <Action icon="upload" title={H.actions.document.title} body={H.actions.document.body} onClick={() => navigate('patient/documents?new=1')} />
        <Action icon="pulse" title={H.actions.assistant.title} body={H.actions.assistant.body} onClick={() => navigate('patient/assistant')} />
        <Action icon="visit" title={H.actions.prepare.title} body={H.actions.prepare.body} onClick={() => navigate('patient/visits?new=1')} />
      </div>

      <Async state={home.state} onRetry={home.reload}>
        {(d) => (
          <div className="na-grid na-grid--2">
            <Card title={H.upNext}>
              {d.upcoming ? (
                <div className="na-stack">
                  <div className="na-bignum">{formatDate(A.lang, d.upcoming.date)}</div>
                  <p dir="auto">{d.upcoming.kind === 'appointment' ? fill(H.appointment, { date: formatDate(A.lang, d.upcoming.date), time: d.upcoming.time }) : d.upcoming.title}</p>
                  <div>
                    <Button variant="primary" onClick={() => navigate(`patient/visits?new=1`)}>
                      {H.prepareThis}
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState title={H.nothingUpcoming} body={H.nothingUpcomingBody} />
              )}
            </Card>

            {(d.latestPrep?.status === 'draft' || d.documentsWithSuggestions > 0 || d.activeShares > 0) && (
              <Card>
                <div className="na-stack">
                  {d.latestPrep?.status === 'draft' && (
                    <Notice tone="info" icon="visit">
                      <strong>{H.continuePrep}</strong>
                      <br />
                      {H.continuePrepBody}{' '}
                      <button type="button" className="na-link" onClick={() => navigate(`patient/visits/prep/${d.latestPrep!.id}`)}>
                        {A.health.common.open}
                      </button>
                    </Notice>
                  )}
                  {d.documentsWithSuggestions > 0 && (
                    <Notice tone="warn" icon="documents">
                      <strong>{H.suggestionsTitle}</strong>
                      <br />
                      {fill(H.suggestionsBody, { n: d.documentsWithSuggestions })}{' '}
                      <button type="button" className="na-link" onClick={() => navigate('patient/documents')}>
                        {H.review}
                      </button>
                    </Notice>
                  )}
                  {d.activeShares > 0 && (
                    <Notice tone="info" icon="link">
                      <strong>{H.sharesTitle}</strong>
                      <br />
                      {fill(H.sharesBody, { n: d.activeShares })}{' '}
                      <button type="button" className="na-link" onClick={() => navigate('patient/sharing')}>
                        {H.manageShares}
                      </button>
                    </Notice>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </Async>

      <Card
        title={H.recent}
        actions={
          <Button small variant="quiet" onClick={() => navigate('patient/timeline')}>
            {H.seeAll}
          </Button>
        }
      >
        <Async
          state={recent.state}
          onRetry={recent.reload}
          isEmpty={(d) => d.length === 0}
          empty={
            <EmptyState
              title={H.emptyTitle}
              body={H.emptyBody}
              action={
                <Button variant="primary" onClick={() => navigate('patient/timeline?new=1')}>
                  {H.actions.symptom.title}
                </Button>
              }
            />
          }
        >
          {(items) => (
            <ul className="na-list">
              {items.map((i) => (
                <li key={i.id} className="na-list-item">
                  <div className="na-row">
                    <Pill>{A.common.recordType[i.type]}</Pill>
                    <ProvenancePill provenance={i.provenance} />
                    <ReviewPill status={i.reviewStatus} />
                  </div>
                  <strong className="na-item-title" dir="auto">
                    {titleOf(i, A)}
                  </strong>
                  <span className="na-muted">{formatDate(A.lang, i.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>
    </>
  );
};
