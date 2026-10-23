import React from 'react';
import { UserText } from '../translate/UserText.js';
import { useAuth } from '../../context/AuthContext.js';
import { useApiData } from '../api.js';
import { fill, formatDate, localeOf } from '../format.js';
import { AppIcon, type IconName } from '../AppIcons.js';
import { Button, ErrorState, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { routeForRef } from './kit.js';

interface HomeData {
  counts: { entries: number; symptoms: number; documents: number };
  lastSymptom: { id: string; description: string; onsetDate: string } | null;
  upcoming: { kind: 'appointment'; id: string; date: string; time: string } | { kind: 'visit'; id: string; date: string; title: string } | null;
  latestPrep: { id: string; visitDate: string | null; status: 'draft' | 'approved' } | null;
  activeShares: number;
  documentsWithSuggestions: number;
  assistantConsent: boolean;
}

/** The few fields of a timeline event the dashboard shows. The timeline itself stays read-only and lives on its own page. */
interface TlEvent {
  ref: string;
  category: 'condition' | 'medication' | 'allergy' | 'procedure' | 'test' | 'symptom' | 'visit' | 'document' | 'other';
  title: string;
  date: string | null;
  origin: 'record_ai' | 'patient' | 'clinician' | 'upload';
  confirmedByPatient: boolean;
  certainty: 'clear' | 'check' | 'conflict' | 'undated';
  source: { documentId: string } | null;
}
interface TlData {
  events: TlEvent[];
  status: { documents: { total: number; waiting: number } };
}

const CATEGORY_ICON: Record<TlEvent['category'], IconName> = {
  condition: 'pulse',
  medication: 'pill',
  allergy: 'alert',
  procedure: 'visit',
  test: 'flask',
  symptom: 'message',
  visit: 'calendar',
  document: 'documents',
  other: 'scroll',
};
const ORIGIN_ICON: Record<TlEvent['origin'], IconName> = { record_ai: 'search', patient: 'user', clinician: 'shield', upload: 'upload' };
const RECENT_COUNT = 4;

const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const daysUntil = (iso: string) => Math.round((dayStart(iso).getTime() - todayStart().getTime()) / 86_400_000);
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A section that enters in sequence. `--i` is its place in the order; reduced motion turns the entrance off. */
const Block: React.FC<{ id: string; i: number; className?: string; children: React.ReactNode }> = ({ id, i, className, children }) => (
  <section className={`hp-td-block${className ? ` ${className}` : ''}`} aria-labelledby={id} style={{ '--i': i } as React.CSSProperties}>
    {children}
  </section>
);

const Skeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => {
  const A = useA();
  return (
    <div className="hp-td-skel" role="status" aria-live="polite" aria-label={A.common.states.loading}>
      {Array.from({ length: lines }, (_, k) => (
        <i key={k} />
      ))}
    </div>
  );
};

/** A row that leads somewhere: used for things that need the patient and for the few quick actions. */
const Row: React.FC<{ icon: IconName; title: React.ReactNode; body?: string; onClick: () => void }> = ({ icon, title, body, onClick }) => (
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
 * Today. In order of what is time-sensitive: the next visit, what waits on the patient, the visit summary, and the latest
 * on the timeline. Everything shown comes from the record; a scheduled visit, a past event and a software reading are
 * labelled differently, and an empty section says what the patient can do next. No scores, streaks or invented data.
 */
export const PatientToday: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const H = A.health.home;
  const T = A.health.tl;
  const { user } = useAuth();
  const home = useApiData<HomeData>('/api/record/home');
  const events = useApiData<TlData>(`/api/record/events?lang=${A.lang}`);
  const name = user ? (A.lang === 'ar' ? user.fullNameAr : user.fullNameEn) : '';
  const first = name.trim().split(/\s+/)[0] ?? '';
  const d = home.state.status === 'ready' ? home.state.data : null;

  const when = (iso: string) => {
    const n = daysUntil(iso);
    return n <= 0 ? H.todayTag : n === 1 ? H.tomorrowTag : fill(H.inDays, { n });
  };

  // ------------------------------------------------------------ upcoming care
  const nextCare = () => {
    if (home.state.status === 'loading') return <Skeleton lines={2} />;
    if (home.state.status === 'error') return <ErrorState error={home.state.error} onRetry={home.reload} />;
    const up = home.state.data.upcoming;
    if (!up) {
      return (
        <div className="hp-td-empty">
          <p className="hp-td-lead">{H.nothingUpcoming}</p>
          <p className="na-muted">{H.nothingUpcomingBody}</p>
          <div className="hp-td-actions">
            <Button variant="primary" icon="plus" onClick={() => navigate('patient/profile?tab=visit&new=1')}>
              {H.addVisit}
            </Button>
            <Button variant="quiet" onClick={() => navigate('patient/timeline?select=1')}>
              {H.prepChoose}
            </Button>
          </div>
        </div>
      );
    }
    const day = dayStart(up.date);
    const loc = localeOf(A.lang);
    return (
      <div className="hp-td-next">
        <div className="hp-td-date" aria-hidden="true">
          <span className="hp-td-date-d na-ltr">{new Intl.DateTimeFormat(loc, { day: 'numeric' }).format(day)}</span>
          <span className="hp-td-date-m">{new Intl.DateTimeFormat(loc, { month: 'short' }).format(day)}</span>
        </div>
        <div className="hp-td-next-body">
          <p className="hp-td-lead">{up.kind === 'appointment' ? fill(H.appointment, { date: formatDate(A.lang, up.date), time: up.time }) : <UserText text={up.title} />}</p>
          <p className="hp-td-meta">
            <Pill tone="info">{H.upcomingTag}</Pill>
            <span>
              {formatDate(A.lang, up.date)} · {when(up.date)}
            </span>
          </p>
        </div>
        <Button variant="primary" className="hp-td-next-cta" onClick={() => navigate('patient/timeline?select=1')}>
          {H.prepareThis}
        </Button>
      </div>
    );
  };

  // ------------------------------------------------------------ visit summary
  const prep = () => {
    if (home.state.status === 'loading') return <Skeleton lines={2} />;
    if (home.state.status === 'error') return <ErrorState error={home.state.error} onRetry={home.reload} />;
    const p = home.state.data.latestPrep;
    if (!p) {
      return (
        <>
          <p className="na-muted">{H.prepNone}</p>
          <div className="hp-td-actions">
            <Button icon="summary" onClick={() => navigate('patient/timeline?select=1')}>
              {H.prepChoose}
            </Button>
          </div>
        </>
      );
    }
    return (
      <>
        <p className="hp-td-meta">
          <Pill tone={p.status === 'draft' ? 'warn' : 'ok'}>{p.status === 'draft' ? H.prepDraftTag : H.prepApprovedTag}</Pill>
          <span>{p.visitDate ? fill(H.prepForDate, { date: formatDate(A.lang, p.visitDate) }) : H.prepNoDate}</span>
        </p>
        <div className="hp-td-actions">
          <Button variant={p.status === 'draft' ? 'primary' : undefined} onClick={() => navigate(`patient/visits/prep/${p.id}`)}>
            {p.status === 'draft' ? H.continuePrep : H.prepOpen}
          </Button>
          {p.status === 'approved' && (
            <Button variant="quiet" onClick={() => navigate('patient/sharing')}>
              {H.manageShares}
            </Button>
          )}
          <Button variant="quiet" onClick={() => navigate('patient/timeline?select=1')}>
            {H.prepChoose}
          </Button>
        </div>
      </>
    );
  };

  // ------------------------------------------------------------ recent timeline
  const recentList = () => {
    if (events.state.status === 'loading') return <Skeleton />;
    if (events.state.status === 'error') return <ErrorState error={events.state.error} onRetry={events.reload} />;
    const { events: all, status } = events.state.data;
    if (all.length === 0) {
      const waiting = status.documents.waiting > 0;
      return (
        <div className="hp-td-empty">
          <p className="hp-td-lead">{waiting ? T.empty.waitingTitle : H.emptyTitle}</p>
          <p className="na-muted">{waiting ? T.empty.waitingBody : H.emptyBody}</p>
          {!waiting && (
            <div className="hp-td-actions">
              <Button icon="plus" onClick={() => navigate('patient/symptoms?new=1')}>
                {H.actions.symptom.title}
              </Button>
              <Button variant="quiet" onClick={() => navigate('patient/documents?new=1')}>
                {H.actions.document.title}
              </Button>
            </div>
          )}
        </div>
      );
    }
    // Only what has already happened: a future-dated event is care still to come, shown above, not recent activity.
    const today = isoToday();
    const recent = all.filter((e) => e.date && e.date <= today).slice(0, RECENT_COUNT);
    if (recent.length === 0) return <p className="na-muted">{H.noRecent}</p>;
    return (
      <ul className="hp-td-events">
        {recent.map((e) => {
          const unconfirmed = e.origin === 'record_ai' && !e.confirmedByPatient;
          const flag = e.certainty === 'check' || e.certainty === 'conflict' ? e.certainty : null;
          const go = e.ref.startsWith('appt:') ? 'patient/timeline' : routeForRef(e.ref, e.source?.documentId);
          return (
            <li key={e.ref}>
              <button type="button" className="hp-td-event" onClick={() => navigate(go)}>
                <span className="hp-td-event-icon" aria-hidden="true">
                  <AppIcon name={CATEGORY_ICON[e.category]} size={18} />
                </span>
                <span className="hp-td-event-text">
                  <strong>
                    <bdi>{e.title}</bdi>
                  </strong>
                  <span className="hp-td-event-meta">
                    <time dateTime={e.date ?? undefined}>{formatDate(A.lang, e.date)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{T.category[e.category]}</span>
                  </span>
                  <span className="hp-td-event-tags">
                    <span className="hp-td-origin" data-unconfirmed={unconfirmed || undefined}>
                      <AppIcon name={ORIGIN_ICON[e.origin]} size={14} />
                      {T.origin[e.origin]}
                    </span>
                    {e.confirmedByPatient && <span className="hp-td-origin">{T.confirmedMark}</span>}
                    {flag && (
                      <Pill tone={flag === 'conflict' ? 'danger' : 'warn'}>
                        <span className="hp-td-flag">
                          <AppIcon name="alert" size={13} />
                          {T.certainty[flag]}
                        </span>
                      </Pill>
                    )}
                  </span>
                </span>
                <AppIcon name="chevron" size={16} className="hp-row-go" />
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  // ------------------------------------------------------------ what waits on the patient
  const attention: Array<{ key: string; icon: IconName; title: string; body: string; go: string }> = [];
  if (d) {
    if (d.documentsWithSuggestions > 0) attention.push({ key: 'sug', icon: 'documents', title: H.suggestionsTitle, body: fill(H.suggestionsBody, { n: d.documentsWithSuggestions }), go: 'patient/documents' });
    if (d.activeShares > 0) attention.push({ key: 'shares', icon: 'link', title: H.sharesTitle, body: fill(H.sharesBody, { n: d.activeShares }), go: 'patient/sharing' });
  }

  return (
    <>
      <PageHead title={fill(H.greeting, { name: first })} />
      <div className="hp-td">
        <div className="hp-td-main">
          <Block id="td-next" i={0} className="hp-td-hero">
            <h2 id="td-next" className="hp-h2">
              {H.nextCare}
            </h2>
            {nextCare()}
          </Block>

          <Block id="td-prep" i={2}>
            <h2 id="td-prep" className="hp-h2">
              {H.prepTitle}
            </h2>
            {prep()}
          </Block>

          <Block id="td-recent" i={3}>
            <div className="hp-section-h">
              <h2 id="td-recent" className="hp-h2">
                {H.timelineTitle}
              </h2>
              <Button small variant="quiet" onClick={() => navigate('patient/timeline')}>
                {H.seeAll}
              </Button>
            </div>
            {recentList()}
          </Block>
        </div>

        <div className="hp-td-side">
          {attention.length > 0 && (
            <Block id="td-attn" i={1} className="hp-td-attn">
              <h2 id="td-attn" className="hp-h2">
                {H.attention}
              </h2>
              <ul className="hp-rows">
                {attention.map((a) => (
                  <Row key={a.key} icon={a.icon} title={a.title} body={a.body} onClick={() => navigate(a.go)} />
                ))}
              </ul>
            </Block>
          )}

          {d && (
            <Block id="td-glance" i={4}>
              <h2 id="td-glance" className="hp-h2">
                {H.glanceTitle}
              </h2>
              <dl className="hp-td-glance">
                {(['entries', 'symptoms', 'documents'] as const).map((k) => (
                  <div key={k}>
                    <dt>{H.glance[k]}</dt>
                    <dd className="na-ltr">{d.counts[k]}</dd>
                  </div>
                ))}
              </dl>
              {d.lastSymptom && <p className="na-muted">{fill(H.lastSymptom, { date: formatDate(A.lang, d.lastSymptom.onsetDate) })}</p>}
            </Block>
          )}

          <Block id="td-quick" i={5}>
            <h2 id="td-quick" className="hp-h2">
              {H.quick}
            </h2>
            <ul className="hp-rows">
              <Row icon="plus" title={H.actions.symptom.title} body={H.actions.symptom.body} onClick={() => navigate('patient/symptoms?new=1')} />
              <Row icon="upload" title={H.actions.document.title} body={H.actions.document.body} onClick={() => navigate('patient/documents?new=1')} />
              <Row icon="pulse" title={H.actions.assistant.title} body={H.actions.assistant.body} onClick={() => navigate('patient/assistant')} />
            </ul>
          </Block>
        </div>
      </div>
    </>
  );
};
