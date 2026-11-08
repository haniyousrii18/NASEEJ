import { describe, expect, it } from 'vitest';
import { appT } from '../src/app/i18n/index.js';
import { translations } from '../src/i18n/translations.js';

/**
 * Both dictionaries must really speak their own language. A key that exists in both trees is not enough: an Arabic entry that
 * was pasted in English (or the reverse) type-checks and still shows the wrong language when the site language changes.
 */

type Leaf = { path: string; value: string };
const leaves = (node: unknown, path: string, out: Leaf[] = []): Leaf[] => {
  if (typeof node === 'string') out.push({ path, value: node });
  else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => leaves(v, path ? `${path}.${k}` : k, out));
  return out;
};

const ARABIC = /[؀-ۿ]/;
// Names and notations that are the same in both languages, and the other language's own name for itself (a language picker).
const NEUTRAL = /^(?:[\s\d.,:;!?()/%+&|·•–—\-_'"«»#@*=<>[\]{}~]|Naseej|QR|PDF|ID|SMS|AI|URL|mg|ml|IU|kg|cm|mmHg|bpm|HbA1c|Caps Lock|Dock|macOS|Sonoma|Safari|Share|Add|Home Screen|File|English|Synthetic Data|\{[a-zA-Z]+\})+$/i;
const latinWords = (s: string) => (s.replace(/\{[a-zA-Z]+\}/g, '').match(/[A-Za-z]{3,}/g) ?? []).filter((w) => !/^(Naseej|QR|PDF|URL|SMS|Caps|Lock|macOS|Sonoma|Safari|Dock|Synthetic|Data|English|Mohammed|Mansoor|Share|Home|Screen|Add|File|HbA|IU|mmHg|bpm|ID|API|AI|JPG|JPEG|PNG|HEIC|WebP|MB|GB|KB|Tab|Enter|Escape|Home|End|PageUp|PageDown|Shift|Ctrl|Alt)$/i.test(w));

const trees: Array<[string, unknown, unknown]> = [
  ['app', appT.ar, appT.en],
  ['site', translations.ar, translations.en],
];

describe('each dictionary is written in its own language', () => {
  for (const [name, ar, en] of trees) {
    it(`${name}: no Arabic entry is written in English`, () => {
      const bad = leaves(ar, name).filter((l) => !ARABIC.test(l.value) && !NEUTRAL.test(l.value) && latinWords(l.value).length > 0);
      expect(bad.map((b) => `${b.path} = ${b.value.slice(0, 60)}`)).toEqual([]);
    });

    it(`${name}: no English entry is written in Arabic`, () => {
      const bad = leaves(en, name).filter((l) => ARABIC.test(l.value));
      // the Arabic name of the language and of the product are meant to appear in English too
      const allowed = (v: string) => /^[\s؀-ۿ]{1,12}$/.test(v) || /نَسيج|العربية/.test(v);
      expect(bad.filter((b) => !allowed(b.value)).map((b) => `${b.path} = ${b.value.slice(0, 60)}`)).toEqual([]);
    });
  }
});
