"use client";
import { useMemo, useRef, useState } from "react";
import type { Lang } from "@/lib/types";
import type { Voice } from "@/lib/client/voice";

const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A gentle, stable placeholder shape (seeded from the text) shown before the real audio exists. */
function placeholderBars(text: string, n = 96): number[] {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  const out: number[] = [];
  let v = 0.35;
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    v = 0.7 * v + 0.3 * (0.15 + r * 0.6);
    out.push(v);
  }
  return out;
}

export function Player(props: {
  id: string;
  text: string;
  lang: Lang;
  voice: Voice;
  /** Called inside the tap that starts or resumes playback (used to start the background keys). */
  onPlayStart?: () => void;
}) {
  const { id, text, lang, voice } = props;
  const fr = lang === "fr";
  const s = voice.state?.id === id ? voice.state : null;
  const info = voice.audioInfo[id];
  const duration = s?.duration || info?.duration || 0;
  const position = s?.position ?? 0;
  const placeholder = useMemo(() => placeholderBars(text), [text]);
  // Real bars for the recorded part; the placeholder shape (pulsing) for what is still recording.
  const bars = info?.bars?.length ? info.bars.map((b, i) => (b < 0 ? -placeholder[i] : b)) : placeholder.map((b) => -b);
  const [preview, setPreview] = useState<number | null>(null);
  const dragging = useRef(false);
  const waveRef = useRef<HTMLDivElement>(null);
  const progress = preview ?? (duration ? position / duration : 0);
  const err = voice.error?.id === id ? voice.error.message : null;
  const recording = Boolean(voice.pending[id]) && !info?.complete;
  const recordedFraction = info && duration ? info.recorded / duration : 0;
  const estimate = Math.max(1, Math.round(text.split(/\s+/).length / 150)); // ~150 spoken words a minute

  const start = (from = 0) => {
    props.onPlayStart?.();
    voice.play(id, text, lang, from);
  };

  const main = () => {
    if (s?.status === "playing") voice.pause();
    else if (s?.status === "paused") {
      props.onPlayStart?.();
      voice.resume();
    } else if (s?.status === "loading") {
      // Waiting mid-playback for the next piece behaves like playing; waiting to begin cancels.
      if (s.position > 0.5) voice.pause();
      else voice.stop();
    } else start(0);
  };

  const commitSeek = (f: number) => {
    const g = Math.min(f, Math.max(0, recordedFraction - 0.002)); // only within what's recorded
    if (s && (s.status !== "loading" || s.position > 0.5)) voice.seek(id, g);
    else if (info) start(g * info.duration);
  };

  const fractionAt = (clientX: number) => {
    const r = waveRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const canSeek = Boolean(info && info.recorded > 0);
  const label = s?.status === "playing" ? (fr ? "Pause" : "Pause") : s?.status === "loading" ? (fr ? "Annuler" : "Cancel") : fr ? "Écouter" : "Play";

  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={main}
          aria-label={label}
          title={label}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent text-accent-ink shadow-md transition-transform active:scale-95"
        >
          {s?.status === "loading" ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
          ) : s?.status === "playing" ? (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg className="ml-1 h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div
            ref={waveRef}
            role="slider"
            tabIndex={canSeek ? 0 : -1}
            aria-label={fr ? "Position de lecture" : "Playback position"}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`${fmt(position)} / ${fmt(duration)}`}
            onPointerDown={(e) => {
              if (!canSeek) return;
              dragging.current = true;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              setPreview(fractionAt(e.clientX));
            }}
            onPointerMove={(e) => dragging.current && setPreview(fractionAt(e.clientX))}
            onPointerUp={(e) => {
              if (!dragging.current) return;
              dragging.current = false;
              const f = fractionAt(e.clientX);
              setPreview(null);
              commitSeek(f);
            }}
            onPointerCancel={() => {
              dragging.current = false;
              setPreview(null);
            }}
            onKeyDown={(e) => {
              if (!canSeek || !duration) return;
              const step = 5 / duration;
              if (e.key === "ArrowRight") commitSeek(Math.min(1, progress + step));
              if (e.key === "ArrowLeft") commitSeek(Math.max(0, progress - step));
            }}
            className={`flex h-14 touch-none items-center gap-[2px] ${canSeek ? "cursor-pointer" : ""}`}
          >
            {bars.map((b, i) => {
              const pendingBar = b < 0; // not recorded yet
              const played = !pendingBar && (i + 0.5) / bars.length <= progress;
              return (
                <span
                  key={i}
                  className={`flex-1 rounded-full transition-colors ${
                    played ? "bg-accent" : pendingBar ? "bg-ink/10" : "bg-ink/25"
                  } ${pendingBar && (recording || s?.status === "loading") ? "animate-pulse" : ""}`}
                  style={{ height: `${Math.round(Math.abs(b) * 100)}%`, minHeight: 3 }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
            <span>
              {s?.status === "loading"
                ? s.position > 0.5
                  ? fr
                    ? "Chargement…"
                    : "Loading…"
                  : fr
                    ? "La voix commence dans un instant…"
                    : "The voice starts in a moment…"
                : !s && recording && !info
                  ? fr
                    ? "Enregistrement de la voix…"
                    : "Recording the voice…"
                  : fmt(preview !== null ? preview * duration : position)}
            </span>
            <span>
              {duration ? `${info?.complete ? "" : "~"}${fmt(duration)}` : `~${estimate} min`}
            </span>
          </div>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-care">{err}</p>}
    </div>
  );
}
