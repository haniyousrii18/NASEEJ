import type { Language } from '../../i18n/translations.js';

/**
 * Translation of typed text, shared by every screen. One Translator batches the strings that are on screen into a few
 * requests, remembers the answers in memory only (never in browser storage: they are health text), and tells listeners
 * when something changed. It knows nothing about React or about where the answer comes from.
 */
export type Reason = 'consent' | 'not_configured' | 'uncertain' | 'failed' | 'busy' | 'not_allowed';
export type Item = { status: 'ok'; text: string } | { status: 'unavailable'; reason: Reason };
export type Entry = { state: 'loading' } | { state: 'ok'; text: string } | { state: 'unavailable'; reason: Reason };

/** Resolves one batch. Returning null or throwing counts as a failed request. */
export type Fetcher = (texts: string[], target: Language) => Promise<Item[] | null>;

const BATCH = 20;
const RETRY_AFTER_MS = 60_000;
const TRANSIENT: Reason[] = ['failed', 'busy'];

export class Translator {
  private entries = new Map<string, { entry: Entry; at: number }>();
  private queue = new Map<string, { text: string; target: Language }>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Once the server says translation is off for this person, later requests are answered without a round trip. */
  private off: Reason | null = null;
  private version = 0;

  /** Set by the signed-in app: asks the server for the person's permission to translate, then clears the "off" state. */
  constructor(private fetcher: Fetcher, public enable?: () => Promise<boolean>) {}

  /** Runs `enable`, and on success forgets the "off" answers so every visible text asks again. */
  async turnOn(): Promise<boolean> {
    if (!this.enable) return false;
    const ok = await this.enable().catch(() => false);
    if (ok) this.reset();
    return ok;
  }

  private key = (text: string, target: Language) => `${target}\n${text}`;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  /** The current answer for a text. Call `request` to make one happen. */
  peek(text: string, target: Language): Entry | undefined {
    const hit = this.entries.get(this.key(text, target));
    if (!hit) return undefined;
    if (hit.entry.state === 'unavailable' && TRANSIENT.includes(hit.entry.reason) && Date.now() - hit.at > RETRY_AFTER_MS) return undefined;
    return hit.entry;
  }

  request(text: string, target: Language) {
    const k = this.key(text, target);
    if (this.peek(text, target) || this.queue.has(k)) return;
    if (this.off) {
      this.entries.set(k, { entry: { state: 'unavailable', reason: this.off }, at: Date.now() });
      this.emit();
      return;
    }
    this.entries.set(k, { entry: { state: 'loading' }, at: Date.now() });
    this.queue.set(k, { text, target });
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 0);
  }

  private async flush() {
    this.timer = null;
    const jobs = [...this.queue.values()];
    this.queue.clear();
    for (const target of ['ar', 'en'] as Language[]) {
      const texts = jobs.filter((j) => j.target === target).map((j) => j.text);
      for (let i = 0; i < texts.length; i += BATCH) await this.run(texts.slice(i, i + BATCH), target);
    }
  }

  private async run(texts: string[], target: Language) {
    let items: Item[] | null = null;
    try {
      items = await this.fetcher(texts, target);
    } catch {
      items = null;
    }
    const now = Date.now();
    texts.forEach((text, i) => {
      const it = items?.[i];
      const entry: Entry = it?.status === 'ok' ? { state: 'ok', text: it.text } : { state: 'unavailable', reason: it?.status === 'unavailable' ? it.reason : 'failed' };
      this.entries.set(this.key(text, target), { entry, at: now });
      if (entry.state === 'unavailable' && (entry.reason === 'consent' || entry.reason === 'not_configured')) this.off = entry.reason;
    });
    this.emit();
  }

  /** Forget everything, e.g. after the person turns the assistant on in Settings. */
  reset() {
    this.entries.clear();
    this.queue.clear();
    this.off = null;
    this.emit();
  }
}
