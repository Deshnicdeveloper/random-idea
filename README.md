# Selah

Tell it how you feel, or the part of a verse you half remember. Selah finds the scripture, and in
Preacher mode brings a short (~2 minute) teaching built on it.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Paste your Anthropic API key into `.env.local` to turn on Preacher mode
and smarter matching. Without a key, Scripture mode still works (references, keyword search,
and hand-picked passages for common feelings).

**Languages:** write in French and the app answers in French from the Louis Segond 1910 (French
references like "Jean 3:16" work too). English uses the KJV or BSB, whichever is selected.

**Natural voice:** add an ElevenLabs or Azure Speech key to `.env.local` (see `.env.local.example`).
Without one, read-aloud uses the browser's voice.

## How it stays trustworthy

- **Verse text never comes from the AI.** All scripture is read from `data/bible.json` (KJV and BSB,
  both public domain). The AI only suggests *references*; each one is checked against the database
  and dropped if it doesn't exist.
- **Teachings quote only the passages they are given.** Other verses are cited by reference, and
  those references become tappable links that open the exact text.
- **Crisis first.** Every message goes through a pattern check, plus the AI's own read. If someone may
  hurt themselves, the teaching is skipped and the app points them to people and emergency numbers
  (`lib/safety.ts`; verify the numbers for every country you launch in).

## How a message flows

1. `lib/search.ts`: typed reference ("Ps 23") → AI-suggested references (Claude Haiku 5.5, verified)
   → hand-picked feeling passages (`lib/bible/topics.ts`) → BM25 keyword search with phrase re-ranking
   (`lib/bible/keyword.ts`).
2. Scripture mode returns those passages (`/api/search`).
3. Preacher mode streams a teaching from Claude Opus 5.5 at low effort on the top passage
   (`/api/teach`, `lib/ai/teach.ts`), in one of four styles. Each style guide describes how that
   kind of preacher builds a message (structure, devices, closings). Set `TEACHING_MODEL=claude-sonnet-5-5`
   for about a quarter of the cost with somewhat less depth.
4. Voice input uses the browser's speech recognition (Chrome, Edge, Safari). Read-aloud uses
   `/api/speak` (`lib/tts.ts`, ElevenLabs or Azure) when configured, paragraph by paragraph so it starts
   fast, and falls back to the browser voice.

The search and teaching code has no web-only dependencies, so a WhatsApp webhook can call
`findPassages()` and `streamTeaching()` directly.

## Data

`npm run build:bible` rebuilds `data/bible.json` and `lib/bible/books.generated.ts` from
`data/raw/` (KJV and BSB from [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases),
Louis Segond 1910 from [Beblia/Holy-Bible-XML-Format](https://github.com/Beblia/Holy-Bible-XML-Format)).
All three are public domain. Copyrighted Bibles (Amplified, Good News) need a licence, e.g. via API.Bible.
