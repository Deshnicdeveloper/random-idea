"use client";
import { Fragment, useState } from "react";
import type { CrisisResources, Lang, Passage, TranslationId } from "@/lib/types";
import { TRANSLATIONS } from "@/lib/types";
import { findReferences } from "@/lib/bible/reference";
import { CheckIcon, CopyIcon, HeartIcon, SpeakerIcon, StopIcon } from "./Icons";

export function passageSpeech(p: Passage) {
  return `${p.reference}. ${p.verses.map((v) => v.text).join(" ")}`;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return { copied, copy };
}

export function IconButton(props: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${
        props.active ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {props.children}
    </button>
  );
}

export interface Speaker {
  speakingId: string | null;
  loadingId: string | null;
  speak: (id: string, text: string, lang?: Lang) => void;
  stop: () => void;
}

export function SpeakButton(props: Speaker & { id: string; text: string; lang: Lang; label?: string }) {
  const on = props.speakingId === props.id;
  const loading = props.loadingId === props.id;
  const fr = props.lang === "fr";
  return (
    <IconButton
      label={on ? (fr ? "Arrêter" : "Stop reading") : fr ? "Écouter" : "Read aloud"}
      active={on}
      onClick={() => (on ? props.stop() : props.speak(props.id, props.text, props.lang))}
    >
      {on ? <StopIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
      <span>{loading ? (fr ? "Préparation de la voix…" : "Preparing voice…") : on ? (fr ? "Arrêter" : "Stop") : props.label ?? (fr ? "Écouter" : "Listen")}</span>
    </IconButton>
  );
}

export function PassageCard(props: {
  passage: Passage;
  variant?: "anchor" | "plain";
  speaker?: Speaker;
}) {
  const { passage: p, variant = "plain" } = props;
  const { copied, copy } = useCopy();
  const borrowed = p.verses.some((v) => v.fromTranslation);
  const multi = p.verses.length > 1;
  return (
    <figure
      className={`rounded-2xl border p-5 ${
        variant === "anchor" ? "border-accent/40 bg-accent-soft/40" : "border-line bg-surface"
      }`}
    >
      <blockquote className="font-serif text-[1.15rem] leading-relaxed text-ink">
        {p.verses.map((v) => (
          <Fragment key={v.verse}>
            {multi && <sup className="mr-1 font-sans text-[0.65rem] font-semibold text-accent">{v.verse}</sup>}
            {v.text}{" "}
          </Fragment>
        ))}
      </blockquote>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold tracking-wide text-accent">
          {p.reference} <span className="font-normal text-muted">· {p.translation}</span>
        </span>
        <span className="flex items-center gap-1">
          {props.speaker && (
            <SpeakButton id={`p-${p.key}-${p.translation}`} text={passageSpeech(p)} lang={TRANSLATIONS[p.translation].lang} {...props.speaker} />
          )}
          <IconButton label="Copy verse" onClick={() => copy(`"${p.verses.map((v) => v.text).join(" ")}" ${p.reference} (${p.translation})`)}>
            {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          </IconButton>
        </span>
      </figcaption>
      {p.reason && <p className="mt-2 text-sm leading-relaxed text-muted">{p.reason}</p>}
      {borrowed && (
        <p className="mt-2 text-xs text-muted">
          Some verses here aren&apos;t in the {p.translation}&apos;s source manuscripts, so they&apos;re shown from the{" "}
          {p.translation === "KJV" ? "BSB" : "KJV"}.
        </p>
      )}
    </figure>
  );
}

/** Teaching text with tappable scripture references that open the exact verse from the database. */
export function TeachingBody(props: { text: string; streaming: boolean; translation: TranslationId }) {
  const [open, setOpen] = useState<{ ref: string; passage?: Passage; failed?: boolean } | null>(null);
  const paragraphs = props.text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);

  const openRef = async (ref: string) => {
    if (open?.ref === ref) return setOpen(null);
    setOpen({ ref });
    try {
      const r = await fetch(`/api/verse?ref=${encodeURIComponent(ref)}&t=${props.translation}`);
      setOpen(r.ok ? { ref, passage: await r.json() } : { ref, failed: true });
    } catch {
      setOpen({ ref, failed: true });
    }
  };

  const withLinks = (para: string) => {
    const found = findReferences(para);
    if (!found.length) return para;
    const out: React.ReactNode[] = [];
    let last = 0;
    found.forEach((f, i) => {
      out.push(para.slice(last, f.index));
      out.push(
        <button
          key={i}
          type="button"
          onClick={() => openRef(f.text)}
          className="font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          {f.text}
        </button>,
      );
      last = f.index + f.length;
    });
    out.push(para.slice(last));
    return out;
  };

  return (
    <div className="space-y-4">
      {paragraphs.map((para, i) => {
        const isLast = i === paragraphs.length - 1;
        const caret = props.streaming && isLast ? "caret" : "";
        const decl = /^DECLARATION:\s*/i.exec(para);
        if (decl) {
          return (
            <div key={i} className={`rounded-xl border-l-4 border-accent bg-surface-2 px-4 py-3 font-serif text-[1.08rem] italic leading-relaxed ${caret}`}>
              {withLinks(para.slice(decl[0].length))}
            </div>
          );
        }
        return (
          <p key={i} className={`text-[1.02rem] leading-[1.75] text-ink ${caret}`}>
            {withLinks(para)}
          </p>
        );
      })}
      {props.streaming && !paragraphs.length && <p className="caret text-muted">Preparing a word for you</p>}
      {open && (
        <div className="pt-1">
          {open.passage ? (
            <PassageCard passage={open.passage} />
          ) : (
            <p className="text-sm text-muted">{open.failed ? `Couldn't find ${open.ref}.` : `Opening ${open.ref}…`}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function CrisisCard(props: { resources: CrisisResources; soft?: boolean; lang?: Lang }) {
  const r = props.resources;
  if (props.soft) {
    const fr = props.lang === "fr";
    return (
      <div className="rounded-2xl border border-care/30 bg-care-soft/50 p-4 text-sm leading-relaxed">
        <p className="flex items-center gap-2 font-semibold text-care">
          <HeartIcon className="h-4 w-4" /> {fr ? "Tu n'as pas à porter cela sans aide" : "You don't have to carry this alone"}
        </p>
        <p className="mt-1 text-ink">
          {fr
            ? "Si cela devient trop lourd, parle à quelqu'un aujourd'hui : un pasteur, un ami, ou une personne formée sur "
            : "If it ever feels like too much, talk to someone today: a pastor, a friend, or a trained listener at "}
          <a className="font-semibold text-care underline underline-offset-4" href="https://findahelpline.com" target="_blank" rel="noreferrer">
            findahelpline.com
          </a>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-2xl border border-care/40 bg-care-soft/60 p-5">
      <p className="flex items-center gap-2 font-serif text-xl text-care">
        <HeartIcon />{" "}
        {r.passage && TRANSLATIONS[r.passage.translation].lang === "fr" ? "Ne garde pas ça pour toi" : "Please don't stay alone with this"}
      </p>
      <p className="leading-relaxed text-ink">{r.message}</p>
      <ul className="space-y-3">
        {r.lines.map((l) => (
          <li key={l.label} className="rounded-xl bg-surface p-3">
            <p className="text-sm font-semibold text-ink">{l.label}</p>
            {l.href ? (
              <a href={l.href} target="_blank" rel="noreferrer" className="text-sm font-semibold text-care underline underline-offset-4">
                {l.detail}
              </a>
            ) : (
              <p className="text-sm text-muted">{l.detail}</p>
            )}
          </li>
        ))}
      </ul>
      {r.passage && <PassageCard passage={r.passage} />}
      <p className="text-sm text-muted">
        {r.passage && TRANSLATIONS[r.passage.translation].lang === "fr"
          ? "Je suis toujours là quand tu voudras en parler davantage."
          : "I'm still here when you're ready to talk more."}
      </p>
    </div>
  );
}
