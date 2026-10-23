import React, { useCallback, useId, useMemo, useState } from 'react';
import { useApiData, useMutation } from '../api.js';
import { AppIcon, type IconName } from '../AppIcons.js';
import { DatePicker } from '../DatePicker.js';
import { fill, formatDate } from '../format.js';
import { Button, Drawer, EmptyState, ErrorState, Field, Notice, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { FilterBar } from './filters.js';
import { routeForRef } from './kit.js';

/**
 * The patient's timeline. It is read-only by design: there is no add, edit or delete anywhere on it. Events are derived
 * on the server from the record and from software readings of the patient's documents, each one saying where it came
 * from and how sure that source is. Clinical text is shown exactly as written, never translated or rephrased. The only thing a patient does here is choose events for a visit summary; that
 * choice is copied into the summary and never touches an event.
 */
type Category = 'condition' | 'medication' | 'allergy' | 'procedure' | 'test' | 'symptom' | 'visit' | 'document' | 'other';
type Origin = 'record_ai' | 'patient' | 'clinician' | 'upload';
type Certainty = 'clear' | 'check' | 'conflict' | 'undated';

interface TlEvent {
  ref: string;
  category: Category;
  title: string;
  detail: string;
  date: string | null;
  origin: Origin;
  confirmedByPatient: boolean;
  certainty: Certainty;
  confidence: number | null;
  source: { documentId: string; title: string | null; page: number | null; passage: string | null } | null;
  rationale: string | null;
  conflictsWith: string[];
}

interface TlData {
  events: TlEvent[];
  status: { aiConfigured: boolean; documents: { total: number; readable: number; waiting: number; failed: number; notAllowed: number } };
}

const CATEGORIES: Category[] = ['condition', 'medication', 'allergy', 'procedure', 'test', 'symptom', 'visit', 'document', 'other'];
const ORIGINS: Origin[] = ['record_ai', 'patient', 'clinician', 'upload'];
const FLAGS = ['check', 'conflict', 'undated'] as const;
const MAX_CHOSEN = 60;

const CATEGORY_ICON: Record<Category, IconName> = {
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
// An origin is always a word and a glyph, never colour alone.
const ORIGIN_ICON: Record<Origin, IconName> = { record_ai: 'search', patient: 'user', clinician: 'shield', upload: 'upload' };
const FLAG_ICON: Record<(typeof FLAGS)[number], IconName> = { check: 'alert', conflict: 'alert', undated: 'clock' };
const FLAG_TONE = { check: 'warn', conflict: 'danger', undated: 'neutral' } as const;

const confidenceBand = (c: number | null): 'none' | 'low' | 'medium' | 'high' => (c === null ? 'none' : c < 0.6 ? 'low' : c < 0.85 ? 'medium' : 'high');

const todayIso = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- one event

const EventCard: React.FC<{
  event: TlEvent;
  byRef: Map<string, TlEvent>;
  selecting: boolean;
  chosen: boolean;
  atLimit: boolean;
  onToggle: (ref: string) => void;
  onOpenDocument: (e: TlEvent) => void;
  onJump: (ref: string) => void;
}> = ({ event: e, byRef, selecting, chosen, atLimit, onToggle, onOpenDocument, onJump }) => {
  const A = useA();
  const T = A.health.tl;
  const [open, setOpen] = useState(false);
  const uid = useId();
  const flag = e.certainty === 'clear' ? null : e.certainty;
  const noteKey = e.origin === 'record_ai' && e.confirmedByPatient ? 'confirmed' : e.origin;
  const band = confidenceBand(e.confidence);

  return (
    <li id={`tl-${e.ref.replace(':', '-')}`} className="hp-tl-item" data-origin={e.origin} data-flag={flag ?? undefined} data-chosen={chosen || undefined}>
      <span className="hp-tl-dot" aria-hidden="true">
        <AppIcon name={CATEGORY_ICON[e.category]} size={18} />
      </span>
      <article className="hp-tl-card" aria-labelledby={`${uid}-t`}>
        <div className="hp-tl-head">
          <div className="hp-tl-when">
            {e.date ? <time dateTime={e.date}>{formatDate(A.lang, e.date)}</time> : <span>{T.undated}</span>}
            <span className="hp-tl-cat">{T.category[e.category]}</span>
          </div>
          {selecting && (
            <label className="hp-tl-pick" data-disabled={(!chosen && atLimit) || undefined}>
              <input type="checkbox" checked={chosen} disabled={!chosen && atLimit} onChange={() => onToggle(e.ref)} />
              <span className="hp-visually-hidden">{fill(T.select.include, { title: e.title })}</span>
              <span className="hp-tl-box" aria-hidden="true">
                {chosen && <AppIcon name="check" size={16} />}
              </span>
            </label>
          )}
        </div>

        <h3 id={`${uid}-t`} className="hp-tl-title">
          <bdi>{e.title}</bdi>
        </h3>
        {e.detail && (
          <p className="hp-tl-detail">
            <bdi>{e.detail}</bdi>
          </p>
        )}

        <div className="hp-tl-marks">
          <span className="hp-tl-origin">
            <AppIcon name={ORIGIN_ICON[e.origin]} size={15} />
            {T.origin[e.origin]}
          </span>
          {e.confirmedByPatient && <span className="hp-tl-mark">{T.confirmedMark}</span>}
          {flag && (
            <Pill tone={FLAG_TONE[flag]}>
              <span className="hp-tl-pill">
                <AppIcon name={FLAG_ICON[flag]} size={14} />
                {T.certainty[flag]}
              </span>
            </Pill>
          )}
        </div>
        {flag && <p className="hp-tl-flagnote">{T.certaintyHelp[flag]}</p>}

        <button type="button" className="hp-tl-more" aria-expanded={open} aria-controls={`${uid}-src`} onClick={() => setOpen((v) => !v)}>
          {open ? T.source.hide : T.source.show}
          <AppIcon name="chevron" size={14} className="hp-tl-chev" />
        </button>
        {open && (
          <div className="hp-tl-source" id={`${uid}-src`}>
            <p className="hp-tl-note">{T.originNote[noteKey]}</p>
            {e.source ? (
              <dl className="hp-tl-dl">
                <dt>{T.source.doc}</dt>
                <dd>
                  <bdi>{e.source.title}</bdi>
                  {e.source.page ? <span className="na-ltr"> · {T.source.page} {e.source.page}</span> : null}
                </dd>
                {e.source.passage && (
                  <>
                    <dt>{T.source.passage}</dt>
                    <dd>
                      <blockquote className="hp-tl-quote">
                        <bdi>{e.source.passage}</bdi>
                      </blockquote>
                    </dd>
                  </>
                )}
                {e.origin === 'record_ai' && !e.confirmedByPatient && (
                  <>
                    <dt>{T.confidence.label}</dt>
                    <dd>
                      {T.confidence[band]}
                      {e.confidence !== null && <span className="na-ltr"> · {Math.round(e.confidence * 100)}%</span>}
                    </dd>
                  </>
                )}
                {e.rationale && (
                  <>
                    <dt>{T.source.rationale}</dt>
                    <dd>
                      <bdi>{e.rationale}</bdi>
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="hp-tl-note">{T.source.none}</p>
            )}
            {e.conflictsWith.length > 0 && (
              <div className="hp-tl-conflicts">
                <p className="hp-tl-dt">{T.source.conflicts}</p>
                <ul>
                  {e.conflictsWith.map((ref) => {
                    const other = byRef.get(ref);
                    if (!other) return null;
                    return (
                      <li key={ref}>
                        <button type="button" className="hp-tl-link" onClick={() => onJump(ref)}>
                          <bdi>{other.title}{other.detail ? ` · ${other.detail}` : ''}</bdi>
                          {other.date && <span className="na-ltr"> · {formatDate(A.lang, other.date)}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {e.source && (
              <Button small variant="quiet" icon="external" onClick={() => onOpenDocument(e)}>
                {T.source.open}
              </Button>
            )}
          </div>
        )}
      </article>
    </li>
  );
};

// ---------------------------------------------------------------- review and create a visit summary

const ReviewDrawer: React.FC<{
  chosen: TlEvent[];
  onRemove: (ref: string) => void;
  onClose: () => void;
  onCreated: (id: string) => void;
}> = ({ chosen, onRemove, onClose, onCreated }) => {
  const A = useA();
  const R = A.health.tl.review;
  const { run, pending } = useMutation();
  const [date, setDate] = useState('');
  const [noDate, setNoDate] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const unverified = chosen.filter((e) => e.origin === 'record_ai' && !e.confirmedByPatient);
  const flagged = unverified.filter((e) => e.certainty !== 'clear').length + chosen.filter((e) => !(e.origin === 'record_ai' && !e.confirmedByPatient) && e.certainty !== 'clear').length;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    const res = await run<{ id: string }>('/api/prep', 'POST', { visit_date: noDate ? null : date || null, reason: reason.trim(), lang: A.lang, refs: chosen.map((e) => e.ref) });
    if (!res.ok) return setError(res.error.status === 0 ? A.health.common.offline : R.failed);
    onCreated(res.data.id);
  };

  return (
    <Drawer title={R.title} subtitle={R.subtitle} onClose={onClose}>
      <form className="na-form na-form--stack" onSubmit={submit}>
        <label className="cg-check">
          <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} />
          <span>{R.noDate}</span>
        </label>
        {!noDate && (
          <Field label={R.date} htmlFor="tl-visit-date">
            <DatePicker id="tl-visit-date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        <Field label={R.reason} htmlFor="tl-visit-reason">
          <textarea id="tl-visit-reason" className="na-textarea" dir="auto" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <ul className="hp-tl-chosen" aria-label={fill(A.health.tl.select.chosen, { n: chosen.length })}>
          {chosen.map((e) => (
            <li key={e.ref}>
              <span className="hp-tl-chosen-text">
                <strong>
                  <bdi>{e.title}</bdi>
                </strong>
                <span>
                  {e.date ? formatDate(A.lang, e.date) : A.health.tl.undated} · {A.health.tl.origin[e.origin]}
                </span>
              </span>
              <button type="button" className="na-icon-btn" aria-label={fill(R.removeLabel, { title: e.title })} onClick={() => onRemove(e.ref)}>
                <AppIcon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>

        {unverified.length > 0 && (
          <Notice tone="warn" icon="alert">
            {fill(R.unverified, { n: unverified.length })}
            {flagged > 0 && ` ${fill(R.flagged, { n: flagged })}`}
          </Notice>
        )}
        <p className="na-help">
          {R.locked} {R.unchanged}
        </p>
        {error && (
          <Notice tone="danger" icon="alert" live>
            {error}
          </Notice>
        )}
        <div className="na-form-actions">
          <Button type="submit" variant="primary" disabled={pending || chosen.length === 0}>
            {pending ? R.creating : R.create}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {A.health.common.cancel}
          </Button>
        </div>
      </form>
    </Drawer>
  );
};

// ---------------------------------------------------------------- the page

const Skeleton: React.FC = () => {
  const A = useA();
  return (
    <div className="hp-tl-skel" role="status" aria-live="polite" aria-label={A.common.states.loading}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="hp-tl-skel-card">
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
};

export const PatientTimeline: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const T = A.health.tl;
  const { state, reload } = useApiData<TlData>(`/api/record/events?lang=${A.lang}`);

  const [cats, setCats] = useState<Category[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  // Opening the page with ?select=1 (from Today) starts choosing events for a visit summary.
  const [selecting, setSelecting] = useState(() => /[?&]select=1/.test(window.location.hash));
  const [chosen, setChosen] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const all = state.status === 'ready' ? state.data.events : [];
  const byRef = useMemo(() => new Map(all.map((e) => [e.ref, e])), [all]);

  const visible = useMemo(
    () =>
      all.filter(
        (e) =>
          (cats.length === 0 || cats.includes(e.category)) &&
          (origins.length === 0 || origins.includes(e.origin)) &&
          (flags.length === 0 || flags.includes(e.certainty)) &&
          (!from || (e.date !== null && e.date >= from)) &&
          (!to || (e.date !== null && e.date <= to)),
      ),
    [all, cats, origins, flags, from, to],
  );

  const groups = useMemo(() => {
    const m = new Map<string, TlEvent[]>();
    for (const e of visible) {
      const k = e.date ? e.date.slice(0, 4) : 'none';
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m];
  }, [visible]);

  const toggle = <V,>(list: V[], set: (v: V[]) => void, v: V) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const reset = () => {
    setCats([]);
    setOrigins([]);
    setFlags([]);
    setFrom('');
    setTo('');
  };
  const toggleChosen = useCallback((ref: string) => setChosen((c) => (c.includes(ref) ? c.filter((x) => x !== ref) : [...c, ref])), []);
  const stopSelecting = () => {
    setSelecting(false);
    setChosen([]);
    setReviewing(false);
  };
  const openDocument = useCallback((e: TlEvent) => navigate(routeForRef(e.ref, e.source?.documentId)), [navigate]);
  const jump = useCallback((ref: string) => {
    const el = document.getElementById(`tl-${ref.replace(':', '-')}`);
    if (!el) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    el.querySelector<HTMLElement>('.hp-tl-more')?.focus({ preventScroll: true });
  }, []);

  const chosenEvents = chosen.map((r) => byRef.get(r)).filter((e): e is TlEvent => !!e);
  const filtersActive = cats.length + origins.length + flags.length + (from ? 1 : 0) + (to ? 1 : 0) > 0;
  const status = state.status === 'ready' ? state.data.status : null;
  const docs = status?.documents;

  const actions = (
    <>
      <Button small variant="quiet" icon="message" onClick={() => navigate('patient/symptoms')} title={T.reportSymptomHelp}>
        {T.reportSymptom}
      </Button>
      {all.length > 0 && !selecting && (
        <Button small variant="primary" icon="summary" onClick={() => setSelecting(true)}>
          {T.select.start}
        </Button>
      )}
      {selecting && (
        <Button small onClick={stopSelecting}>
          {T.select.cancel}
        </Button>
      )}
    </>
  );

  // The empty state says why, in order of what the patient can act on.
  const emptyBlock = () => {
    if (!docs) return null;
    if (docs.waiting > 0) return <EmptyState title={T.empty.waitingTitle} body={T.empty.waitingBody} action={<Button small icon="refresh" onClick={() => void reload()}>{T.status.refresh}</Button>} />;
    if (docs.failed > 0 && docs.readable === 0)
      return <EmptyState title={T.empty.unreadableTitle} body={T.empty.unreadableBody} action={<Button small onClick={() => navigate('patient/documents')}>{T.empty.docs}</Button>} />;
    if (!status!.aiConfigured && docs.total > 0)
      return <EmptyState title={T.empty.offTitle} body={T.empty.offBody} action={<Button small onClick={() => navigate('patient/documents')}>{T.empty.docs}</Button>} />;
    return <EmptyState title={T.empty.title} body={T.empty.body} action={<Button small onClick={() => navigate('patient/documents')}>{T.empty.docs}</Button>} />;
  };

  return (
    <>
      <PageHead title={T.title} subtitle={T.subtitle} actions={actions} />
      <div className="hp-stack">
        <aside className="hp-tl-about" aria-label={T.legendTitle}>
          <p>{T.about}</p>
          <ul className="hp-tl-legend">
            {ORIGINS.map((o) => (
              <li key={o} data-origin={o}>
                <AppIcon name={ORIGIN_ICON[o]} size={15} />
                {T.origin[o]}
              </li>
            ))}
          </ul>
        </aside>

        {status && (docs!.total > 0 || !status.aiConfigured) && (
          <div className="hp-tl-status">
            {docs!.total > 0 && (
              <ul className="hp-tl-status-list">
                <li>{fill(T.status.readOf, { n: docs!.readable, total: docs!.total })}</li>
                {docs!.waiting > 0 && <li>{fill(T.status.waiting, { n: docs!.waiting })}</li>}
                {docs!.failed > 0 && (
                  <li data-tone="warn">
                    <AppIcon name="alert" size={14} />
                    {fill(T.status.failed, { n: docs!.failed })}
                  </li>
                )}
                {docs!.notAllowed > 0 && <li>{fill(T.status.notAllowed, { n: docs!.notAllowed })}</li>}
              </ul>
            )}
            <div className="na-row">
              {docs!.waiting > 0 && (
                <Button small variant="quiet" icon="refresh" onClick={() => void reload()}>
                  {T.status.refresh}
                </Button>
              )}
              {(docs!.failed > 0 || docs!.notAllowed > 0) && (
                <Button small variant="quiet" onClick={() => navigate('patient/documents')}>
                  {T.status.openDocs}
                </Button>
              )}
            </div>
            {!status.aiConfigured && docs!.total > 0 && (
              <Notice tone="info" icon="alert">
                {T.status.aiOff}
              </Notice>
            )}
          </div>
        )}

        {all.length > 0 && (
          <FilterBar
            open={showFilters}
            onToggle={() => setShowFilters((v) => !v)}
            onReset={reset}
            active={[
              ...cats.map((c) => ({ key: `c-${c}`, label: T.category[c], onRemove: () => setCats(cats.filter((x) => x !== c)) })),
              ...origins.map((o) => ({ key: `o-${o}`, label: T.origin[o], onRemove: () => setOrigins(origins.filter((x) => x !== o)) })),
              ...flags.map((f) => ({ key: `f-${f}`, label: T.certainty[f as (typeof FLAGS)[number]], onRemove: () => setFlags(flags.filter((x) => x !== f)) })),
              ...(from ? [{ key: 'from', label: `${A.common.filters.from}: ${formatDate(A.lang, from)}`, onRemove: () => setFrom('') }] : []),
              ...(to ? [{ key: 'to', label: `${A.common.filters.to}: ${formatDate(A.lang, to)}`, onRemove: () => setTo('') }] : []),
            ]}
          >
            <fieldset className="hp-fieldset">
              <legend>{T.filters.category}</legend>
              <div className="na-chips">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" className="na-chip" aria-pressed={cats.includes(c)} onClick={() => toggle(cats, setCats, c)}>
                    {T.category[c]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="hp-fieldset">
              <legend>{T.filters.origin}</legend>
              <div className="na-chips">
                {ORIGINS.map((o) => (
                  <button key={o} type="button" className="na-chip" aria-pressed={origins.includes(o)} onClick={() => toggle(origins, setOrigins, o)}>
                    {T.origin[o]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="hp-fieldset">
              <legend>{T.filters.certainty}</legend>
              <div className="na-chips">
                {FLAGS.map((f) => (
                  <button key={f} type="button" className="na-chip" aria-pressed={flags.includes(f)} onClick={() => toggle(flags, setFlags, f)}>
                    {T.certainty[f]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="hp-fieldset">
              <legend>{T.filters.range}</legend>
              <div className="hp-pair">
                <Field label={A.common.filters.from} htmlFor="tl-from">
                  <DatePicker id="tl-from" value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field label={A.common.filters.to} htmlFor="tl-to">
                  <DatePicker id="tl-to" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                </Field>
              </div>
            </fieldset>
          </FilterBar>
        )}

        {selecting && (
          <Notice tone="info" icon="summary">
            {T.select.intro}
          </Notice>
        )}

        {state.status === 'loading' && <Skeleton />}
        {state.status === 'error' && <ErrorState error={state.error} onRetry={() => void reload()} />}
        {state.status === 'ready' && all.length === 0 && emptyBlock()}
        {state.status === 'ready' && all.length > 0 && visible.length === 0 && (
          <EmptyState title={T.empty.filteredTitle} body={T.empty.filteredBody} action={<Button small onClick={reset}>{A.health.common.clearAll}</Button>} />
        )}

        {visible.length > 0 && (
          <>
            <p className="na-help" role="status">
              {fill(T.count, { n: visible.length, total: all.length })}
            </p>
            {groups.map(([year, events]) => (
              <section key={year} className="hp-tl-group" aria-labelledby={`tl-y-${year}`}>
                <h2 id={`tl-y-${year}`} className="hp-tl-year">
                  {year === 'none' ? T.undated : <span className="na-ltr">{year}</span>}
                  <span className="hp-tl-yearcount">{events.length}</span>
                </h2>
                <ol className="hp-tl-list">
                  {events.map((e) => (
                    <EventCard
                      key={e.ref}
                      event={e}
                      byRef={byRef}
                      selecting={selecting}
                      chosen={chosen.includes(e.ref)}
                      atLimit={chosen.length >= MAX_CHOSEN}
                      onToggle={toggleChosen}
                      onOpenDocument={openDocument}
                      onJump={jump}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
        {filtersActive && visible.length > 0 && <span className="hp-visually-hidden" role="status">{fill(T.count, { n: visible.length, total: all.length })}</span>}
      </div>

      {selecting && (
        <div className="hp-tl-tray" role="region" aria-label={T.select.start}>
          <p className="hp-tl-tray-count" role="status">
            {chosen.length === 0 ? T.select.none : fill(T.select.chosen, { n: chosen.length })}
            {chosen.length >= MAX_CHOSEN && <span> · {fill(T.select.max, { n: MAX_CHOSEN })}</span>}
          </p>
          <div className="na-row">
            {chosen.length > 0 && (
              <Button small variant="quiet" onClick={() => setChosen([])}>
                {T.select.clear}
              </Button>
            )}
            <Button small variant="primary" disabled={chosen.length === 0} onClick={() => setReviewing(true)}>
              {T.select.review}
            </Button>
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewDrawer
          chosen={chosenEvents}
          onRemove={(ref) => {
            const next = chosen.filter((x) => x !== ref);
            setChosen(next);
            if (next.length === 0) setReviewing(false);
          }}
          onClose={() => setReviewing(false)}
          onCreated={(id) => navigate(`patient/visits/prep/${id}`)}
        />
      )}
    </>
  );
};
