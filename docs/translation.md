# Arabic / English translation of typed text

What a person types (symptoms, notes, titles, visit reasons) is shown in the language of the page. This is **not** an AI
feature: the assistant, the document reader and every model-backed feature are never used for it.

## Flow

1. A screen renders typed text with `UserText` (`frontend/src/app/translate/UserText.tsx`), never as a bare string.
2. The page batches the texts on screen and asks `POST /api/translations { texts, target }` (patients) or
   `POST /api/share-view/translate { token, texts, target }` (clinicians; only wording inside that share is accepted).
3. The server (`backend/src/services/translation/service.ts`) answers per text:
   - `same`: already in the page language, or no language (numbers, units). Shown as written.
   - `ok`: a translation, with the language it came from. Shown in place, labelled, with "Show original".
   - `unavailable` + reason (`no_provider`, `mixed`, `uncertain`, `failed`, `not_allowed`): the original is shown with a note.
4. Translations are stored in `content_translations`, keyed by (patient, SHA-256 of the original, target language). The same
   wording is translated once and reused everywhere. Edit the text and its hash changes, so the old translation can never be
   shown for new wording. Rows unused for 90 days are pruned. The original text is never modified or copied into that table.
5. A translation is accepted only if every number in the original survives (the Arabic dual for 2, such as يومين, is allowed).

## The provider: `local`

`TRANSLATION_PROVIDER=local` (set in `.env`) turns on the built-in engine, `backend/src/services/translation/localEngine.ts`.
It uses no AI assistant, no LLM, no API key, and no network at run time. For each text it does, in order:

1. **Medical glossary** (`glossary/lexicon.ts` + `engine.ts`): exact, deterministic, readable. Used only when it understands
   every word. Example: `زيارة متابعة القلب` -> `Heart follow-up visit`. Extend coverage by adding lines to `lexicon.ts`.
2. **Local machine translation**: OPUS-MT (Marian) models run on this server by `@huggingface/transformers` (ONNX, int8).
   Install the models once with `npm run translate:models` in `backend/` (about 225 MB, kept in `backend/models/`, not
   committed). Their output is shown labelled "Automatic translation, may not be exact" and is accepted only if it passes
   `quality.ts`: plausible output, numbers preserved, and a **round trip** (translating it back must recover at least 85% of the
   original's content words). Anything that fails is "no reliable translation" and the original is shown.
3. Otherwise: unavailable. Set `TRANSLATION_MT=off` to use only the glossary.

Machine translation of medical text can still be wrong. Treat the original as the record; the "Show original" toggle is always there.

To add another provider, implement `TranslationProvider` (`provider.ts`, `ai: false`) and register it in `providers.ts`.
A language model or a third-party service holding an API key is not allowed for this feature.

## Direction

`directionOf` in `frontend/src/context/LangContext.tsx` is the single place that maps a language to `rtl`/`ltr`.
Language lives in context only; nothing is re-keyed by it, so switching never resets a form.
