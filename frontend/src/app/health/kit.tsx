import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRequest } from '../api.js';
import { AppIcon } from '../AppIcons.js';
import { Button, Dialog, Pill, type Tone } from '../ui.js';
import { useA } from '../useA.js';

/** Small shared pieces of the patient-owned record screens. Nothing here stores health data outside component memory. */

export type Origin = 'patient' | 'assistant' | 'document' | 'clinician' | 'upload' | 'ai_suggestion';

const ORIGIN_TONE: Record<Origin, Tone> = { patient: 'lilac', assistant: 'lilac', document: 'info', clinician: 'ok', upload: 'lilac', ai_suggestion: 'warn' };

/** Where a fact came from, always as a word. An unconfirmed machine reading is never styled like a confirmed fact. */
export const OriginPill: React.FC<{ origin: Origin; dashed?: boolean }> = ({ origin, dashed }) => {
  const A = useA();
  return (
    <span className={dashed || origin === 'ai_suggestion' ? 'hp-dashed' : undefined}>
      <Pill tone={ORIGIN_TONE[origin] ?? 'neutral'}>{A.health.common.source[origin] ?? origin}</Pill>
    </span>
  );
};

/**
 * Where a fact came from, as a quiet line. What the patient typed themselves needs no label beyond the words;
 * anything that did not come from them (a document, a clinician, a machine reading) is marked, and an unconfirmed
 * machine reading is always dashed.
 */
export const SourceLine: React.FC<{ origin: Origin; confirmed?: boolean; date?: string }> = ({ origin, confirmed = true, date }) => {
  const A = useA();
  const label = A.health.common.source[origin] ?? origin;
  return (
    <span className="hp-source">
      {origin === 'patient' || origin === 'upload' ? <span>{label}</span> : <OriginPill origin={origin} />}
      {!confirmed && <span className="hp-source-flag">{A.health.common.reviewNeeds}</span>}
      {date && <span>{date}</span>}
    </span>
  );
};

// ---------------------------------------------------------------- undo toast

export interface ToastState {
  text: string;
  undo?: () => void;
  tone?: 'ok' | 'danger';
}

export function useToast(durationMs = 8000) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hide = useCallback(() => setToast(null), []);
  const show = useCallback(
    (t: ToastState) => {
      window.clearTimeout(timer.current);
      setToast(t);
      timer.current = window.setTimeout(() => setToast(null), t.undo ? durationMs : 4000);
    },
    [durationMs],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { toast, show, hide };
}

export const Toast: React.FC<{ toast: ToastState | null; onClose: () => void }> = ({ toast, onClose }) => {
  const A = useA();
  if (!toast) return null;
  return (
    <div className="hp-toast" role={toast.tone === 'danger' ? 'alert' : 'status'} data-tone={toast.tone}>
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          type="button"
          className="hp-toast-btn"
          onClick={() => {
            toast.undo?.();
            onClose();
          }}
        >
          {A.health.common.undo}
        </button>
      )}
      <button type="button" className="hp-toast-x" onClick={onClose} aria-label={A.health.common.close}>
        ×
      </button>
    </div>
  );
};

// ---------------------------------------------------------------- confirm dialog

export const ConfirmDialog: React.FC<{
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  /** When set, the confirm button stays disabled until the person ticks this statement. */
  requireCheck?: string;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ title, body, confirmLabel, danger, pending, requireCheck, onConfirm, onClose }) => {
  const A = useA();
  const [checked, setChecked] = useState(false);
  return (
    <Dialog title={title} onClose={onClose}>
      <p>{body}</p>
      {requireCheck && (
        <label className="cg-check" style={{ marginBlock: 12 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{requireCheck}</span>
        </label>
      )}
      <div className="na-form-actions">
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={pending || (!!requireCheck && !checked)}>
          {confirmLabel}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {A.health.common.cancel}
        </Button>
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------- severity

/** Three plain-language choices stored as 3 / 6 / 9 out of 10, so a person never has to rate a feeling on a scale. */
export const SEVERITY_VALUE = { mild: 3, moderate: 6, severe: 9 } as const;
export type SeverityWord = keyof typeof SEVERITY_VALUE;
export const severityWord = (n: number | null | undefined): SeverityWord | null => (!n ? null : n <= 3 ? 'mild' : n <= 6 ? 'moderate' : 'severe');

export const SeverityPicker: React.FC<{ value: number | null; onChange: (n: number) => void; labels: Record<SeverityWord, string>; name: string; legend: string; required?: boolean; error?: string }> = ({ value, onChange, labels, name, legend, required, error }) => {
  const A = useA();
  const current = severityWord(value);
  const errId = `${name}-err`;
  return (
    <fieldset className="na-fieldset hp-seg" aria-describedby={error ? errId : undefined} data-invalid={error ? 'true' : undefined}>
      <legend>
        {legend}
        {required && <span className="na-req">{A.health.common.required}</span>}
      </legend>
      <div className="hp-seg-row" role="radiogroup" aria-label={legend} aria-required={required || undefined} aria-invalid={error ? true : undefined}>
        {(Object.keys(SEVERITY_VALUE) as SeverityWord[]).map((w) => (
          <label key={w} className="hp-seg-opt" data-on={current === w}>
            <input type="radio" name={name} checked={current === w} onChange={() => onChange(SEVERITY_VALUE[w])} />
            <span>{labels[w]}</span>
          </label>
        ))}
      </div>
      {error && (
        <p className="na-error" id={errId} role="alert">
          <AppIcon name="alert" size={14} />
          {error}
        </p>
      )}
    </fieldset>
  );
};

// ---------------------------------------------------------------- numbers, dates, doses worth double-checking after dictation

/** Things a speech engine often gets wrong: numbers with units, dates and times. The person must look at them before saving. */
export function extractCheckTokens(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|ml|g|iu|units?|%|ملغ|ملغم|مجم|مل|وحدة|مرات?)/gi,
    /\b\d{1,4}[/.-]\d{1,2}(?:[/.-]\d{1,4})?\b/g,
    /\b\d{1,2}:\d{2}\b/g,
    /\b\d+(?:[.,]\d+)?\b/g,
  ];
  for (const re of patterns) for (const m of text.match(re) ?? []) found.add(m.trim());
  return [...found].slice(0, 8);
}

// ---------------------------------------------------------------- speech input

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
}

const recognitionCtor = (): (new () => RecognitionLike) | null => {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

/**
 * Browser speech-to-text. Where the browser has none, `supported` is false and the typed field is the whole feature.
 * The transcript is appended to a normal text field, so the person always edits it before anything is saved.
 * Note: in Chrome and Edge the audio is processed by the browser vendor's speech service, not by Naseej.
 */
export function useSpeech(lang: 'ar' | 'en', onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<'denied' | 'failed' | null>(null);
  const rec = useRef<RecognitionLike | null>(null);
  const supported = typeof window !== 'undefined' && !!recognitionCtor();

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>)
        .map((res) => res[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) onText(text);
    };
    r.onerror = (e: any) => setError(e?.error === 'not-allowed' || e?.error === 'service-not-allowed' ? 'denied' : e?.error === 'no-speech' || e?.error === 'aborted' ? null : 'failed');
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang, onText]);

  useEffect(() => () => rec.current?.stop(), []);
  return { supported, listening, error, start, stop };
}

export const MicButton: React.FC<{ listening: boolean; supported: boolean; onStart: () => void; onStop: () => void; error: 'denied' | 'failed' | null }> = ({ listening, supported, onStart, onStop, error }) => {
  const A = useA();
  const S = A.health.symptoms;
  if (!supported) return <p className="na-help">{S.micUnavailable}</p>;
  return (
    <div className="hp-mic">
      <button type="button" className="na-btn na-btn--small" aria-pressed={listening} onClick={listening ? onStop : onStart} data-listening={listening}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0014 0M12 18v3" />
        </svg>
        {listening ? S.micStop : S.mic}
      </button>
      <span className="na-help" role="status">
        {listening ? S.micListening : error === 'denied' ? S.micDenied : ''}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------- images

export const MAX_BYTES = 4 * 1024 * 1024;

/** Phone photos are often larger than the 4 MB limit. A photo is scaled down and re-encoded; PDFs are sent as they are. */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png)$/.test(file.type) || file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });

/** The route in the app for a record reference such as "document:<id>". */
export function routeForRef(ref: string, documentId?: string): string {
  const [prefix] = ref.split(':');
  if (documentId || prefix === 'document' || prefix === 'fact') return 'patient/documents';
  if (prefix === 'symptom') return 'patient/timeline';
  if (prefix === 'appt') return 'patient/appointments';
  return 'patient/profile';
}

export const useOnline = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
};

/**
 * Asks the server whether free text describes an emergency. The rules live on the server (services/health/safety.ts) and
 * answer with the fixed message; the browser only shows it. A network failure returns null: it never blocks saving.
 */
export function useSafetyCheck() {
  const request = useRequest();
  const A = useA();
  return useCallback(
    async (text: string): Promise<string | null> => {
      if (!text.trim()) return null;
      const res = await request<{ urgent: boolean; message: string | null }>('/api/assistant/safety', { method: 'POST', body: { text, lang: A.lang } });
      return res.ok && res.data.urgent ? res.data.message : null;
    },
    [request, A.lang],
  );
}

export const UrgentNotice: React.FC<{ message: string }> = ({ message }) => (
  <div className="hp-msg hp-msg--urgent" role="alert">
    <p dir="auto">{message}</p>
  </div>
);
