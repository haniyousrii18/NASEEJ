# Bilingual record search

Patients can find their own health information in Arabic and English, whatever the interface language, spelling or small typos.
This is a PostgreSQL-backed, in-process hybrid search. It is **not** Elasticsearch/OpenSearch and uses no AI or external translation.

## Why the old search failed
Each list searched only the text as it was stored (client-side `includes`, or SQL `ILIKE`). A record stored in Arabic ("بنسلين")
was shown as "Penicillin" in the English UI, but typing "Penicillin" matched nothing, because that English word was never in the stored text.
Arabic spelling variants (diacritics, أ/ا, ى/ي, ة/ه) and typos did not match either.

## Entry points (all use the same engine)
| Where | How |
|---|---|
| Assistant → Search my record | `SearchCombobox` → `GET /api/search` |
| Profile lists (conditions, medicines, allergies, ...) | `useSearch` with `types=<kind>`, ranked ids filter the list |
| `GET /api/record/search` (older route) | calls `searchRecords` |
| `GET /api/record/symptoms?q=`, `GET /api/vault/documents?q=` | `searchIds` narrows the SQL list (`id = ANY($n::uuid[])`) |
Not changed: notification filters and clinician-side lookups (not patient record search).

## Architecture
`backend/src/services/search/`
- `normalize.ts` – Unicode (NFKC/NFD) and Arabic folding; keeps a map back to the original characters for highlighting.
- `rank.ts` – pure scoring, unit-tested without a database.
- `searchService.ts` – loads the signed-in patient's live rows, attaches aliases, ranks, pages.

**No separate index.** Every request reads current rows (`patient_id` from the session, `deleted_at IS NULL`, documents visible to the patient).
So a new or edited record is searchable at once, a deleted one disappears at once, and no stale or unauthorized copy can exist.
No migration is needed, so there is no rollback. Corpus caps per request: entries 500, symptoms 300, documents 300, preparations 100, allergies 100.

**Aliases (no invented translations).** A record's searchable text = original text + any translation already stored in
`content_translations` (keyed by the hash of the original) + deterministic glossary forms (`glossaryTranslate`) + bilingual type words
(for example "دواء"/"medication"). Results always show the original stored text; `matched.via` says when a hit came from an alias.

## Normalization
Removes diacritics and tatweel; أ إ آ ٱ → ا; ى ئ → ي; ؤ → و; ة → ه; Arabic-Indic/Persian digits → 0-9; Latin lower-cased without accents;
punctuation → space. Letters that differ clinically (ص/س, ح/خ, ...) are never merged. A leading Arabic article (ال, وال, بال, ...) is ignored when matching.

## Ranking
Every query word must match somewhere in the record (words can be in different fields). Per word, best tier wins:

| Tier | Meaning | Points |
|---|---|---|
| EXACT 4 | whole word equal | 400 |
| PREFIX 3 | record word starts with query word | 300 |
| PART 2 | query word (3+ letters) inside a word | 200 |
| FUZZY 1 | within allowed edits (insert, delete, substitute, transpose) | 100 − edits |

Add field weight × 10 (title 3, details 2, notes / type label 1). Record score = average word score + phrase bonus
(field equals query +400, starts with +200, contains the phrase +100, single exact word +120). Ties: newer date first, then ref.
Fuzzy never outranks exact, because the tier dominates. One result per record, so no duplicates.

**Typo limits:** words under 4 letters allow 0 edits, under 8 allow 1, otherwise 2. Minimum query is 2 characters, maximum 100.

## API
`GET /api/search?q=&types=&limit=&offset=&lang=` (patient only; 401/403 otherwise). `limit` 1–200 (default 20), `offset` ≤ 1000,
unknown `types` → 400, `Cache-Control: no-store`. Response `{ data: hits, meta: { total, limit, offset, hasMore } }`.

## Frontend
- `SearchCombobox` – WAI-ARIA combobox/listbox, grouped by record type, ↑ ↓ Home End Enter Esc, `aria-activedescendant`, live status text,
  loading / no-results / error (with retry), safe `<mark>` highlighting built from React nodes (never HTML).
- `SearchSession` – 250 ms debounce, minimum 2 letters, aborts the previous request, ignores late answers, cancels on reset/sign-out.
- All labels are in `app/i18n/health.ts` (`assistant.search`, `profile.lib`) in Arabic and English; fields use `dir="auto"`, layout uses logical properties.

## Limitations
- Cross-language needs an existing alias: a stored translation (made when the patient viewed the text in the other language), or a glossary entry. Otherwise it is not guessed.
- No Arabic↔Latin transliteration (no safe deterministic rule).
- Words under 4 letters are matched exactly / by prefix only.
- Per-request corpus caps (above) bound the work; a patient with more rows than the caps may miss the oldest ones.
- If volumes grow, the upgrade path is PostgreSQL `pg_trgm` + `tsvector` on a normalized column (a migration with a down-script), keeping `rank.ts` as the re-ranker.
