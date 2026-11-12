# Contributing to Selah

Thank you for wanting to make Selah better. Whether you write code, test it in your church, translate it,
or report a verse the live display missed, it helps.

## Ground rules (non-negotiable)

Selah handles scripture and people in vulnerable moments. Every change must keep these true:

1. **Scripture comes from the database, never from a model.** Models may *suggest references*; the text
   shown or spoken is always read from `data/bible.json`. A reference that doesn't resolve is dropped.
   Teachings may only quote passages they were given; other verses are cited by reference.
2. **Crisis comes first.** If someone may be in danger, the app stops teaching and points them to people
   and emergency help. Don't add a path that can skip `lib/safety.ts` or the model's crisis signal.
3. **No impersonation.** Teaching styles are *inspired by* traditions. Never name, quote, or imitate a
   real preacher as if it were them, and never clone a real person's voice.
4. **Mainstream and humble theology.** Stay within historic Christian teaching, avoid denominational
   disputes, and never promise what God hasn't promised (guaranteed wealth, healing on a timeline…).
5. **Precision over noise in Service mode.** A wrong verse on a church screen is worse than none.
   Recognisers must stay strict; add a test for every new pattern *and* for what it must not catch.

## Getting set up

```bash
npm install
npm run setup          # downloads the public-domain Bibles (~21 MB) and builds data/bible.json
cp .env.local.example .env.local   # add ANTHROPIC_API_KEY
npm run dev            # http://localhost:3000
```

Optional free voice (Kokoro, needs [uv](https://docs.astral.sh/uv/)):

```bash
npm run voice:setup    # Python 3.12 env + ~355 MB of model files from GitHub
npm run voice          # keep running next to `npm run dev`; set TTS_PROVIDER=kokoro
```

Before opening a pull request:

```bash
npm run typecheck
npm test
```

## Where things live

See the **Architecture** section of the [README](README.md) for a full tour. In short:

| Area | Files |
|---|---|
| Bible data, references, search | `lib/bible/*`, `scripts/build-bible.mjs` |
| Teaching, conversation, verse identification | `lib/ai/*` |
| Live sermon detection | `lib/service/spoken.ts`, `quoteMatch` in `lib/bible/keyword.ts` |
| Voice (server) | `lib/tts.ts`, `voice-service/server.py` |
| Voice, music, listening (browser) | `lib/client/*` |
| Screens | `components/*`, `app/*` |
| Design rules | [`docs/DESIGN.md`](docs/DESIGN.md) |

## Recipes

### Add a public-domain Bible translation
1. Add a download line to `scripts/download-bible.sh` (check it is genuinely public domain or openly licensed).
2. Teach `scripts/build-bible.mjs` to read it (JSON or XML) and add it to `TRANSLATIONS` there.
3. Add the id to `TranslationId` and `TRANSLATIONS` in `lib/types.ts` (with its `lang`).
4. Run `npm run setup`, then check versification: the build prints empty slots per translation.

### Add a language
1. Book names: add a name array to the build script, then aliases in `lib/bible/reference.ts` and spoken
   forms / number words in `lib/service/spoken.ts`.
2. Detection: `lib/lang.ts`. Stopwords: `lib/bible/keyword.ts`. Feeling words: `lib/bible/topics.ts`.
3. Crisis copy and patterns: `lib/safety.ts` (please have a native speaker review these).
4. Prompts: `LANG_RULES` in `lib/ai/teach.ts`; conversation replies follow the user's language.
5. Tests for the new spoken forms in `tests/spoken.test.ts`.

### Add a teaching style
Add it to `STYLES` in `lib/types.ts` and describe *how that kind of preacher builds a message*
(structure, devices, vocabulary, closing) in `STYLE_GUIDE` in `lib/ai/teach.ts`. Describe a tradition,
not a person.

### Add a voice provider
Implement it in `lib/tts.ts` (return an MP3 `Buffer` for a piece of text), add it to `ttsProvider()`,
include its voice settings in `cacheKey()`, and document the env vars in `.env.local.example`.

### Improve Service-mode recognition
Reproduce the miss with the **Live** checkbox in the Service test box (it feeds text word by word like
real speech). Add the failing phrase to `tests/spoken.test.ts` or `tests/search.test.ts`, fix it, and add
a nearby phrase that must *not* trigger.

## Pull requests

- Keep changes focused; explain *why* in the description.
- Match the existing style: TypeScript, small modules, comments that explain intent.
- UI changes follow [`docs/DESIGN.md`](docs/DESIGN.md): Poppins, the four-colour palette, no gradients,
  glows or "AI-looking" chrome. Check light, dark and phone widths.
- Prompt changes: include before/after sample outputs in the PR.

## Reporting problems

- **Service mode missed or mis-showed a verse:** use the "Service mode missed a verse" issue template and
  paste the `Heard … →` line.
- **Anything that could harm someone** (a crisis message not caught, harmful advice): open an issue marked
  urgent, or contact the maintainer privately through GitHub.

By contributing you agree to license your work under the project's [MIT License](LICENSE) and to follow
the [Code of Conduct](CODE_OF_CONDUCT.md).
