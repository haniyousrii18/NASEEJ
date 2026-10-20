import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApiData, useMutation, useRequest } from '../api.js';
import { fill, formatDate, todayIso, addDays } from '../format.js';
import { AppIcon } from '../AppIcons.js';
import { Button, Drawer, Field, Notice, PageHead, Pill } from '../ui.js';
import { useA } from '../useA.js';
import { SymptomForm, SYMPTOM_FREQ, type SymptomValue } from './forms.js';
import { MicButton, OriginPill, SeverityPicker, Toast, UrgentNotice, routeForRef, useOnline, useSafetyCheck, useSpeech, useToast, type Origin } from './kit.js';
import { DatePicker } from '../DatePicker.js';

interface Citation {
  ref: string;
  type: string;
  title: string;
  date: string | null;
  origin: Origin;
  documentId?: string;
}
type Reply =
  | { kind: 'urgent'; message: string }
  | { kind: 'refused'; message: string }
  | { kind: 'reply'; intent: string; message: string; citations: Citation[]; nextQuestion: string | null; symptomDraft: Record<string, any> | null; navigateTo: string | null };

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  reply?: Reply;
}
interface Status {
  configured: boolean;
  provider: string | null;
  consent: boolean;
}

const NAV_ROUTE: Record<string, string> = {
  home: 'patient/home',
  profile: 'patient/profile',
  timeline: 'patient/timeline',
  documents: 'patient/documents',
  visits: 'patient/visits',
  prepare: 'patient/visits?new=1',
  sharing: 'patient/sharing',
  settings: 'patient/settings',
};

/** A symptom the assistant drafted. Nothing is saved: the person opens the same form used everywhere and saves it there. */
const DraftCard: React.FC<{ draft: Record<string, any>; onReview: () => void; onDiscard: () => void; done: boolean }> = ({ draft, onReview, onDiscard, done }) => {
  const A = useA();
  const D = A.health.assistant.draft;
  const S = A.health.symptoms;
  if (done) return <Notice tone="ok" icon="check" live>{D.saved}</Notice>;
  const rows: Array<[string, string]> = [
    [S.what, draft.symptom_description],
    [S.severity, draft.severity ? S.sev[draft.severity <= 3 ? 'mild' : draft.severity <= 6 ? 'moderate' : 'severe'] : ''],
    [S.start, draft.onset_date ? formatDate(A.lang, String(draft.onset_date).slice(0, 10)) : ''],
    [S.duration, draft.duration_text],
    [S.frequency, draft.frequency ? (S.freq as Record<string, string>)[draft.frequency] : ''],
    [S.better, draft.better_factors],
    [S.worse, draft.worse_factors],
    [S.notes, draft.notes],
  ].filter(([, v]) => v) as Array<[string, string]>;
  return (
    <div className="hp-draft">
      <strong>{D.title}</strong>
      <dl className="na-dl">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd dir="auto">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="na-help">{D.note}</p>
      <div className="na-row">
        <Button small variant="primary" onClick={onReview}>
          {D.edit}
        </Button>
        <Button small variant="quiet" onClick={onDiscard}>
          {D.discard}
        </Button>
      </div>
    </div>
  );
};

const Bubble: React.FC<{ m: Msg; navigate: (r: string) => void; onDraft: (d: Record<string, any>, id: number) => void; onDiscard: (id: number) => void; savedIds: Set<number>; discarded: Set<number> }> = ({ m, navigate, onDraft, onDiscard, savedIds, discarded }) => {
  const A = useA();
  const T = A.health.assistant;
  if (m.role === 'user') {
    return (
      <li className="hp-msg hp-msg--me">
        <span className="hp-msg-who">{T.you}</span>
        <p dir="auto">{m.content}</p>
      </li>
    );
  }
  const r = m.reply;
  if (r?.kind === 'urgent') {
    return (
      <li className="hp-msg hp-msg--urgent" role="alert">
        <span className="hp-msg-who">{T.urgent}</span>
        <p dir="auto">{r.message}</p>
      </li>
    );
  }
  return (
    <li className="hp-msg">
      <span className="hp-msg-who">{T.assistant}</span>
      <p dir="auto">{m.content}</p>
      {r?.kind === 'reply' && r.nextQuestion && !m.content.includes(r.nextQuestion) && (
        <p dir="auto">
          <strong>{r.nextQuestion}</strong>
        </p>
      )}
      {r?.kind === 'reply' && r.intent === 'not_found' && <Pill tone="warn">{T.notFound}</Pill>}
      {r?.kind === 'reply' && r.citations.length > 0 && (
        <div className="hp-cites">
          <span className="na-label">{T.sources}</span>
          <ul>
            {r.citations.map((c) => (
              <li key={c.ref}>
                <OriginPill origin={c.origin} />
                <span dir="auto">
                  {c.title}
                  {c.date ? ` · ${formatDate(A.lang, c.date)}` : ''}
                </span>
                <button type="button" className="na-link" onClick={() => navigate(routeForRef(c.ref, c.documentId))}>
                  {A.health.common.open}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r?.kind === 'reply' && r.symptomDraft && !discarded.has(m.id) && <DraftCard draft={r.symptomDraft} done={savedIds.has(m.id)} onReview={() => onDraft(r.symptomDraft!, m.id)} onDiscard={() => onDiscard(m.id)} />}
      {r?.kind === 'reply' && r.navigateTo && NAV_ROUTE[r.navigateTo] && (
        <div>
          <Button small onClick={() => navigate(NAV_ROUTE[r.navigateTo!])}>
            {fill(T.open, { where: T.where[r.navigateTo as keyof typeof T.where] ?? '' })}
          </Button>
        </div>
      )}
      {r?.kind === 'refused' && (
        <div>
          <Button small onClick={() => navigate('patient/visits?new=1')}>
            {T.where.prepare}
          </Button>
        </div>
      )}
    </li>
  );
};

// ---------------------------------------------------------------- guided capture (works with no AI at all)

const STEPS = ['what', 'when', 'severity', 'frequency', 'better', 'worse', 'notes'] as const;
type Step = (typeof STEPS)[number];

const Guided: React.FC<{ onReview: (v: SymptomValue, voiced: boolean) => void; onCancel: () => void }> = ({ onReview, onCancel }) => {
  const A = useA();
  const G = A.health.assistant.guided;
  const S = A.health.symptoms;
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [voiced, setVoiced] = useState(false);
  const [a, setA] = useState<SymptomValue>({ onsetDate: todayIso() });
  const [whenOther, setWhenOther] = useState(false);
  const [done, setDone] = useState(false);
  const [urgent, setUrgent] = useState<string | null>(null);
  const safety = useSafetyCheck();
  const step: Step = STEPS[i];
  const field = useRef<HTMLTextAreaElement>(null);

  const speech = useSpeech(
    A.lang,
    useCallback((t: string) => {
      setVoiced(true);
      setText((x) => (x ? `${x} ${t}` : t));
    }, []),
  );

  useEffect(() => {
    field.current?.focus();
  }, [i]);

  const next = (patch: Partial<SymptomValue> = {}) => {
    const merged = { ...a, ...patch };
    setA(merged);
    setText('');
    setWhenOther(false);
    if (i + 1 >= STEPS.length) setDone(true);
    else setI(i + 1);
  };
  const submitText = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (step === 'what') {
      if (!t) return;
      const msg = await safety(t);
      if (msg) setUrgent(msg);
      return next({ description: t });
    }
    if (step === 'better') return next({ betterFactors: t || null });
    if (step === 'worse') return next({ worseFactors: t || null });
    if (step === 'notes') return next({ notes: t || null });
  };

  if (done) {
    return (
      <div className="na-stack">
        {urgent && <UrgentNotice message={urgent} />}
        <strong>{G.review}</strong>
        <dl className="na-dl">
          <dt>{S.what}</dt>
          <dd dir="auto">{a.description}</dd>
          <dt>{S.start}</dt>
          <dd>{a.onsetDate ? formatDate(A.lang, a.onsetDate) : ''}</dd>
          {a.severity && (
            <>
              <dt>{S.severity}</dt>
              <dd>{S.sev[a.severity <= 3 ? 'mild' : a.severity <= 6 ? 'moderate' : 'severe']}</dd>
            </>
          )}
          {a.frequency && (
            <>
              <dt>{S.frequency}</dt>
              <dd>{(S.freq as Record<string, string>)[a.frequency]}</dd>
            </>
          )}
          {a.betterFactors && (
            <>
              <dt>{S.better}</dt>
              <dd dir="auto">{a.betterFactors}</dd>
            </>
          )}
          {a.worseFactors && (
            <>
              <dt>{S.worse}</dt>
              <dd dir="auto">{a.worseFactors}</dd>
            </>
          )}
          {a.notes && (
            <>
              <dt>{S.notes}</dt>
              <dd dir="auto">{a.notes}</dd>
            </>
          )}
        </dl>
        <p className="na-help">{G.reviewNote}</p>
        <div className="na-row">
          <Button variant="primary" onClick={() => onReview(a, voiced)}>
            {A.health.assistant.draft.edit}
          </Button>
          <Button variant="quiet" onClick={onCancel}>
            {G.cancel}
          </Button>
        </div>
      </div>
    );
  }

  const isText = step === 'what' || step === 'better' || step === 'worse' || step === 'notes';
  return (
    <div className="na-stack" aria-live="polite">
      {urgent && <UrgentNotice message={urgent} />}
      <p className="na-help">{fill(G.stepOf, { n: i + 1, total: STEPS.length })}</p>
      <strong>{G.q[step]}</strong>
      {isText && (
        <form className="na-stack" onSubmit={submitText}>
          <label className="hp-visually-hidden" htmlFor="gd-text">
            {G.q[step]}
          </label>
          <textarea id="gd-text" ref={field} className="na-textarea" dir="auto" rows={2} maxLength={step === 'what' ? 1000 : 500} value={text} onChange={(e) => setText(e.target.value)} />
          <MicButton listening={speech.listening} supported={speech.supported} onStart={speech.start} onStop={speech.stop} error={speech.error} />
          <div className="na-row">
            <Button type="submit" variant="primary" disabled={step === 'what' && !text.trim()}>
              {A.health.common.next}
            </Button>
            {step !== 'what' && (
              <Button variant="quiet" onClick={() => next()}>
                {A.health.common.skip}
              </Button>
            )}
            <Button variant="quiet" onClick={onCancel}>
              {G.cancel}
            </Button>
          </div>
        </form>
      )}
      {step === 'when' && (
        <div className="na-stack">
          <div className="hp-chips" role="group" aria-label={G.q.when}>
            <button type="button" className="na-chip" onClick={() => next({ onsetDate: todayIso() })}>
              {G.whenOpts.today}
            </button>
            <button type="button" className="na-chip" onClick={() => next({ onsetDate: addDays(todayIso(), -1) })}>
              {G.whenOpts.yesterday}
            </button>
            <button type="button" className="na-chip" onClick={() => next({ onsetDate: addDays(todayIso(), -3) })}>
              {G.whenOpts.week}
            </button>
            <button type="button" className="na-chip" aria-pressed={whenOther} onClick={() => setWhenOther(true)}>
              {G.whenOpts.other}
            </button>
          </div>
          {whenOther && (
            <Field label={G.pickDate} htmlFor="gd-date">
              <DatePicker id="gd-date" max={todayIso()} value="" autoFocus onChange={(e) => e.target.value && next({ onsetDate: e.target.value })} />
            </Field>
          )}
        </div>
      )}
      {step === 'severity' && (
        <SeverityPicker value={null} onChange={(n) => next({ severity: n })} labels={S.sev} name="gd-sev" legend={G.q.severity} />
      )}
      {step === 'frequency' && (
        <div className="hp-chips" role="group" aria-label={G.q.frequency}>
          {SYMPTOM_FREQ.map((f) => (
            <button key={f} type="button" className="na-chip" onClick={() => next({ frequency: f })}>
              {S.freq[f]}
            </button>
          ))}
          <button type="button" className="na-chip" onClick={() => next()}>
            {A.health.common.skip}
          </button>
        </div>
      )}
      {(step === 'when' || step === 'severity' || step === 'frequency') && (
        <div>
          <Button variant="quiet" onClick={onCancel}>
            {G.cancel}
          </Button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- record search (no AI)

const Search: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const T = A.health.assistant.search;
  const request = useRequest();
  const [q, setQ] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [results, setResults] = useState<Array<{ ref: string; type: string; title: string; summary: string; date: string | null; origin: Origin; documentId?: string }> | null>(null);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setState('loading');
    const res = await request<any[]>(`/api/record/search?q=${encodeURIComponent(q.trim())}&lang=${A.lang}`);
    if (!res.ok) return setState('error');
    setResults(res.data);
    setState('idle');
  };
  return (
    <div className="na-stack">
      <form className="hp-add" onSubmit={go} role="search">
        <label className="hp-visually-hidden" htmlFor="sr-q">
          {T.title}
        </label>
        <input id="sr-q" type="search" className="na-input" dir="auto" placeholder={T.placeholder} value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        <Button type="submit" disabled={q.trim().length < 2 || state === 'loading'}>
          {T.go}
        </Button>
      </form>
      <p className="na-help">{T.hint}</p>
      {state === 'error' && (
        <Notice tone="danger" icon="alert" live>
          {A.health.common.failed}
        </Notice>
      )}
      {results && (
        <div aria-live="polite">
          {results.length === 0 ? (
            <p className="na-muted">{T.none}</p>
          ) : (
            <>
              <p className="na-help">{fill(T.results, { n: results.length })}</p>
              <ul className="na-list">
                {results.map((r) => (
                  <li key={r.ref} className="na-list-item">
                    <div className="na-row">
                      <OriginPill origin={r.origin} />
                      {r.date && <span className="na-muted">{formatDate(A.lang, r.date)}</span>}
                    </div>
                    <strong dir="auto">{r.title}</strong>
                    {r.summary && (
                      <span className="na-muted" dir="auto">
                        {r.summary}
                      </span>
                    )}
                    <div>
                      <Button small variant="quiet" onClick={() => navigate(routeForRef(r.ref, r.documentId))}>
                        {A.health.common.open}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- page

let nextId = 1;

export const PatientAssistant: React.FC<{ navigate: (r: string) => void }> = ({ navigate }) => {
  const A = useA();
  const T = A.health.assistant;
  const status = useApiData<Status>('/api/assistant/status');
  const consent = useMutation();
  const request = useRequest();
  const online = useOnline();
  const [consentOverride, setConsentOverride] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; value: SymptomValue; origin: 'assistant' | 'form' | 'voice' } | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [discarded, setDiscarded] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<'ask' | 'symptom' | 'search'>('ask');
  const { toast, show, hide } = useToast();
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const st = status.state.status === 'ready' ? status.state.data : null;
  const configured = !!st?.configured;
  const consented = consentOverride ?? !!st?.consent;
  const ready = configured && consented;

  const speech = useSpeech(
    A.lang,
    useCallback((t: string) => setInput((x) => (x ? `${x} ${t}` : t)), []),
  );

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [msgs.length, sending]);

  const setConsent = async (allowed: boolean) => {
    const res = await consent.run('/api/assistant/consent', 'POST', { allowed });
    if (res.ok) setConsentOverride(allowed);
    else show({ text: T.consentFailed, tone: 'danger' });
  };

  const send = async (text: string, history = msgs) => {
    const clean = text.trim();
    if (!clean || sending) return;
    const mine: Msg = { id: nextId++, role: 'user', content: clean };
    const thread = [...history, mine];
    setMsgs(thread);
    setInput('');
    setError(null);
    setSending(true);
    const payload = thread.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    const res = await request<Reply>('/api/assistant/chat', { method: 'POST', body: { messages: payload, lang: A.lang } });
    setSending(false);
    if (!res.ok) {
      const code = res.error.status === 0 ? 'NETWORK' : res.error.code;
      return setError({ code, text: (T.errors as Record<string, string>)[code] ?? T.errors.default });
    }
    const r = res.data;
    setMsgs((m) => [...m, { id: nextId++, role: 'assistant', content: r.kind === 'reply' ? r.message : r.message, reply: r }]);
  };

  const retry = () => {
    // Re-send the last question: drop it from the thread first so it is not repeated twice.
    const last = [...msgs].reverse().find((m) => m.role === 'user');
    if (!last) return;
    const history = msgs.slice(0, msgs.lastIndexOf(last));
    setMsgs(history);
    void send(last.content, history);
  };

  const draftToValue = (d: Record<string, any>): SymptomValue => ({
    description: d.symptom_description,
    severity: d.severity ?? null,
    onsetDate: d.onset_date ?? null,
    durationText: d.duration_text ?? null,
    frequency: d.frequency ?? null,
    betterFactors: d.better_factors ?? null,
    worseFactors: d.worse_factors ?? null,
    notes: d.notes ?? null,
  });

  const quick = [T.quick.lastTest, T.quick.meds, T.quick.prepare];

  return (
    <>
      <PageHead title={T.title} subtitle={T.subtitle} />
      <div className="hp-stack">
        {status.state.status === 'ready' && !configured && (
          <Notice tone="info" icon="alert">
            <strong>{T.notConnectedTitle}</strong>
            <br />
            {T.notConnectedBody}
          </Notice>
        )}
        {status.state.status === 'error' && (
          <Notice tone="danger" icon="alert" live>
            {A.health.common.failed}{' '}
            <button type="button" className="na-link" onClick={status.reload}>
              {A.health.common.retry}
            </button>
          </Notice>
        )}
        {configured && !consented && (
          <section className="hp-consent" aria-labelledby="as-consent">
            <h2 id="as-consent" className="hp-h2">
              {T.consentTitle}
            </h2>
            <p>{fill(T.consentBody, { provider: st?.provider ?? '' })}</p>
            <Button variant="primary" onClick={() => void setConsent(true)} disabled={consent.pending}>
              {T.consentOn}
            </Button>
          </section>
        )}

        <div className="hp-modes" role="tablist" aria-label={T.title}>
          {(['ask', 'symptom', 'search'] as const).map((m) => (
            <button key={m} type="button" role="tab" id={`as-tab-${m}`} aria-selected={mode === m} aria-controls={`as-panel-${m}`} className="hp-mode" onClick={() => setMode(m)}>
              {T.modes[m]}
            </button>
          ))}
        </div>

        {mode === 'ask' && (
          <section className="hp-panel" id="as-panel-ask" role="tabpanel" aria-labelledby="as-tab-ask">
            <p className="hp-scope">
              <AppIcon name="shield" size={16} className="hp-scope-icon" />
              {T.scope}
            </p>
            <ol className="hp-thread" aria-live="polite" aria-label={T.title}>
              {msgs.length === 0 && (
                <li className="hp-msg">
                  <span className="hp-msg-who">{T.assistant}</span>
                  <p>{T.welcome}</p>
                </li>
              )}
              {msgs.map((m) => (
                <Bubble
                  key={m.id}
                  m={m}
                  navigate={navigate}
                  savedIds={saved}
                  discarded={discarded}
                  onDraft={(d, id) => setEditing({ id, value: draftToValue(d), origin: 'assistant' })}
                  onDiscard={(id) => setDiscarded((x) => new Set(x).add(id))}
                />
              ))}
              {sending && (
                <li className="hp-msg" role="status">
                  <span className="hp-msg-who">{T.assistant}</span>
                  <p className="na-muted">{T.thinking}</p>
                </li>
              )}
            </ol>
            <div ref={end} />

            {error && (
              <Notice tone="danger" icon="alert" live>
                {error.text}{' '}
                {error.code !== 'AI_CONSENT_REQUIRED' && error.code !== 'AI_NOT_CONFIGURED' && (
                  <button type="button" className="na-link" onClick={retry}>
                    {A.health.common.retry}
                  </button>
                )}
              </Notice>
            )}
            {!online && (
              <Notice tone="warn" icon="alert" live>
                {T.errors.NETWORK}
              </Notice>
            )}

            {ready && (
              <div className="hp-chips" role="group" aria-label={T.suggestions}>
                {quick.map((q) => (
                  <button key={q} type="button" className="na-chip" disabled={sending} onClick={() => void send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            <form
              className="hp-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <label className="hp-visually-hidden" htmlFor="as-input">
                {T.placeholder}
              </label>
              <textarea
                id="as-input"
                ref={box}
                className="na-textarea"
                dir="auto"
                rows={2}
                maxLength={2000}
                placeholder={ready ? T.placeholder : configured ? T.consentTitle : T.notConnectedTitle}
                value={input}
                disabled={!ready}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
              />
              <div className="hp-composer-row">
                {ready ? <MicButton listening={speech.listening} supported={speech.supported} onStart={speech.start} onStop={speech.stop} error={speech.error} /> : <span />}
                <Button type="submit" variant="primary" disabled={!ready || sending || !input.trim()}>
                  {T.send}
                </Button>
              </div>
            </form>
            {ready && (
              <div>
                <Button small variant="quiet" onClick={() => void setConsent(false)} disabled={consent.pending}>
                  {T.consentOff}
                </Button>
              </div>
            )}
          </section>
        )}

        {mode === 'symptom' && (
          <section className="hp-panel" id="as-panel-symptom" role="tabpanel" aria-labelledby="as-tab-symptom">
            <Guided
              onCancel={() => setMode('ask')}
              onReview={(value, voiced) => {
                setMode('ask');
                setEditing({ id: null, value, origin: voiced ? 'voice' : 'form' });
              }}
            />
          </section>
        )}

        {mode === 'search' && (
          <section className="hp-panel" id="as-panel-search" role="tabpanel" aria-labelledby="as-tab-search">
            <Search navigate={navigate} />
          </section>
        )}
      </div>

      {editing && (
        <Drawer title={A.health.symptoms.newTitle} subtitle={T.draft.note} onClose={() => setEditing(null)}>
          <SymptomForm
            initial={editing.value}
            origin={editing.origin}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              if (editing.id !== null) setSaved((s) => new Set(s).add(editing.id!));
              setEditing(null);
              show({ text: A.health.symptoms.saved });
            }}
          />
        </Drawer>
      )}
      <Toast toast={toast} onClose={hide} />
    </>
  );
};
