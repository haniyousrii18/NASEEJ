import { AR_FUNC, AR_NUMBERS, ENTRIES, EN_FUNC, EN_NUMBERS, type Entry } from './lexicon.js';

/**
 * Dictionary translation between Arabic and English for short medical notes. No AI, no network, no permission needed,
 * and the same input always gives the same output.
 *
 * It translates a text ONLY when it understands every word and the sentence has a shape it knows (noun phrases such as
 * "زيارة متابعة القلب" -> "Heart follow-up visit", joined by words like in / since / for). Otherwise it returns null and the
 * caller shows the original. It never drops a word, never guesses an unknown one, and keeps numbers and Latin words as written.
 */

type Form = 'sg' | 'pl' | 'dual' | 'fem';
interface Hit {
  e: Entry;
  form: Form;
}

/** Nouns that can govern another noun ("pain OF the chest"). Only these may head a chain, which keeps "headache nausea" from becoming one phrase. */
const GEN = new Set([
  'pain', 'visit', 'follow-up', 'appointment', 'consultation', 'examination', 'lab test', 'result', 'imaging', 'report', 'prescription',
  'dose', 'treatment', 'procedure', 'surgery', 'swelling', 'bleeding', 'inflammation', 'infection', 'fracture', 'wound', 'burn', 'itching',
  'diagnosis', 'complaint', 'cause', 'condition', 'pressure', 'routine checkup', 'blood pressure',
]);

// ---------------------------------------------------------------------------------------------------- normalisation

export const nz = (s: string) =>
  s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

const strip1 = (w: string) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w);
const canon = (words: string[]) => words.map((w, i) => (i === 0 ? nz(w) : strip1(nz(w)))).join(' ');

const arIndex = new Map<string, Hit>();
const enIndex = new Map<string, Hit>();
for (const e of ENTRIES) {
  const add = (forms: string[] | undefined, form: Form) =>
    forms?.forEach((f) => {
      const k = canon(f.split(' '));
      if (!arIndex.has(k)) arIndex.set(k, { e, form });
    });
  add(e.ar, 'sg');
  add(e.arPl, 'pl');
  if (e.arDual) add([e.arDual], 'dual');
  if (e.arFem) add([e.arFem], 'fem');
  const en = e.en.toLowerCase();
  if (!enIndex.has(en)) enIndex.set(en, { e, form: 'sg' });
  if (e.kind !== 'adj') {
    const pl = (e.enPl ?? (e.en.endsWith('s') || ['mg', 'ml', 'g'].includes(e.en) ? e.en : `${e.en}s`)).toLowerCase();
    if (!enIndex.has(pl)) enIndex.set(pl, { e, form: 'pl' });
  }
}
for (const alias of ['follow up', 'followup']) enIndex.set(alias, enIndex.get('follow-up')!);

const arFunc = new Map(Object.entries(AR_FUNC).map(([k, v]) => [nz(k), v]));
const arNumbers = new Map(Object.entries(AR_NUMBERS).map(([k, v]) => [nz(k), v]));

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, '.').replace(/٬/g, ',');

// ---------------------------------------------------------------------------------------------------- tokens

type Tok = { t: 'num'; v: string; word?: boolean } | { t: 'w'; w: string } | { t: 'p'; c: string };
const TOKEN = /[\d٠-٩]+(?:[.,٫٬][\d٠-٩]+)*(?:\/[\d٠-٩]+)?|[ء-غـ-ٰٕ-ۓ]+|[A-Za-z][A-Za-z'-]*|\s+|./gu;
const PUNCT = new Set([',', '،', ';', '؛', '.', ':', '!', '?', '؟']);

function tokenize(text: string): Tok[] | null {
  const out: Tok[] = [];
  for (const m of text.match(TOKEN) ?? []) {
    if (/^\s+$/.test(m)) continue;
    if (/^[\d٠-٩]/.test(m)) out.push({ t: 'num', v: westernDigits(m) });
    else if (/^[A-Za-zء-غـ-ٰٕ-ۓ]/.test(m)) out.push({ t: 'w', w: m });
    else if (PUNCT.has(m)) out.push({ t: 'p', c: m });
    else return null; // a symbol or bracket this glossary does not handle
  }
  return out;
}

const isArabicWord = (w: string) => /[ء-غـ-ٰٕ-ۓ]/.test(w);
const capital = (s: string) => (/^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s);
const OUT_PUNCT: Record<string, string> = { '،': ',', '؛': ';', '؟': '?' };
const AR_OUT_PUNCT: Record<string, string> = { ',': '،', ';': '؛', '?': '؟' };

function joinPieces(pieces: Array<{ s: string; punct?: boolean }>): string {
  let out = '';
  for (const p of pieces) out += p.punct || !out ? p.s : ` ${p.s}`;
  return out;
}

// ---------------------------------------------------------------------------------------------------- Arabic -> English

interface ArNp {
  nouns: Array<{ hit: Hit; def: boolean }>;
  adjs: string[];
  count?: string;
}

const enPlural = (e: Entry) => e.enPl ?? (e.en.endsWith('s') || ['mg', 'ml', 'g'].includes(e.en) ? e.en : `${e.en}s`);

function renderArNp(np: ArNp): string | null {
  const head = np.nouns[0];
  if (!head) return null;
  if (np.count !== undefined) {
    if (np.nouns.length !== 1) return null;
    const c = Number(np.count);
    const e = head.hit.e;
    if (e.en === 'time') return c === 2 ? 'twice' : c === 1 ? 'once' : `${np.count} times`;
    return [np.count, ...np.adjs, c === 1 ? e.en : enPlural(e)].join(' ');
  }
  if (head.hit.form === 'dual' && head.hit.e.kind !== 'unit') return null;
  const mods = np.nouns.slice(1).reverse().map((n) => n.hit.e.en);
  const headEn = head.hit.form === 'pl' ? enPlural(head.hit.e) : head.hit.e.en;
  const body = [...np.adjs, ...mods, headEn].join(' ');
  return np.nouns.length === 1 && np.nouns[0].def ? `the ${body}` : body;
}

function resolveAr(toks: Tok[], i: number): { len: number; hit: Hit; def: boolean } | null {
  for (const len of [3, 2]) {
    const win = toks.slice(i, i + len);
    if (win.length < len || !win.every((t) => t.t === 'w' && isArabicWord(t.w))) continue;
    const hit = arIndex.get(canon(win.map((t) => (t as { w: string }).w)));
    if (hit && hit.e.ar[0].includes(' ')) return { len, hit, def: false };
    if (hit && (hit.e.arPl?.some((f) => f.includes(' ')) ?? false)) return { len, hit, def: false };
  }
  const t = toks[i];
  if (t.t !== 'w' || !isArabicWord(t.w)) return null;
  const c0 = nz(t.w);
  const direct = arIndex.get(c0);
  if (direct) return { len: 1, hit: direct, def: false };
  const stripped = strip1(c0);
  const def = stripped !== c0 ? arIndex.get(stripped) : undefined;
  return def ? { len: 1, hit: def, def: true } : null;
}

export function arToEn(text: string): string | null {
  const toks = tokenize(text);
  if (!toks || toks.length === 0) return null;
  const out: Array<{ s: string; punct?: boolean }> = [];
  let np: ArNp | null = null;
  let pendingNum: string | null = null;
  let sinceNext = false;
  let failed = false;
  let known = 0; // glossary words actually translated; a text of only passthrough words is not a translation

  const flush = () => {
    if (pendingNum !== null) failed = true; // a number with nothing counted after it
    if (!np) return;
    const s = renderArNp(np);
    if (s === null) failed = true;
    else out.push({ s: sinceNext && np.count !== undefined ? `${s} ago` : s });
    sinceNext = false;
    np = null;
  };

  for (let i = 0; i < toks.length && !failed; i++) {
    const t = toks[i];
    if (t.t === 'p') {
      flush();
      out.push({ s: OUT_PUNCT[t.c] ?? t.c, punct: true });
      continue;
    }
    if (t.t === 'num') {
      if (np && np.count === undefined && np.nouns.length === 1 && t.v === '1') {
        np.count = '1';
        continue;
      }
      flush();
      if (t.v.includes('/')) out.push({ s: t.v }); // a ratio such as 7/10 stays as written
      else pendingNum = t.v;
      continue;
    }
    if (!isArabicWord(t.w)) {
      flush();
      out.push({ s: t.w }); // a Latin word (a drug name, an abbreviation) stays as written
      continue;
    }
    const w = nz(t.w);
    const fn = arFunc.get(w);
    if (fn) {
      flush();
      out.push({ s: fn });
      if (fn === 'since') sinceNext = true;
      continue;
    }
    const numWord = arNumbers.get(w);
    if (numWord !== undefined) {
      if (np && np.count === undefined && np.nouns.length === 1 && numWord === 1) {
        np.count = '1';
        continue;
      }
      flush();
      pendingNum = String(numWord);
      continue;
    }
    let r = resolveAr(toks, i);
    if (!r && w.length > 2 && w.startsWith('و')) {
      // "والدوخة" = و + الدوخة
      const rest: Tok = { t: 'w', w: t.w.replace(/^[وَُِ]+/, '') };
      const probe = [rest, ...toks.slice(i + 1)];
      if (resolveAr(probe, 0) || arNumbers.has(nz(rest.w))) {
        flush();
        out.push({ s: 'and' });
        toks.splice(i, 1, rest);
        i--;
        continue;
      }
    }
    if (!r) {
      failed = true;
      break;
    }
    i += r.len - 1;
    known++;
    const { hit, def } = r;
    if (hit.e.kind === 'adj') {
      if (!np || np.nouns.length === 0) failed = true;
      else np.adjs.push(hit.e.en);
      continue;
    }
    // A noun, or a unit. A dual unit is a count of two ("يومين" = 2 days).
    if (hit.form === 'dual') {
      flush();
      np = { nouns: [{ hit, def }], adjs: [], count: '2' };
      continue;
    }
    if (pendingNum !== null) {
      const count = pendingNum;
      pendingNum = null;
      flush();
      np = { nouns: [{ hit, def }], adjs: [], count };
      pendingNum = null;
      continue;
    }
    const prev: ArNp | null = np;
    const last = prev ? prev.nouns[prev.nouns.length - 1] : null;
    if (prev && prev.count === undefined && prev.adjs.length === 0 && last && !last.def && GEN.has(last.hit.e.en) && prev.nouns.length < 3) {
      prev.nouns.push({ hit, def });
    } else {
      flush();
      np = { nouns: [{ hit, def }], adjs: [], count: undefined };
    }
  }
  if (!failed) flush();
  if (failed || pendingNum !== null || known === 0) return null;
  const s = joinPieces(out);
  return s ? capital(s) : null;
}

// ---------------------------------------------------------------------------------------------------- English -> Arabic

interface EnNp {
  nouns: Hit[]; // English order: modifiers first, head last
  adjs: Hit[];
  def: boolean;
  count?: string;
  fixed?: string;
  ago?: boolean;
}

const withArticle = (w: string) => `ال${w}`;

function renderEnNp(np: EnNp, forceDef = false): string | null {
  if (np.fixed) return np.fixed;
  const def = forceDef || np.def;
  if (np.count !== undefined) {
    if (np.nouns.length !== 1) return null;
    const { e, form } = np.nouns[0];
    const c = Number(np.count);
    let phrase: string;
    if (e.en === 'time') phrase = c === 1 ? 'مرة واحدة' : c === 2 ? 'مرتين' : `${np.count} ${e.arPl?.[0] ?? e.ar[0]}`;
    else if (e.kind === 'unit' && c === 2 && e.arDual) phrase = e.arDual;
    else if (c === 1 && e.kind === 'unit') phrase = e.ar[0];
    else if (e.kind === 'unit') phrase = `${np.count} ${c >= 3 && c <= 10 && e.arPl?.[0] ? e.arPl[0] : e.ar[0]}`;
    else phrase = `${np.count} ${form === 'pl' || c !== 1 ? e.arPl?.[0] ?? e.ar[0] : e.ar[0]}`;
    const adjs = np.adjs.map((a) => (np.nouns[0].e.fem || np.nouns[0].form === 'pl' || c !== 1 ? a.e.arFem : a.e.ar[0]));
    return [phrase, ...adjs].join(' ');
  }
  if (np.nouns.length === 0) return null;
  const chain = [...np.nouns].reverse(); // Arabic order: head first
  for (let i = 0; i < chain.length - 1; i++) if (!GEN.has(chain[i].e.en)) return null;
  const words = chain.map((h, i) => {
    if (i === 0 && h.form === 'pl') return h.e.arPl?.[0];
    return h.e.ar[0];
  });
  if (words.some((w) => !w)) return null;
  const ws = words as string[];
  const chainDef = chain.length > 1 || def;
  const lastIdx = ws.length - 1;
  if (chainDef && !ws[lastIdx].includes(' ')) ws[lastIdx] = withArticle(ws[lastIdx]);
  const head = chain[0];
  const fem = head.e.fem || head.form === 'pl';
  const adjs = np.adjs.map((a) => (fem ? a.e.arFem! : a.e.ar[0])).map((w) => (chainDef ? withArticle(w) : w));
  return [...ws, ...adjs].join(' ');
}

function resolveEn(words: string[], i: number): { len: number; hit: Hit } | null {
  for (const len of [3, 2, 1]) {
    if (i + len > words.length) continue;
    const hit = enIndex.get(words.slice(i, i + len).join(' ').toLowerCase());
    if (hit) return { len, hit };
  }
  return null;
}

type EnItem = { k: 'np'; s: string; counted: boolean; ago: boolean } | { k: 'func'; f: string; word: string } | { k: 'punct'; s: string } | { k: 'of' };

export function enToAr(text: string): string | null {
  const toks = tokenize(text);
  if (!toks || toks.length === 0) return null;
  const words = toks.map((t) => (t.t === 'w' ? t.w.toLowerCase() : ''));
  const items: EnItem[] = [];
  let np: EnNp | null = null;
  let pendingNum: string | null = null;
  let ofPending = false;
  let failed = false;
  let known = 0;

  const flush = () => {
    if (pendingNum !== null) failed = true;
    if (!np) return;
    const s = renderEnNp(np, ofPending);
    if (s === null) {
      failed = true;
      return;
    }
    if (ofPending) {
      const prev = items[items.length - 1];
      if (!prev || prev.k !== 'np') failed = true;
      else prev.s = `${prev.s} ${s}`;
      ofPending = false;
    } else items.push({ k: 'np', s, counted: np.count !== undefined || !!np.fixed, ago: !!np.ago });
    np = null;
  };

  for (let i = 0; i < toks.length && !failed; i++) {
    const t = toks[i];
    if (t.t === 'p') {
      flush();
      items.push({ k: 'punct', s: AR_OUT_PUNCT[t.c] ?? t.c });
      continue;
    }
    if (t.t === 'num') {
      flush();
      if (t.v.includes('/')) items.push({ k: 'np', s: t.v, counted: false, ago: false });
      else pendingNum = t.v;
      continue;
    }
    const w = words[i];
    if (w === 'the') {
      if (np && np.nouns.length > 0) flush();
      np = np ?? { nouns: [], adjs: [], def: false };
      np.def = true;
      continue;
    }
    if (w === 'a' || w === 'an') continue;
    if (w === 'of') {
      flush();
      ofPending = true;
      continue;
    }
    if (w === 'ago') {
      if (np) flush();
      const last = items[items.length - 1];
      if (!last || last.k !== 'np' || !last.counted) failed = true;
      else last.ago = true;
      continue;
    }
    if (w === 'twice' || w === 'once') {
      flush();
      np = { nouns: [], adjs: [], def: false, fixed: w === 'twice' ? 'مرتين' : 'مرة واحدة' };
      flush();
      continue;
    }
    if (EN_NUMBERS[w] !== undefined) {
      flush();
      pendingNum = String(EN_NUMBERS[w]);
      continue;
    }
    if (EN_FUNC[w]) {
      flush();
      items.push({ k: 'func', f: EN_FUNC[w], word: w });
      continue;
    }
    const r = resolveEn(words, i);
    if (!r) {
      failed = true;
      break;
    }
    i += r.len - 1;
    known++;
    const { hit } = r;
    if (hit.e.kind === 'adj') {
      if (np && np.nouns.length > 0) flush();
      np = np ?? { nouns: [], adjs: [], def: false };
      np.adjs.push(hit);
      continue;
    }
    if (pendingNum !== null) {
      const count = pendingNum;
      pendingNum = null;
      flush();
      np = { nouns: [hit], adjs: [], def: false, count };
      continue;
    }
    if (np && np.count !== undefined) flush();
    np = np ?? { nouns: [], adjs: [], def: false };
    if (np.nouns.length >= 3) {
      failed = true;
      break;
    }
    np.nouns.push(hit);
  }
  if (!failed) flush();
  if (failed || pendingNum !== null || ofPending || known === 0) return null;

  const pieces: Array<{ s: string; punct?: boolean }> = [];
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.k === 'punct') pieces.push({ s: it.s, punct: true });
    else if (it.k === 'np') {
      const before = items[k - 1];
      const afterSince = before && before.k === 'func' && before.word === 'since';
      const s = it.ago && !afterSince ? `منذ ${it.s}` : it.s;
      const attach = before && before.k === 'func' && (before.word === 'and' || (before.word === 'for' && !it.counted));
      if (attach && before.k === 'func') {
        const prefix = before.word === 'and' ? 'و' : 'ل';
        const body = prefix === 'ل' && s.startsWith('ال') ? s.slice(1) : s; // ل + ال = لل
        pieces.pop();
        pieces.push({ s: prefix + body });
      } else pieces.push({ s });
    } else if (it.k === 'func') {
      const next = items[k + 1];
      const nextNp = next && next.k === 'np' ? next : null;
      if (it.word === 'for') {
        if (!nextNp) return null;
        pieces.push({ s: nextNp.counted ? 'لمدة' : 'ل' });
      } else pieces.push({ s: it.f });
    }
  }
  const s = joinPieces(pieces);
  return s || null;
}

/** Translates `text` into `target` with the built-in glossary, or returns null when any part is not covered. */
export function glossaryTranslate(text: string, target: 'ar' | 'en'): string | null {
  const clean = text.trim();
  if (!clean || clean.length > 400) return null;
  try {
    return target === 'en' ? arToEn(clean) : enToAr(clean);
  } catch {
    return null;
  }
}
