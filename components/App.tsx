"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CrisisLevel, CrisisResources, Lang, Mode, Passage, SearchResponse, StyleId, TeachEvent, TranslationId } from "@/lib/types";
import { STYLES, TRANSLATIONS } from "@/lib/types";
import { useSpeechInput } from "@/lib/client/speech";
import { useVoice, type Voice } from "@/lib/client/voice";
import { useMusicBed } from "@/lib/client/music";
import { CrisisCard, IconButton, PassageCard, Skeleton, SpeakButton, TeachingBody, passageSpeech, type Speaker } from "./Cards";
import { Select, TabBar, TopBar } from "./Shell";
import { Player } from "./Player";
import {
  ArrowIcon, CheckIcon, ChevronIcon, CopyIcon, DropIcon, HandsIcon, HourglassIcon, MicIcon, MoonIcon, MusicIcon,
  SearchIcon, SendIcon, ServiceIcon, SunriseIcon, TalkIcon, TranscriptIcon, WaveIcon,
} from "./Icons";

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
  const [greeting, setGreeting] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 5 ? "Still awake?" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

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
  const preacher = mode === "preacher";

  const askFromTile = (text: string) => submit(text);
  const rememberVerse = () => {
    setMode("scripture");
    requestAnimationFrame(() => textRef.current?.focus());
  };

  const segmented = (
    <div role="tablist" aria-label="What you want" className="inline-flex rounded-[12px] bg-surface-2 p-1">
      {(["preacher", "scripture"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => setMode(m)}
          className={`h-8 rounded-[9px] px-3.5 text-[14px] font-medium transition-colors duration-150 ${
            mode === m ? "bg-ink text-bg" : "text-muted hover:text-ink"
          }`}
        >
          {m === "preacher" ? "Teaching" : "Verses"}
        </button>
      ))}
    </div>
  );

  const styleMenu = preacher && (
    <Select
      className="min-w-0 flex-1 sm:flex-none"
      label="Teaching style"
      value={style}
      onChange={setStyle}
      options={Object.values(STYLES).map((s) => ({ value: s.id, label: s.label }))}
    />
  );

  const micButton = (
    <button
      type="button"
      onClick={toggleMic}
      disabled={!mic.supported}
      aria-label={mic.listening ? "Stop listening" : "Speak instead of typing"}
      title={mic.supported ? (mic.listening ? "Stop listening" : "Speak instead of typing") : "Voice input works in Chrome, Edge and Safari"}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors duration-150 disabled:opacity-40 ${
        mic.listening ? "listening bg-accent text-accent-ink" : "bg-surface-2 text-ink hover:bg-accent-soft"
      }`}
    >
      <MicIcon className="h-[18px] w-[18px]" />
    </button>
  );

  const placeholder = mic.listening
    ? "Listening… speak freely"
    : preacher
      ? "Tell me what you're going through…"
      : "Describe a feeling, or the part of a verse you remember…";

  const field = (rows: number, cls: string) => (
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
      rows={rows}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`w-full resize-none bg-transparent text-ink outline-none placeholder:text-muted ${cls}`}
    />
  );

  const sendDisabled = busy || input.trim().length < 2;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        active="word"
        right={
          <Select
            label="Bible translation"
            value={translation}
            onChange={changeTranslation}
            options={Object.values(TRANSLATIONS).map((t) => ({ value: t.id, label: t.lang === "fr" ? `${t.id} · Français` : t.id }))}
          />
        }
      />

      {empty ? (
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-10 sm:px-6 sm:pt-16 md:pb-16">
          {/* Anchor */}
          <section className="fade-up">
            <p className="text-[14px] font-medium text-muted">{greeting || " "}</p>
            <h1 className="mt-2 text-[30px] font-semibold leading-[38px] tracking-[-0.02em] sm:text-[44px] sm:leading-[52px]">
              What&apos;s on your heart?
            </h1>
            <p className="mt-3 max-w-xl text-[16px] leading-[1.7] text-muted">
              Say how you feel, or the part of a verse you remember. Selah finds the exact scripture
              {preacher ? " and brings you a two-minute word, read aloud." : "."}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="mt-8 rounded-[24px] border border-line bg-surface p-3 shadow-float sm:p-4"
            >
              {field(3, "min-h-[92px] px-2 pt-1 text-[17px] leading-[1.6]")}
              <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  {segmented}
                  {styleMenu}
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  {micButton}
                  <button
                    type="submit"
                    disabled={sendDisabled}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-accent px-4 text-[15px] font-medium text-accent-ink transition duration-150 hover:-translate-y-px hover:shadow-card active:scale-[0.98] disabled:translate-y-0 disabled:bg-surface-2 disabled:text-muted disabled:shadow-none sm:h-10 sm:flex-none"
                  >
                    {preacher ? "Receive a word" : "Find verses"}
                    <ArrowIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </form>
            {mic.error && <p className="mt-3 text-[14px] text-care">{mic.error}</p>}
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
              <span>Exact scripture, never invented</span>
              <span aria-hidden>·</span>
              <span>KJV, BSB, Louis Segond</span>
              <span aria-hidden>·</span>
              <span>English &amp; Français</span>
            </p>
          </section>

          {/* Start where you are */}
          <section className="mt-14">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-emphasis">Start where you are</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TOPICS.map(({ title, line, ask, Icon }) => (
                <button
                  key={title}
                  onClick={() => askFromTile(ask)}
                  className="group flex flex-col items-start gap-3 rounded-[16px] border border-line bg-surface p-4 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-emphasis/40"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-accent-soft text-emphasis">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[13px] leading-[1.5] text-muted">{line}</span>
                  </span>
                </button>
              ))}
              <button
                onClick={rememberVerse}
                className="col-span-2 flex items-center gap-4 rounded-[16px] border border-dashed border-line p-4 text-left transition-colors duration-200 hover:border-emphasis/50 sm:col-span-3"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-emphasis">
                  <SearchIcon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold">Remember part of a verse?</span>
                  <span className="block text-[13px] text-muted">Type the words you recall. &ldquo;Something about wings like eagles&rdquo; is enough.</span>
                </span>
              </button>
            </div>
          </section>

          {/* More ways */}
          <section className="mt-14">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-emphasis">More ways to use Selah</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {FEATURES.map(({ href, title, line, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-start gap-4 rounded-[20px] border border-line bg-surface p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-emphasis/40"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-ink text-bg">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[16px] font-semibold">{title}</span>
                    <span className="mt-1 block text-[14px] leading-[1.6] text-muted">{line}</span>
                  </span>
                  <ArrowIcon className="mt-1 h-5 w-5 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              ))}
            </div>
          </section>

          <p className="mt-14 border-t border-line pt-6 text-[13px] leading-[1.7] text-muted">
            Scripture is quoted exactly from public-domain Bibles. Teachings are written by AI: weigh them against the Word,
            and keep walking with your church family.
          </p>
        </main>
      ) : (
        <>
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-64 pt-8 sm:px-6 md:pb-48">
            <div className="space-y-12">
              {entries.map((e) => (
                <EntryView key={e.id} entry={e} speaker={speaker} voice={voice} music={music} />
              ))}
            </div>
            <div ref={bottomRef} />
          </main>

          {/* Docked composer */}
          <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-bg/90 backdrop-blur-md md:bottom-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="mx-auto max-w-3xl px-4 pb-3 pt-3 sm:px-6"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {segmented}
                {styleMenu}
              </div>
              <div className="flex items-end gap-2 rounded-[20px] border border-line bg-surface p-2 shadow-float">
                {micButton}
                {field(1, "max-h-40 min-h-10 px-1 py-2 text-[16px] leading-6")}
                <button
                  type="submit"
                  disabled={sendDisabled}
                  aria-label={preacher ? "Receive a word" : "Find verses"}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition duration-150 active:scale-[0.96] disabled:bg-surface-2 disabled:text-muted"
                >
                  <SendIcon className="h-[18px] w-[18px]" />
                </button>
              </div>
              {mic.error && <p className="mt-2 text-[13px] text-care">{mic.error}</p>}
            </form>
          </div>
        </>
      )}

      <TabBar active="word" />
    </div>
  );
}

const TOPICS = [
  { title: "Anxious", line: "My mind won't slow down", ask: "I'm anxious and my mind won't slow down. I can't sleep.", Icon: WaveIcon },
  { title: "Waiting", line: "Nothing is moving yet", ask: "I've been waiting so long and nothing is moving in my life.", Icon: HourglassIcon },
  { title: "Weary", line: "I have nothing left", ask: "I'm so tired. I work hard and I have nothing left.", Icon: MoonIcon },
  { title: "Grieving", line: "I lost someone I love", ask: "I lost someone I love and I don't know how to carry this.", Icon: DropIcon },
  { title: "Starting over", line: "I failed again", ask: "I failed again and I don't know how to start over.", Icon: SunriseIcon },
  { title: "Thankful", line: "God came through", ask: "God came through for me and I want to thank Him.", Icon: HandsIcon },
];

const FEATURES = [
  { href: "/talk", title: "Talk with a pastor", line: "A spoken conversation. Interrupt any time, like you would in person.", Icon: TalkIcon },
  { href: "/service", title: "Service display", line: "Listens to a sermon and puts every verse on screen as it's read.", Icon: ServiceIcon },
];

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
  const eyebrow = "text-[12px] font-medium uppercase tracking-[0.08em] text-emphasis";

  return (
    <article id={e.id} className="scroll-mt-24 space-y-5">
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-[16px] bg-surface-2 px-4 py-3 text-[15px] leading-[1.6]">{e.message}</p>
      </div>

      {e.status === "loading" && (
        <Skeleton label={e.mode === "preacher" ? (fr ? "Recherche des Écritures" : "Finding scripture") : "Searching the Bible"} />
      )}

      {urgent && <CrisisCard resources={e.resources!} />}

      {!urgent && e.mode === "scripture" && e.passages.length > 0 && (
        <section className="space-y-3">
          <p className={eyebrow}>{fr ? "Pour toi" : "Scriptures for you"}</p>
          {e.passages.map((p) => (
            <PassageCard key={p.key} passage={p} speaker={speaker} />
          ))}
        </section>
      )}

      {!urgent && e.mode === "preacher" && e.anchor && (
        <section className="fade-up space-y-6 rounded-[20px] border border-line bg-surface p-5 shadow-card sm:p-8">
          <header>
            <p className={eyebrow}>{STYLES[e.style].label}</p>
            {e.title ? (
              <h2 className="mt-2 text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] sm:text-[26px]">{e.title}</h2>
            ) : (
              <div className="skeleton mt-3 h-7 w-2/3" />
            )}
          </header>
          <PassageCard passage={e.anchor} variant="anchor" />
          {audioFirst && e.status === "streaming" && (
            <Skeleton lines={2} label={fr ? "Le prédicateur prépare ta parole" : "Writing your word"} />
          )}
          {audioFirst && e.status === "done" && e.teaching && (
            <Player id={teachingId} text={teachingSpeech()} lang={e.lang} voice={voice} onPlayStart={() => music.start()} />
          )}
          {(audioFirst ? showTranscript : e.teaching || e.status === "streaming") && (
            <TeachingBody text={e.teaching} streaming={!audioFirst && e.status === "streaming"} translation={e.translation} />
          )}
          {e.status === "done" && e.teaching && (
            <div className="-mx-1 flex flex-wrap items-center gap-1 border-t border-line pt-4">
              {audioFirst ? (
                <IconButton label={showTranscript ? (fr ? "Masquer le texte" : "Hide transcript") : fr ? "Voir le texte" : "Show transcript"} active={showTranscript} onClick={() => setShowTranscript((v) => !v)}>
                  <TranscriptIcon className="h-4 w-4" />
                  <span>{showTranscript ? (fr ? "Masquer le texte" : "Hide transcript") : fr ? "Voir le texte" : "Transcript"}</span>
                </IconButton>
              ) : (
                <SpeakButton id={teachingId} text={teachingSpeech()} lang={e.lang} {...speaker} speak={preach} label={fr ? "Écouter" : "Listen"} />
              )}
              <IconButton
                label={music.enabled ? (fr ? "Couper la musique de fond" : "Turn background keys off") : fr ? "Activer la musique de fond" : "Turn background keys on"}
                active={music.enabled}
                onClick={() => {
                  const on = !music.enabled;
                  music.setEnabled(on);
                  if (!on) music.stop();
                }}
              >
                <MusicIcon className="h-4 w-4" />
                <span>{fr ? "Musique" : "Keys"}</span>
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
                <span>{copied ? (fr ? "Copié" : "Copied") : fr ? "Copier" : "Copy"}</span>
              </IconButton>
              {onAir && music.nowPlaying && <span className="ml-auto truncate text-[12px] text-muted">♪ {music.nowPlaying}</span>}
            </div>
          )}
          {e.passages.length > 0 && (e.status === "done" || e.status === "error") && (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-medium text-muted transition-colors hover:text-ink">
                <ChevronIcon className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                {fr ? "Autres passages" : "More scriptures for this"} ({e.passages.length})
              </summary>
              <div className="mt-4 space-y-3">
                {e.passages.map((p) => (
                  <PassageCard key={p.key} passage={p} speaker={speaker} />
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {!urgent && e.crisis === "concern" && e.resources && e.status !== "loading" && <CrisisCard resources={e.resources} soft lang={e.lang} />}
      {e.notice && <p className="text-[13px] text-muted">{e.notice}</p>}
      {e.error && <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-[14px] text-ink">{e.error}</p>}
    </article>
  );
}
