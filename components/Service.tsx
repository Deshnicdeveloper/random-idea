"use client";
// Service mode: listens to a live sermon and puts every verse the preacher reads or quotes on screen.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Passage, TranslationId } from "@/lib/types";
import { TRANSLATIONS } from "@/lib/types";
import { detect, type Detection, type SpokenRef } from "@/lib/service/spoken";
import { formatReference } from "@/lib/bible/reference";
import { useLiveListening, type Heard } from "@/lib/client/listen";
import { Mark, MicIcon } from "./Icons";
import { Select, TabBar } from "./Shell";

type Source = "reference" | "quote" | "manual";
interface Shown {
  passage: Passage;
  source: Source;
  at: number;
}

const LANGS = [
  { id: "en-US", label: "English", translation: "KJV" as TranslationId },
  { id: "en-GB", label: "English (UK)", translation: "KJV" as TranslationId },
  { id: "en-NG", label: "English (Nigeria)", translation: "KJV" as TranslationId },
  { id: "fr-FR", label: "Français", translation: "LSG" as TranslationId },
];

const refKey = (r: SpokenRef) => `${r.book}:${r.chapter}:${r.start}-${r.end}`;
const toRef = (p: Passage): SpokenRef => ({ book: p.book, chapter: p.chapter, start: p.start, end: p.end });

async function fetchPassage(ref: SpokenRef, t: TranslationId): Promise<Passage | null> {
  const q = formatReference({ book: ref.book, chapter: ref.chapter, start: ref.start, end: ref.end });
  const r = await fetch(`/api/verse?ref=${encodeURIComponent(q)}&t=${t}`);
  return r.ok ? r.json() : null;
}

export default function Service() {
  const [lang, setLang] = useState(LANGS[0]);
  const [translation, setTranslation] = useState<TranslationId>("KJV");
  const [current, setCurrent] = useState<Shown | null>(null);
  const [history, setHistory] = useState<Shown[]>([]);
  const [queue, setQueue] = useState<Shown[]>([]);
  const [hold, setHold] = useState(false);
  const [quotes, setQuotes] = useState(true);
  const [finalWords, setFinalWords] = useState("");
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [simulate, setSimulate] = useState(true); // typed text arrives word by word, like live speech
  const [showTranscript, setShowTranscript] = useState(true);
  // What the last finished phrase was understood as, so a miss is visible (and easy to report).
  const [lastCheck, setLastCheck] = useState<{ heard: string; found: string | null } | null>(null);

  const ctxRef = useRef<SpokenRef | null>(null);
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const tRef = useRef(translation);
  tRef.current = translation;
  const seen = useRef(new Set<string>()); // detections already acted on (per speech result)
  const recentQuote = useRef(new Map<string, number>());
  const finalRef = useRef(""); // recent speech, for the transcript strip
  const quoteRef = useRef(""); // speech since the last verse was shown: the only text searched for quotes
  const wakeLock = useRef<{ release(): Promise<void> } | null>(null);
  const shownCount = useRef(0); // bumps on every display, so late quote answers can't overwrite newer verses
  const currentKey = useRef<string | null>(null);

  // The service screen is always dark (projectors, dim halls).
  useEffect(() => {
    const el = document.documentElement;
    const before = el.dataset.theme;
    el.dataset.theme = "dark";
    return () => {
      if (before) el.dataset.theme = before;
      else delete el.dataset.theme;
    };
  }, []);

  const display = useCallback((passage: Passage, source: Source) => {
    const item: Shown = { passage, source, at: Date.now() };
    if (holdRef.current && source !== "manual") {
      setQueue((q) => (q.some((x) => x.passage.key === passage.key) ? q : [...q, item].slice(-8)));
      return;
    }
    ctxRef.current = toRef(passage);
    shownCount.current++;
    currentKey.current = passage.key;
    quoteRef.current = "";
    setCurrent(item);
    setHistory((h) => [item, ...h.filter((x) => x.passage.key !== passage.key)].slice(0, 20));
  }, []);

  const act = useCallback(
    async (d: Detection) => {
      // Update the context immediately so "next verse" said right after works even before the fetch returns.
      ctxRef.current = d.ref;
      shownCount.current++; // a spoken reference outranks any quote answer still in flight
      quoteRef.current = ""; // and older speech must not be searched for quotes again
      const p = await fetchPassage(d.ref, tRef.current);
      if (p) display(p, "reference");
    },
    [display],
  );

  // ---------- quote recognition, continuously while the preacher talks ----------
  const interimRef = useRef(""); // the phrase being spoken right now (not yet final)
  const interimSkip = useRef(0); // words of that phrase already used for a verse on screen
  const phraseUsed = useRef(false); // a verse came from the current phrase: its remaining words are that verse
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  // Up to two checks run at once, so a check started on newer words doesn't wait behind an older one.
  const check = useRef({ inFlight: 0, again: false, againAi: false, lastAt: 0, lastWords: 0, lastAiWords: 0 });
  const totalWords = useRef(0); // words heard so far (final + current phrase), for pacing checks
  const finalTotal = useRef(0); // words in all finished phrases

  const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const quoteText = () => {
    const live = phraseUsed.current ? "" : interimRef.current.trim().split(/\s+/).slice(interimSkip.current).join(" ");
    return `${quoteRef.current} ${live}`.trim().split(/\s+/).slice(-40).join(" ");
  };

  /** Asks the server whether a verse is being quoted or paraphrased. At most two requests at a time. */
  const runCheck = useCallback(
    (ai: boolean) => {
      const c = check.current;
      if (c.inFlight >= 2) {
        c.again = true;
        c.againAi ||= ai;
        return;
      }
      const speech = quoteText();
      if (countWords(speech) < 5) return;
      c.inFlight++;
      c.lastAt = Date.now();
      c.lastWords = totalWords.current;
      if (ai) c.lastAiWords = totalWords.current;
      const asked = shownCount.current;
      fetch("/api/service/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speech, translation: tRef.current, ai, exclude: currentKey.current }),
      })
        .then((r) => r.json())
        .then((d: { match: { passage: Passage; via: "words" | "ai" } | null }) => {
          const p = d.match?.passage;
          if (!p || asked !== shownCount.current) return; // something newer is already on screen
          if (p.key === currentKey.current) return; // the preacher is reading the verse that's already up
          const last = recentQuote.current.get(p.key) ?? 0;
          if (Date.now() - last < 90_000) return; // already shown recently
          recentQuote.current.set(p.key, Date.now());
          interimSkip.current = countWords(interimRef.current); // don't search these words again
          phraseUsed.current = true;
          display(p, "quote");
        })
        .catch(() => {})
        .finally(() => {
          c.inFlight--;
          if (c.again) {
            const again = c.againAi;
            c.again = false;
            c.againAi = false;
            runCheck(again); // speech kept coming during the check: look again with the latest words
          }
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display],
  );

  // "the Bible says", "it is written", "Jesus said"... usually come right before a verse.
  const CUE =
    /\b(the bible|scripture|scriptures|the word (of god|says)|it is written|written in|jesus (said|says)|paul (said|says|wrote)|god (said|says)|the lord (said|says)|the psalmist|the prophet|la bible|il est (é|e)crit|j(é|e)sus (a dit|dit)|dieu (a dit|dit)|la parole)\b/i;

  /** Decides, on each bit of speech, whether it's time to look for a quote. */
  const maybeCheck = (isFinal: boolean) => {
    if (!quotesRef.current) return;
    const c = check.current;
    const fresh = totalWords.current - c.lastWords;
    const freshForAi = totalWords.current - c.lastAiWords;
    const recent = quoteText().split(/\s+/).slice(-14).join(" ");
    const cue = CUE.exec(recent);
    const afterCue = cue ? countWords(recent.slice(cue.index + cue[0].length)) : 0;
    if (isFinal) {
      if (fresh >= 3) runCheck(true);
    } else if (cue && afterCue >= 4 && freshForAi >= 3) {
      runCheck(true); // a verse is being cited right now
    } else if (fresh >= 6 && Date.now() - c.lastAt > 900) {
      runCheck(freshForAi >= 12); // exact words often; the AI only after a good stretch of speech
    }
  };

  /** Handles a piece of live (or typed) speech. */
  const onHeard = useCallback(
    (h: Heard) => {
      const scope = `${h.session}:${h.index}`;
      // Explicit references act on interim text too (faster); relative commands only once final.
      const found = detect(h.text, ctxRef.current);
      if (h.isFinal) {
        setLastCheck({
          heard: h.text.trim().slice(-90),
          found: found.length ? found.map((d) => formatReference({ book: d.ref.book, chapter: d.ref.chapter, start: d.ref.start, end: d.ref.end })).join(", ") : null,
        });
      }
      for (const d of found) {
        if (d.kind === "relative" && !h.isFinal) continue;
        const id = `${scope}|${d.sig}`;
        if (seen.current.has(id)) continue;
        seen.current.add(id);
        void act(d);
      }
      if (h.isFinal) {
        finalRef.current = `${finalRef.current} ${h.text}`.trim().split(/\s+/).slice(-80).join(" ");
        // The rest of a phrase that already produced a verse is just that verse being read: skip it.
        const live = phraseUsed.current ? "" : h.text.trim().split(/\s+/).slice(interimSkip.current).join(" ");
        quoteRef.current = `${quoteRef.current} ${live}`.trim().split(/\s+/).slice(-60).join(" ");
        interimRef.current = "";
        interimSkip.current = 0;
        phraseUsed.current = false;
        finalTotal.current += countWords(h.text);
        setFinalWords(finalRef.current);
        setInterim("");
      } else {
        interimRef.current = h.text;
        setInterim(h.text);
      }
      totalWords.current = finalTotal.current + countWords(interimRef.current);
      if (!found.length) maybeCheck(h.isFinal);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [act, runCheck],
  );

  const mic = useLiveListening(onHeard);
  const typedCount = useRef(0);

  const toggleListening = async () => {
    if (mic.listening) {
      mic.stop();
      await wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
      return;
    }
    mic.start(lang.id);
    try {
      const nav = navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
      wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null; // keep the screen on during the service
    } catch {}
  };

  const step = useCallback(
    async (delta: number) => {
      const c = ctxRef.current;
      if (!c) return;
      const v = delta > 0 ? c.end + 1 : c.start - 1;
      if (v < 1) return;
      const p = await fetchPassage({ book: c.book, chapter: c.chapter, start: v, end: v }, tRef.current);
      if (p) display(p, "manual");
    },
    [display],
  );

  // Re-read what's on screen when the translation changes.
  useEffect(() => {
    const c = current;
    if (!c || c.passage.translation === translation) return;
    fetchPassage(toRef(c.passage), translation).then((p) => p && setCurrent({ ...c, passage: p }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key.toLowerCase() === "h") setHold((v) => !v);
      if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const p = current?.passage;
  const length = p ? p.verses.reduce((a, v) => a + v.text.length, 0) : 0;
  const size =
    length < 110
      ? "text-[32px] leading-[1.35] sm:text-[56px] sm:leading-[1.3]"
      : length < 220
        ? "text-[28px] leading-[1.4] sm:text-[46px] sm:leading-[1.35]"
        : length < 420
          ? "text-[22px] leading-[1.5] sm:text-[36px] sm:leading-[1.45]"
          : "text-[19px] leading-[1.55] sm:text-[28px] sm:leading-[1.5]";
  const ctrl = "h-9 rounded-[10px] border px-3 text-[14px] font-medium transition-colors duration-150";

  return (
    // theme-night applies the Night palette from the first frame (no flash of Day colours).
    <div className="theme-night flex min-h-dvh flex-col bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Selah home">
            <Mark className="h-7 w-7 text-ink" />
            <span className="text-[19px] font-semibold tracking-[-0.01em]">Selah</span>
            <span className="text-[14px] font-medium text-muted">Service</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              label="Language the preacher speaks"
              value={lang.id}
              onChange={(id) => {
                const l = LANGS.find((x) => x.id === id)!;
                setLang(l);
                setTranslation(l.translation);
                if (mic.listening) mic.start(l.id);
              }}
              options={LANGS.map((l) => ({ value: l.id, label: l.label }))}
            />
            <Select
              label="Bible translation"
              value={translation}
              onChange={setTranslation}
              options={Object.values(TRANSLATIONS).map((t) => ({ value: t.id, label: t.id }))}
            />
            <button
              onClick={() => setHold((v) => !v)}
              title="Hold: verses wait until a volunteer taps them (H)"
              className={`${ctrl} ${hold ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink"}`}
            >
              {hold ? "Holding" : "Auto"}
            </button>
            <button
              onClick={() => setQuotes((v) => !v)}
              title="Also recognise verses quoted or paraphrased without a reference"
              className={`${ctrl} ${quotes ? "border-line text-ink" : "border-line text-muted line-through"}`}
            >
              Quotes
            </button>
            <button
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
              className={`${ctrl} hidden border-line text-muted hover:text-ink sm:inline-block`}
              title="Fullscreen (F)"
            >
              Fullscreen
            </button>
            <button
              onClick={toggleListening}
              disabled={!mic.supported}
              className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-4 text-[14px] font-medium transition duration-150 active:scale-[0.98] disabled:opacity-40 ${
                mic.listening ? "listening bg-accent text-accent-ink" : "bg-accent text-accent-ink hover:-translate-y-px"
              }`}
              title={mic.supported ? "" : "Live listening works in Chrome, Edge and Safari"}
            >
              <MicIcon className="h-4 w-4" /> {mic.listening ? "Listening" : "Start listening"}
            </button>
          </div>
        </div>
      </header>
      {mic.error && <p className="bg-care-soft px-4 py-2 text-center text-[14px] text-care">{mic.error}</p>}

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center sm:px-10">
        {p ? (
          <div key={p.key + p.translation} className="fade-up max-w-5xl">
            <p className="mb-6 text-[15px] font-semibold uppercase tracking-[0.14em] text-emphasis sm:text-[20px]">
              {p.reference} <span className="font-normal text-muted">· {p.translation}</span>
            </p>
            <blockquote className={`font-medium tracking-[-0.01em] ${size}`}>
              {p.verses.map((v) => (
                <span key={v.verse}>
                  {p.verses.length > 1 && <sup className="mr-1 align-super text-[0.4em] font-semibold text-emphasis">{v.verse}</sup>}
                  {v.text}{" "}
                </span>
              ))}
            </blockquote>
            {current?.source === "quote" && <p className="mt-8 text-[13px] text-muted">Recognised from what was said</p>}
          </div>
        ) : (
          <div className="fade-up max-w-xl">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-emphasis">Live service</p>
            <p className="mt-3 text-[28px] font-semibold leading-[1.3] tracking-[-0.02em] sm:text-[36px]">Ready when the preacher is</p>
            <p className="mt-4 text-[16px] leading-[1.7] text-muted">
              Press <span className="font-semibold text-ink">Start listening</span> and place this device near the preacher or a
              speaker. Every verse that&apos;s read, quoted or paraphrased appears here. &ldquo;Next verse&rdquo; moves on.
            </p>
          </div>
        )}
      </main>

      <footer className="mb-16 space-y-3 border-t border-line px-4 py-4 sm:px-6 md:mb-0">
        {queue.length > 0 && (
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-emphasis">Up next</span>
            {queue.map((q) => (
              <button
                key={q.passage.key}
                onClick={() => {
                  setQueue((x) => x.filter((y) => y !== q));
                  display(q.passage, "manual");
                }}
                className="rounded-[10px] bg-accent px-3 py-1.5 text-[14px] font-medium text-accent-ink transition active:scale-[0.98]"
              >
                Show {q.passage.reference}
              </button>
            ))}
          </div>
        )}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <button onClick={() => step(-1)} className={`${ctrl} border-line text-muted hover:text-ink`} title="Previous verse (←)">
            ← Prev
          </button>
          <button onClick={() => step(1)} className={`${ctrl} border-line text-muted hover:text-ink`} title="Next verse (→)">
            Next →
          </button>
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {history.slice(current ? 1 : 0).map((hItem) => (
              <button
                key={hItem.passage.key}
                onClick={() => display(hItem.passage, "manual")}
                className="shrink-0 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                {hItem.passage.reference}
              </button>
            ))}
          </div>
          <button onClick={() => setShowTranscript((v) => !v)} className="text-[12px] font-medium text-muted hover:text-ink">
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </button>
        </div>
        {showTranscript && (
          <div className="mx-auto max-w-6xl space-y-1">
            <p className="truncate text-[14px] text-muted" aria-live="polite">
              {finalWords.split(" ").slice(-24).join(" ")} <span className="text-ink/45">{interim}</span>
            </p>
            {lastCheck && (
              <p className="truncate text-[12px] text-muted">
                Heard &ldquo;{lastCheck.heard}&rdquo; →{" "}
                {lastCheck.found ? <span className="font-medium text-emphasis">{lastCheck.found}</span> : <span>no reference</span>}
                {quotes && !lastCheck.found && <span> (checking for a quote…)</span>}
              </p>
            )}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const text = typed.trim();
            if (!text) return;
            setTyped("");
            const index = typedCount.current++;
            if (simulate) {
              // Like live recognition: the phrase grows word by word (~2.5 words/s), then becomes final.
              const w = text.split(/\s+/);
              for (let n = 1; n < w.length; n++) {
                onHeard({ index, session: -1, text: w.slice(0, n).join(" "), isFinal: false });
                await new Promise((r) => setTimeout(r, 400));
              }
            }
            onHeard({ index, session: -1, text, isFinal: true });
          }}
          className="mx-auto flex max-w-6xl items-center gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type what the preacher says to test, or drive it by hand (e.g. “Romans 8:28”, “next verse”)"
            aria-label="Type what the preacher says"
            className="h-10 min-w-0 flex-1 rounded-[12px] border border-line bg-surface px-4 text-[14px] outline-none transition-colors placeholder:text-muted focus:border-emphasis/50"
          />
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-muted" title="Feed the text word by word, like live speech">
            <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} className="accent-[var(--accent)]" /> Live
          </label>
          <button className={`${ctrl} h-10 border-line text-muted hover:text-ink`}>Send</button>
        </form>
      </footer>

      <TabBar active="service" />
    </div>
  );
}
