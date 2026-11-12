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

/** Quiet secondary action: icon, optional label. */
export function IconButton(props: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-150 active:scale-[0.98] ${
        props.active ? "bg-accent-soft text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
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
      <span>{loading ? (fr ? "Préparation…" : "Preparing…") : on ? (fr ? "Arrêter" : "Stop") : props.label ?? (fr ? "Écouter" : "Listen")}</span>
    </IconButton>
  );
}

/**
 * Scripture, exactly as in the database.
 * "anchor": inside a teaching (no card, gold rule). "plain": a card of its own.
 */
export function PassageCard(props: { passage: Passage; variant?: "anchor" | "plain"; speaker?: Speaker }) {
  const { passage: p, variant = "plain" } = props;
  const { copied, copy } = useCopy();
  const borrowed = p.verses.some((v) => v.fromTranslation);
  const multi = p.verses.length > 1;
  const body = (
    <>
      <blockquote className="border-l-[3px] border-accent pl-4 text-[18px] leading-[1.75] text-ink sm:pl-5 sm:text-[19px]">
        {p.verses.map((v) => (
          <Fragment key={v.verse}>
            {multi && <sup className="mr-1 text-[11px] font-semibold text-emphasis">{v.verse}</sup>}
            {v.text}{" "}
          </Fragment>
        ))}
      </blockquote>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-[19px] sm:pl-[23px]">
        <span className="text-[14px] font-semibold text-emphasis">
          {p.reference} <span className="font-normal text-muted">· {p.translation}</span>
        </span>
        <span className="-mr-2 flex items-center">
          {props.speaker && (
            <SpeakButton id={`p-${p.key}-${p.translation}`} text={passageSpeech(p)} lang={TRANSLATIONS[p.translation].lang} {...props.speaker} />
          )}
          <IconButton label="Copy verse" onClick={() => copy(`"${p.verses.map((v) => v.text).join(" ")}" ${p.reference} (${p.translation})`)}>
            {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          </IconButton>
        </span>
      </figcaption>
      {p.reason && <p className="mt-2 pl-[19px] text-[14px] leading-[1.6] text-muted sm:pl-[23px]">{p.reason}</p>}
      {borrowed && (
        <p className="mt-2 pl-[19px] text-[12px] text-muted sm:pl-[23px]">
          Some verses here aren&apos;t in the {p.translation}&apos;s source manuscripts, so they&apos;re shown from the{" "}
          {p.translation === "KJV" ? "BSB" : "KJV"}.
        </p>
      )}
    </>
  );
  if (variant === "anchor") return <figure className="fade-up">{body}</figure>;
  return <figure className="fade-up rounded-[20px] border border-line bg-surface p-5 shadow-card sm:p-6">{body}</figure>;
}

/** Placeholder lines while something is being prepared. */
export function Skeleton({ lines = 3, label }: { lines?: number; label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {label && (
        <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted/30 border-t-emphasis" />
          {label}
        </p>
      )}
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3.5" style={{ width: `${[96, 88, 64, 80][i % 4]}%` }} />
      ))}
    </div>
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
          className="font-medium text-emphasis underline decoration-emphasis/35 underline-offset-[5px] transition-colors hover:decoration-emphasis"
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
        const decl = /^DECLARATION:\s*/i.exec(para);
        if (decl) {
          return (
            <div key={i} className="rounded-[14px] bg-accent-soft px-5 py-4">
              <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.08em] text-emphasis">Declaration</p>
              <p className="text-[16px] font-medium leading-[1.75] text-ink">{withLinks(para.slice(decl[0].length))}</p>
            </div>
          );
        }
        return (
          <p key={i} className="text-[16px] leading-[1.8] text-ink">
            {withLinks(para)}
          </p>
        );
      })}
      {props.streaming && <Skeleton lines={paragraphs.length ? 1 : 3} />}
      {open && (
        <div className="pt-1">
          {open.passage ? (
            <PassageCard passage={open.passage} />
          ) : (
            <p className="text-[14px] text-muted">{open.failed ? `Couldn't find ${open.ref}.` : `Opening ${open.ref}…`}</p>
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
      <div className="rounded-[16px] border border-care/25 bg-care-soft p-4 text-[14px] leading-[1.6]">
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
  const fr = r.passage && TRANSLATIONS[r.passage.translation].lang === "fr";
  return (
    <div className="fade-up space-y-4 rounded-[20px] border border-care/30 bg-care-soft p-5 sm:p-6">
      <p className="flex items-center gap-2 text-[20px] font-semibold text-care">
        <HeartIcon /> {fr ? "Ne garde pas ça pour toi" : "Please don't stay alone with this"}
      </p>
      <p className="leading-[1.7] text-ink">{r.message}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {r.lines.map((l) => (
          <li key={l.label} className="rounded-[14px] bg-surface p-4">
            <p className="text-[14px] font-semibold text-ink">{l.label}</p>
            {l.href ? (
              <a href={l.href} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-care underline underline-offset-4">
                {l.detail}
              </a>
            ) : (
              <p className="text-[14px] leading-[1.6] text-muted">{l.detail}</p>
            )}
          </li>
        ))}
      </ul>
      {r.passage && <PassageCard passage={r.passage} />}
      <p className="text-[14px] text-muted">{fr ? "Je suis toujours là quand tu voudras en parler davantage." : "I'm still here when you're ready to talk more."}</p>
    </div>
  );
}
