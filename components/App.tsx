"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CrisisLevel, CrisisResources, Lang, Mode, Passage, SearchResponse, StyleId, TeachEvent, TranslationId } from "@/lib/types";
import { STYLES, TRANSLATIONS } from "@/lib/types";
import { useSpeechInput } from "@/lib/client/speech";
import { useVoice, type Voice } from "@/lib/client/voice";
import { useMusicBed } from "@/lib/client/music";
import { CrisisCard, IconButton, PassageCard, SpeakButton, TeachingBody, passageSpeech, type Speaker } from "./Cards";
import { Player } from "./Player";
import { CheckIcon, CopyIcon, Mark, MicIcon, MusicIcon, SendIcon, TranscriptIcon } from "./Icons";

interface Entry {
  id: string;
  message: string;
  mode: Mode;
  style: StyleId;
  translation: TranslationId;
  lang: Lang;
  status: "loading" | "streaming" | "done" | "error";
  passages: Passage[];
  anchor?: Passage;
  title?: string;
  teaching: string;
  crisis: CrisisLevel;
  resources?: CrisisResources;
  notice?: string;
  error?: string;
}

const SUGGESTIONS = [
  "I'm anxious about my exams and I can't sleep",
  "Something about God fighting my battles while I stay still",
  "I've been waiting so long and nothing is moving in my life",
  "I failed again and I don't know how to start over",
  "Psalm 91",
];

const PREFS_KEY = "selah:prefs";

function loadPrefs(): Partial<{ mode: Mode; style: StyleId; translation: TranslationId }> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>("preacher");
  const [style, setStyle] = useState<StyleId>("deep");
  const [translation, setTranslation] = useState<TranslationId>("KJV");
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const busy = entries.some((e) => e.status === "loading" || e.status === "streaming");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoice();
  const music = useMusicBed();
  // Verse cards use a simple play/stop button on top of the same voice engine.
  const speaker: Speaker = {
    speakingId: voice.state && voice.state.status !== "paused" ? voice.state.id : null,
    loadingId: voice.state?.status === "loading" ? voice.state.id : null,
    speak: (id, text, lang) => voice.play(id, text, lang),
    stop: voice.stop,
  };

  // Soft keys play only while a teaching (not a single verse) is playing or being prepared.
  const preaching = Boolean(voice.state?.id.startsWith("t-") && voice.state.status !== "paused");
  useEffect(() => {
    if (!preaching) music.stop();
  }, [preaching, music.stop]);
  const voiceBase = useRef("");
  const mic = useSpeechInput((t) => setInput((voiceBase.current ? voiceBase.current + " " : "") + t));

  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    const p = loadPrefs();
    if (p.mode && (p.mode === "preacher" || p.mode === "scripture")) setMode(p.mode);
    if (p.style && p.style in STYLES) setStyle(p.style);
    if (p.translation && p.translation in TRANSLATIONS) setTranslation(p.translation);
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return; // don't overwrite saved prefs with defaults before they're loaded
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ mode, style, translation }));
    } catch {}
  }, [prefsReady, mode, style, translation]);

  // Switching Bibles re-reads every passage already on screen in the new translation.
  const changeTranslation = async (t: TranslationId) => {
    setTranslation(t);
    const items: { slot: string; book: number; chapter: number; start: number; end: number; reason?: string }[] = [];
    const add = (slot: string, p?: Passage) =>
      p && items.push({ slot, book: p.book, chapter: p.chapter, start: p.start, end: p.end, reason: p.reason });
    for (const e of entries) {
      add(`${e.id}|anchor`, e.anchor);
      e.passages.forEach((p, i) => add(`${e.id}|p${i}`, p));
      add(`${e.id}|crisis`, e.resources?.passage);
    }
    if (!items.length) return;
    try {
      const r = await fetch("/api/passages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translation: t, items }),
      });
      const { passages } = (await r.json()) as { passages: (Passage | null)[] };
      const next = new Map(items.map((it, i) => [it.slot, passages[i]] as const));
      setEntries((list) =>
        list.map((e) => {
          const pick = (slot: string, old?: Passage) => next.get(slot) ?? old;
          return {
            ...e,
            translation: t,
            anchor: pick(`${e.id}|anchor`, e.anchor),
            passages: e.passages.map((p, i) => pick(`${e.id}|p${i}`, p)!),
            resources: e.resources && { ...e.resources, passage: pick(`${e.id}|crisis`, e.resources.passage) },
          };
        }),
      );
    } catch {
      // keep the old text if the request fails
    }
  };

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  const update = useCallback((id: string, patch: Partial<Entry> | ((e: Entry) => Partial<Entry>)) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...(typeof patch === "function" ? patch(e) : patch) } : e)));
  }, []);

  const submit = async (raw?: string) => {
    const message = (raw ?? input).trim();
    if (message.length < 2 || busy) return;
    if (mic.listening) mic.stop();
    voice.stop();
    setInput("");
    voiceBase.current = "";
    const id = crypto.randomUUID();
    const entry: Entry = { id, message, mode, style, translation, lang: "en", status: "loading", passages: [], teaching: "", crisis: "none" };
    setEntries((list) => [...list, entry]);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      if (mode === "scripture") {
        const r = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, translation }),
          signal: ctrl.signal,
        });
        const data = (await r.json()) as SearchResponse & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Search failed");
        update(id, {
          status: "done",
          translation: data.translation,
          lang: data.lang,
          passages: data.passages,
          crisis: data.crisis,
          resources: data.resources,
          notice: data.notice,
          error: !data.passages.length && data.crisis !== "urgent" ? "I couldn't find a scripture for that. Try saying it another way." : undefined,
        });
        return;
      }

      const r = await fetch("/api/teach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, style, translation }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as TeachEvent;
          if (ev.type === "passages")
            update(id, { status: "streaming", anchor: ev.anchor, passages: ev.supporting, crisis: ev.crisis, resources: ev.resources, translation: ev.translation, lang: ev.lang });
          else if (ev.type === "crisis") update(id, { status: "done", crisis: "urgent", resources: ev.resources });
          else if (ev.type === "title") update(id, { title: ev.title });
          else if (ev.type === "delta") update(id, (e) => ({ teaching: e.teaching + ev.text }));
          else if (ev.type === "error") update(id, { status: "error", error: ev.message });
          else if (ev.type === "done") update(id, (e) => ({ status: e.status === "error" ? "error" : "done" }));
        }
      }
      update(id, (e) => (e.status === "streaming" || e.status === "loading" ? { status: "done" } : {}));
    } catch (err) {
      if (ctrl.signal.aborted) update(id, { status: "done" });
      else update(id, { status: "error", error: err instanceof Error ? err.message : "Something went wrong" });
    }
  };

  const toggleMic = () => {
    if (mic.listening) return mic.stop();
    voiceBase.current = input.trim();
    mic.start();
  };

  const empty = entries.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="glow pointer-events-none fixed inset-x-0 top-0 h-80" />

      <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Mark />
            <span className="font-serif text-xl tracking-tight">Selah</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-line bg-surface p-1 text-sm" role="tablist" aria-label="Mode">
              {(["preacher", "scripture"] as Mode[]).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-3 py-1.5 font-medium transition-colors ${mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
                >
                  {m === "preacher" ? "Preacher" : "Scripture"}
                </button>
              ))}
            </div>
            <select
              aria-label="Bible translation"
              value={translation}
              onChange={(e) => changeTranslation(e.target.value as TranslationId)}
              className="h-9 rounded-full border border-line bg-surface px-3 text-sm text-ink"
            >
              {Object.values(TRANSLATIONS).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.lang === "fr" ? `${t.id} · FR` : t.id}
                </option>
              ))}
            </select>
          </div>
        </div>
        {mode === "preacher" && (
          <div className="no-scrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 pb-3">
            {Object.values(STYLES).map((s) => (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                title={s.blurb}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  style === s.id ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="relative mx-auto w-full max-w-3xl flex-1 px-4 pb-48">
        {empty ? (
          <section className="pt-16 text-center sm:pt-24">
            <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">What&apos;s on your heart?</h1>
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted">
              Tell me how you feel, or the part of a verse you remember. I&apos;ll find the scripture
              {mode === "preacher" ? " and bring you a short word from it." : "."}
            </p>
            <div className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted transition-colors hover:border-accent/50 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="space-y-10 pt-6">
            {entries.map((e) => (
              <EntryView key={e.id} entry={e} speaker={speaker} voice={voice} music={music} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg to-bg/0 pt-6">
        <div className="mx-auto max-w-3xl px-4 pb-4">
          {mic.error && <p className="mb-2 text-center text-sm text-care">{mic.error}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-end gap-2 rounded-3xl border border-line bg-surface p-2 shadow-lg shadow-black/5"
          >
            <button
              type="button"
              onClick={toggleMic}
              disabled={!mic.supported}
              aria-label={mic.listening ? "Stop listening" : "Speak"}
              title={mic.supported ? (mic.listening ? "Stop listening" : "Speak instead of typing") : "Voice input works in Chrome, Edge and Safari"}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40 ${
                mic.listening ? "listening bg-care text-white" : "bg-surface-2 text-ink hover:bg-accent-soft"
              }`}
            >
              <MicIcon />
            </button>
            <textarea
              ref={textRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={mic.listening ? "Listening… speak freely" : mode === "preacher" ? "Tell me what you're going through…" : "Describe a feeling or the verse you half remember…"}
              className="max-h-44 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[1rem] leading-6 text-ink outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={busy || input.trim().length < 2}
              aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition-opacity disabled:opacity-30"
            >
              <SendIcon />
            </button>
          </form>
          <p className="mt-2 text-center text-xs leading-relaxed text-muted">
            Scripture is quoted exactly from public-domain Bibles (KJV, BSB, Louis Segond). Teachings are AI-generated:
            weigh them against the Word, and keep walking with your church family.
          </p>
        </div>
      </footer>
    </div>
  );
}

function EntryView({
  entry: e,
  speaker,
  voice,
  music,
}: {
  entry: Entry;
  speaker: Speaker;
  voice: Voice;
  music: ReturnType<typeof useMusicBed>;
}) {
  const fr = e.lang === "fr";
  const teachingId = `t-${e.id}`;
  // Start the keys in the same tap as the voice: browsers only allow sound after a user gesture.
  const preach = (id: string, text: string, lang?: Lang) => {
    music.start();
    speaker.speak(id, text, lang);
  };
  const onAir = voice.state?.id === teachingId && voice.state.status !== "paused";
  const [copied, setCopied] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  // With a natural voice, the teaching is delivered as audio; the text sits behind "Show transcript".
  const audioFirst = voice.natural;
  const ready = e.status === "done" && Boolean(e.teaching);
  // A free voice (Kokoro) records as soon as the teaching is written, so Play is instant.
  useEffect(() => {
    if (audioFirst && voice.free && ready) voice.preload(teachingId, teachingSpeech(), e.lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioFirst, voice.free, ready]);
  const urgent = e.crisis === "urgent" && e.resources;
  const teachingSpeech = () => {
    const body = e.teaching.replace(/DECLARATION:\s*/i, "");
    return `${e.title ? e.title + ". " : ""}${body}`;
  };

  return (
    <article id={e.id} className="scroll-mt-32 space-y-4">
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-2 px-4 py-3 leading-relaxed">{e.message}</p>
      </div>

      {e.status === "loading" && (
        <p className="caret text-muted">{e.mode === "preacher" ? "Searching the scriptures" : "Searching"}</p>
      )}

      {urgent && <CrisisCard resources={e.resources!} />}

      {!urgent && e.mode === "scripture" && e.passages.length > 0 && (
        <div className="space-y-3">
          {e.passages.map((p) => (
            <PassageCard key={p.key} passage={p} speaker={speaker} />
          ))}
        </div>
      )}

      {!urgent && e.mode === "preacher" && e.anchor && (
        <div className="space-y-5 rounded-3xl border border-line bg-surface p-5 sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{STYLES[e.style].label}</p>
            <h2 className={`mt-1 font-serif text-2xl leading-snug sm:text-3xl ${e.title ? "" : "text-muted"}`}>
              {e.title ?? (e.status === "streaming" ? "…" : "A word for you")}
            </h2>
          </div>
          <PassageCard passage={e.anchor} variant="anchor" />
          {audioFirst && e.status === "streaming" && (
            <p className="caret text-muted">{fr ? "Le prédicateur prépare ta parole" : "The preacher is preparing your word"}</p>
          )}
          {audioFirst && e.status === "done" && e.teaching && (
            <Player id={teachingId} text={teachingSpeech()} lang={e.lang} voice={voice} onPlayStart={() => music.start()} />
          )}
          {(audioFirst ? showTranscript : e.teaching || e.status === "streaming") && (
            <TeachingBody text={e.teaching} streaming={e.status === "streaming"} translation={e.translation} />
          )}
          {e.status === "done" && e.teaching && (
            <div className="flex flex-wrap items-center gap-1 border-t border-line pt-3">
              {audioFirst ? (
                <IconButton label={showTranscript ? (fr ? "Masquer le texte" : "Hide transcript") : fr ? "Voir le texte" : "Show transcript"} active={showTranscript} onClick={() => setShowTranscript((v) => !v)}>
                  <TranscriptIcon className="h-4 w-4" />
                  <span>{showTranscript ? (fr ? "Masquer le texte" : "Hide transcript") : fr ? "Voir le texte" : "Show transcript"}</span>
                </IconButton>
              ) : (
                <SpeakButton
                  id={teachingId}
                  text={teachingSpeech()}
                  lang={e.lang}
                  {...speaker}
                  speak={preach}
                  label={fr ? "Écouter cette parole" : "Listen to this word"}
                />
              )}
              <IconButton
                label={music.enabled ? (fr ? "Couper la musique de fond" : "Turn background keys off") : fr ? "Activer la musique de fond" : "Turn background keys on"}
                active={false}
                onClick={() => {
                  const on = !music.enabled;
                  music.setEnabled(on);
                  if (!on) music.stop();
                }}
              >
                <MusicIcon className={`h-4 w-4 ${music.enabled ? "" : "opacity-40"}`} />
                <span className={music.enabled ? "" : "line-through opacity-60"}>{fr ? "Musique" : "Keys"}</span>
              </IconButton>
              <IconButton
                label="Copy teaching"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${e.title ?? ""}\n\n${passageSpeech(e.anchor!)}\n\n${e.teaching}`.trim());
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {}
                }}
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                <span>{e.lang === "fr" ? "Copier" : "Copy"}</span>
              </IconButton>
            </div>
          )}
          {onAir && music.nowPlaying && <p className="text-xs text-muted">♪ {music.nowPlaying}</p>}
          {e.passages.length > 0 && (e.status === "done" || e.status === "error") && (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-medium text-muted hover:text-ink">
                <span className="group-open:hidden">
                  {e.lang === "fr" ? "Autres passages" : "More scriptures for this"} ({e.passages.length}) ↓
                </span>
                <span className="hidden group-open:inline">{e.lang === "fr" ? "Masquer" : "Hide scriptures"} ↑</span>
              </summary>
              <div className="mt-3 space-y-3">
                {e.passages.map((p) => (
                  <PassageCard key={p.key} passage={p} speaker={speaker} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {!urgent && e.crisis === "concern" && e.resources && e.status !== "loading" && <CrisisCard resources={e.resources} soft lang={e.lang} />}
      {e.notice && <p className="text-sm text-muted">{e.notice}</p>}
      {e.error && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink">{e.error}</p>}
    </article>
  );
}
