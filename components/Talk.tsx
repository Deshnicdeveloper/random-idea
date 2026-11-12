"use client";
// Conversation mode: talk with a pastor, hands-free, and interrupt naturally.
import { useEffect, useRef, useState } from "react";
import type { TranslationId } from "@/lib/types";
import { TRANSLATIONS } from "@/lib/types";
import { useConversation, type Phase } from "@/lib/client/converse";
import { CrisisCard, PassageCard, Skeleton } from "./Cards";
import { MicIcon, SendIcon } from "./Icons";
import { Select, TabBar, TopBar } from "./Shell";

const LANGS = [
  { id: "en-US", label: "English" },
  { id: "en-NG", label: "English (Nigeria)" },
  { id: "fr-FR", label: "Français" },
];

const HELP: Record<Phase, string> = {
  idle: "Tap to talk",
  listening: "Listening. Tap when you're done",
  thinking: "Thinking…",
  speaking: "Speaking. Talk or tap to interrupt",
};

export default function Talk() {
  const [natural, setNatural] = useState(false);
  const [translation, setTranslation] = useState<TranslationId>("KJV");
  const [lang, setLang] = useState(LANGS[0].id);
  const [typed, setTyped] = useState("");
  const convo = useConversation({ translation, natural });
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/audio")
      .then((r) => r.json())
      .then((d: { provider: string | null }) => setNatural(Boolean(d.provider)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [convo.messages, convo.live]);

  const orb = () => {
    if (convo.phase === "speaking" || convo.phase === "thinking") return convo.interrupt();
    if (convo.phase === "listening" && convo.sendNow()) return; // tap = "I'm done"
    convo.toggleHandsFree(lang);
  };

  const orbStyle: Record<Phase, string> = {
    idle: "bg-ink text-bg hover:-translate-y-0.5",
    listening: "listening bg-accent text-accent-ink",
    thinking: "bg-surface-2 text-emphasis",
    speaking: "bg-accent text-accent-ink",
  };
  const status = convo.micSupported
    ? convo.handsFree && convo.phase === "idle"
      ? "Paused"
      : HELP[convo.phase]
    : "Voice works in Chrome, Edge and Safari. You can type below.";

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        active="talk"
        right={
          <>
            <Select label="Language you speak" value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} className="hidden sm:inline-flex" />
            <Select
              label="Bible translation"
              value={translation}
              onChange={setTranslation}
              options={Object.values(TRANSLATIONS).map((t) => ({ value: t.id, label: t.id }))}
            />
          </>
        }
      />

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-8 sm:px-6">
        {convo.messages.length === 0 && (
          <div className="fade-up pt-4 sm:pt-10">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-emphasis">Conversation</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.25] tracking-[-0.02em] sm:text-[36px]">Talk with a pastor</h1>
            <p className="mt-3 max-w-lg text-[16px] leading-[1.7] text-muted">
              Say what&apos;s on your heart, the way you would in a pastor&apos;s office. Interrupt any time. Just start
              talking. Headphones work best.
            </p>
            <div className="mt-5 sm:hidden">
              <Select label="Language you speak" value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} />
            </div>
          </div>
        )}
        <div className="space-y-6">
          {convo.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[80%] rounded-[16px] bg-surface-2 px-4 py-3 text-[15px] leading-[1.6]">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="fade-up space-y-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-emphasis">Pastor</p>
                {m.crisis && (
                  <CrisisCard
                    resources={{
                      message: "Please reach out to someone right now. You don't have to carry this alone.",
                      lines: [
                        { label: "In danger right now?", detail: "Cameroon: call 119 (medical emergency, SAMU) or 117 (police). Elsewhere, call your local emergency number." },
                        { label: "Talk to someone trained", detail: "Find a free, confidential helpline in your country", href: "https://findahelpline.com" },
                      ],
                    }}
                  />
                )}
                {m.text ? (
                  <p className="text-[16px] leading-[1.75]">
                    {m.text}
                    {m.interrupted && <span className="ml-1.5 text-[12px] text-muted">(you interrupted)</span>}
                  </p>
                ) : (
                  !m.error && convo.phase === "thinking" && <Skeleton lines={2} />
                )}
                {m.passages.map((p) => (
                  <PassageCard key={p.key} passage={p} />
                ))}
                {m.error && <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-[14px]">{m.error}</p>}
              </div>
            ),
          )}
          {convo.live && (
            <div className="flex justify-end">
              <p className="max-w-[80%] rounded-[16px] border border-dashed border-emphasis/40 px-4 py-3 text-[15px] leading-[1.6] text-muted">{convo.live}</p>
            </div>
          )}
        </div>
        <div ref={bottom} />
      </main>

      <footer className="mb-16 border-t border-line bg-bg/90 px-4 pb-4 pt-6 backdrop-blur-md md:mb-0">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
          <button
            onClick={orb}
            disabled={!convo.micSupported && convo.phase === "idle"}
            aria-label={HELP[convo.phase]}
            style={convo.phase === "listening" ? { transform: `scale(${1 + convo.level * 0.25})` } : undefined}
            className={`relative grid h-[104px] w-[104px] place-items-center rounded-full transition-all duration-150 disabled:opacity-40 ${orbStyle[convo.phase]}`}
          >
            {convo.phase === "thinking" ? (
              <span className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-emphasis" />
            ) : null}
            {convo.phase === "speaking" ? (
              <span className="flex h-9 items-center gap-1.5" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="w-1.5 animate-pulse rounded-full bg-accent-ink" style={{ height: `${45 + ((i * 37) % 55)}%`, animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
            ) : (
              <MicIcon className="h-9 w-9" />
            )}
          </button>
          <p className="text-[14px] font-medium text-muted" aria-live="polite">
            {status}
            {convo.handsFree && convo.phase !== "speaking" && (
              <button onClick={() => convo.toggleHandsFree()} className="ml-3 text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                End
              </button>
            )}
            {convo.messages.length > 0 && !convo.handsFree && (
              <button onClick={convo.reset} className="ml-3 text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                New conversation
              </button>
            )}
          </p>
          {convo.micError && <p className="text-[14px] text-care">{convo.micError}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!typed.trim()) return;
              void convo.send(typed);
              setTyped("");
            }}
            className="flex w-full gap-2"
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Or type here…"
              aria-label="Type a message"
              className="h-11 flex-1 rounded-[14px] border border-line bg-surface px-4 text-[15px] outline-none transition-colors placeholder:text-muted focus:border-emphasis/50"
            />
            <button aria-label="Send" className="grid h-11 w-11 place-items-center rounded-[14px] bg-accent text-accent-ink transition duration-150 active:scale-[0.96]">
              <SendIcon className="h-[18px] w-[18px]" />
            </button>
          </form>
          <p className="text-center text-[12px] text-muted">An AI pastoral companion, not a replacement for your church family or professional help.</p>
        </div>
      </footer>

      <TabBar active="talk" />
    </div>
  );
}
