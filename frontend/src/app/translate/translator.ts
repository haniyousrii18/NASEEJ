import type { Language } from '../../i18n/translations.js';

/**
 * Translations of typed text, shared by every screen. The server decides (and stores) the translation; this class batches the
 * texts that are on screen into few requests, keeps the answers in memory only (never in browser storage: they are health
 * text), and tells listeners when something changed. Answers are keyed by the language being shown, so switching the page
 * language asks for, and shows, the other direction without touching what the person has typed.
 */
export type Reason = 'no_provider' | 'mixed' | 'uncertain' | 'failed' | 'not_allowed';
export type Item = { status: 'same' } | { status: 'ok'; text: string; from: Language; provider?: string } | { status: 'unavailable'; reason: Reason };
export type Entry = { state: 'loading' } | { state: 'same' } | { state: 'ok'; text: string; from: Language; provider?: string } | { state: 'unavailable'; reason: Reason };

/** Resolves one batch. Returning null or throwing counts as a failed request. */
export type Fetcher = (texts: string[], target: Language) => Promise<Item[] | null>;

const BATCH = 20;
/** "Unavailable" answers are asked again after a minute, so a provider being configured is picked up without a reload. */
const RETRY_AFTER_MS = 60_000;

export class Translator {
  private entries = new Map<string, { entry: Entry; at: number }>();
  private queue = new Map<string, { text: string; target: Language }>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;

  constructor(private fetcher: Fetcher) {}

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

  peek(text: string, target: Language): Entry | undefined {
    const hit = this.entries.get(this.key(text, target));
    if (!hit) return undefined;
    if (hit.entry.state === 'unavailable' && Date.now() - hit.at > RETRY_AFTER_MS) return undefined;
    return hit.entry;
  }

  request(text: string, target: Language) {
    const k = this.key(text, target);
    if (this.peek(text, target) || this.queue.has(k)) return;
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
      const entry: Entry = !it ? { state: 'unavailable', reason: 'failed' } : it.status === 'ok' ? { state: 'ok', text: it.text, from: it.from, provider: it.provider } : it.status === 'same' ? { state: 'same' } : { state: 'unavailable', reason: it.reason };
      this.entries.set(this.key(text, target), { entry, at: now });
    });
    this.emit();
  }
}
