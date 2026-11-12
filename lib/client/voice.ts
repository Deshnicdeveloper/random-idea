"use client";
// Voice playback.
//
// With a natural voice configured, text is split into pieces (a short first piece, then ~700 chars).
// Pieces are recorded one after another through /api/audio (each recorded once and cached on the
// server) and played back to back with Web Audio, so playback starts after the FIRST piece instead
// of after the whole text. The waveform fills in as pieces arrive; seeking works within the part
// already recorded. Without a natural voice, falls back to the browser's built-in speech.
import { useCallback, useEffect, useRef, useState } from "react";
import { SPEECH_FIRST_PIECE, SPEECH_PIECE, splitPieces } from "../speech-pieces";

type Lang = "en" | "fr";
export type VoiceStatus = "loading" | "playing" | "paused";
export interface VoiceState {
  id: string;
  status: VoiceStatus; // "loading" = waiting for audio (first piece, or playback caught up with recording)
  position: number; // seconds
  duration: number; // seconds; an estimate until every piece is recorded
}
export interface AudioInfo {
  bars: number[]; // 0..1 loudness per bar across the (estimated) whole; -1 = not recorded yet
  duration: number; // seconds (estimated until complete)
  recorded: number; // seconds recorded so far
  complete: boolean;
}

const BARS = 96;

interface Track {
  id: string;
  lang: Lang;
  texts: string[];
  buffers: (AudioBuffer | undefined)[];
  starts: number[]; // timeline start (s) of each recorded piece
  complete: boolean;
  failed?: string;
  waiters: (() => void)[]; // resolved whenever a piece arrives (or recording fails)
}

const recordedCount = (t: Track) => {
  let n = 0;
  while (n < t.texts.length && t.buffers[n]) n++;
  return n;
};
const recordedSeconds = (t: Track) => {
  let s = 0;
  for (let i = 0; i < recordedCount(t); i++) s += t.buffers[i]!.duration;
  return s;
};
/** Total length: exact when complete, otherwise extrapolated from the speaking rate so far. */
const estimatedDuration = (t: Track) => {
  const n = recordedCount(t);
  const secs = recordedSeconds(t);
  if (n === t.texts.length) return secs;
  const chars = (from: number, to: number) => t.texts.slice(from, to).reduce((a, s) => a + s.length, 0);
  const rate = n ? secs / chars(0, n) : 1 / 14; // ~14 characters per second of speech before any data
  return secs + chars(n, t.texts.length) * rate;
};

function computeBars(t: Track): number[] {
  const n = recordedCount(t);
  if (!n) return [];
  const total = estimatedDuration(t);
  const sr = t.buffers[0]!.sampleRate;
  const parts = t.buffers.slice(0, n).map((b) => b!.getChannelData(0));
  const data = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  const perBar = Math.max(1, Math.floor((total * sr) / BARS));
  const raw: number[] = [];
  for (let b = 0; b < BARS; b++) {
    const start = b * perBar;
    if (start >= data.length) {
      raw.push(-1); // not recorded yet
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let i = start; i < Math.min(start + perBar, data.length); i += 4) {
      sum += data[i] * data[i];
      count++;
    }
    raw.push(Math.sqrt(sum / Math.max(1, count)));
  }
  const max = Math.max(...raw, 1e-6);
  return raw.map((v) => (v < 0 ? -1 : Math.max(0.06, Math.sqrt(v / max))));
}

// ---------- browser speech fallback ----------
const PREFERRED: Record<Lang, string[]> = {
  en: ["Microsoft Andrew Online (Natural)", "Microsoft Guy Online (Natural)", "Google UK English Male", "Daniel", "Aaron", "Samantha"],
  fr: ["Microsoft Henri Online (Natural)", "Microsoft Denise Online (Natural)", "Google français", "Thomas", "Amélie"],
};
function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  for (const n of PREFERRED[lang]) {
    const v = voices.find((x) => x.name.startsWith(n));
    if (v) return v;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
}

export function useVoice() {
  const [natural, setNatural] = useState(false);
  const [free, setFree] = useState(false); // free voice (Kokoro): record before anyone presses Play
  const [pending, setPending] = useState<Record<string, boolean>>({}); // ids still recording
  const [state, setState] = useState<VoiceState | null>(null);
  const [audioInfo, setAudioInfo] = useState<Record<string, AudioInfo>>({});
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const tracks = useRef(new Map<string, Track>()); // key: id + text
  const stateRef = useRef<VoiceState | null>(null);
  const pausedTrack = useRef<Track | null>(null);
  const raf = useRef(0);
  const session = useRef(0);
  // The track being played and how its pieces are scheduled on the audio clock.
  const engine = useRef<{
    track: Track;
    sources: AudioBufferSourceNode[];
    nextPiece: number; // next piece to schedule
    nextAt: number; // audio-clock time where it should start
    anchorCtx: number; // audio-clock time ...
    anchorPos: number; // ... that corresponds to this timeline position
  } | null>(null);

  const set = (s: VoiceState | null) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    fetch("/api/audio")
      .then((r) => r.json())
      .then((d: { provider: string | null; free?: boolean }) => {
        setNatural(Boolean(d.provider));
        setFree(Boolean(d.free));
      })
      .catch(() => {});
    window.speechSynthesis?.getVoices();
    return () => {
      cancelAnimationFrame(raf.current);
      engine.current?.sources.forEach((s) => {
        try {
          s.stop();
        } catch {}
      });
      window.speechSynthesis?.cancel();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const ctx = (resume = true) => {
    const c = (ctxRef.current ??= new AudioContext());
    if (resume) c.resume().catch(() => {});
    return c;
  };

  // ---------- playback engine ----------
  const halt = () => {
    cancelAnimationFrame(raf.current);
    const e = engine.current;
    if (e)
      for (const s of e.sources) {
        s.onended = null;
        try {
          s.stop();
        } catch {}
      }
    engine.current = null;
    window.speechSynthesis?.cancel();
  };

  const finishOn = (src: AudioBufferSourceNode) => {
    src.onended = () => {
      if (engine.current?.sources.includes(src)) {
        halt();
        pausedTrack.current = null;
        set(null);
      }
    };
  };

  const positionNow = () => {
    const e = engine.current!;
    const c = ctxRef.current!;
    const scheduledEnd = e.anchorPos + (e.nextAt - e.anchorCtx);
    const pos = e.anchorPos + Math.max(0, c.currentTime - e.anchorCtx);
    return { pos: Math.min(pos, scheduledEnd), starved: pos >= scheduledEnd - 0.01 };
  };

  /** Schedules every recorded piece that isn't scheduled yet, back to back. */
  const scheduleMore = () => {
    const e = engine.current;
    if (!e) return;
    const c = ctx();
    while (e.nextPiece < e.track.texts.length && e.track.buffers[e.nextPiece]) {
      const i = e.nextPiece;
      const buf = e.track.buffers[i]!;
      const now = c.currentTime + 0.03;
      if (e.nextAt < now) {
        // Playback caught up with recording: continue the timeline where this piece begins.
        e.anchorCtx = now;
        e.anchorPos = e.track.starts[i];
        e.nextAt = now;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(e.nextAt);
      if (i === e.track.texts.length - 1) finishOn(src);
      e.sources.push(src);
      e.nextAt += buf.duration;
      e.nextPiece++;
    }
  };

  const tick = () => {
    const e = engine.current;
    const s = stateRef.current;
    if (!e || !s || s.status === "paused") return;
    const { pos, starved } = positionNow();
    const waiting = starved && e.nextPiece < e.track.texts.length;
    if (waiting && e.track.failed) {
      const id = e.track.id;
      halt();
      set(null);
      setError({ id, message: e.track.failed });
      return;
    }
    set({ id: s.id, status: waiting ? "loading" : "playing", position: pos, duration: estimatedDuration(e.track) });
    raf.current = requestAnimationFrame(tick);
  };

  /** Starts playing a track at timeline position `pos` (inside a recorded piece). */
  const startAt = (t: Track, pos: number) => {
    halt();
    const c = ctx();
    const n = recordedCount(t);
    let k = 0;
    while (k + 1 < n && t.starts[k + 1] <= pos) k++;
    const buf = t.buffers[k]!;
    const offset = Math.max(0, Math.min(pos - t.starts[k], buf.duration - 0.05));
    const at = c.currentTime + 0.03;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(at, offset);
    if (k === t.texts.length - 1) finishOn(src);
    engine.current = { track: t, sources: [src], nextPiece: k + 1, nextAt: at + buf.duration - offset, anchorCtx: at, anchorPos: t.starts[k] + offset };
    pausedTrack.current = null;
    scheduleMore();
    set({ id: t.id, status: "playing", position: t.starts[k] + offset, duration: estimatedDuration(t) });
    raf.current = requestAnimationFrame(tick);
  };

  // ---------- recording ----------
  const publish = (t: Track) =>
    setAudioInfo((p) => ({
      ...p,
      [t.id]: { bars: computeBars(t), duration: estimatedDuration(t), recorded: recordedSeconds(t), complete: t.complete },
    }));

  const record = async (t: Track) => {
    const c = ctx(false);
    setPending((p) => ({ ...p, [t.id]: true }));
    for (let i = 0; i < t.texts.length; i++) {
      try {
        const r = await fetch("/api/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: t.texts[i],
            lang: t.lang,
            previous: t.texts[i - 1]?.slice(-400),
            next: t.texts[i + 1]?.slice(0, 400),
          }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Voice unavailable");
        const buf = await c.decodeAudioData(await r.arrayBuffer());
        t.starts[i] = i === 0 ? 0 : t.starts[i - 1] + t.buffers[i - 1]!.duration;
        t.buffers[i] = buf;
        if (i === t.texts.length - 1) t.complete = true;
      } catch (e) {
        t.failed = e instanceof Error ? e.message : "Voice unavailable";
      }
      publish(t);
      t.waiters.splice(0).forEach((w) => w());
      if (engine.current?.track === t) scheduleMore(); // line up the new piece behind what's playing
      if (t.failed) break;
    }
    setPending((p) => ({ ...p, [t.id]: false }));
  };

  const getTrack = (id: string, text: string, lang: Lang) => {
    const key = `${id}\u0000${text}`;
    let t = tracks.current.get(key);
    if (!t || (t.failed && !recordedCount(t))) {
      const texts = splitPieces(text, SPEECH_PIECE, SPEECH_FIRST_PIECE);
      t = { id, lang, texts, buffers: [], starts: [], complete: false, waiters: [] };
      tracks.current.set(key, t);
      void record(t);
    }
    return t;
  };

  const waitForPiece = (t: Track, i: number) =>
    new Promise<void>((resolve) => {
      if (t.buffers[i] || t.failed) return resolve();
      t.waiters.push(resolve);
    });

  const speakBrowser = (id: string, text: string, lang: Lang, mine: number) => {
    const synth = window.speechSynthesis;
    if (!synth) return set(null);
    const voice = pickVoice(lang);
    const list = splitPieces(text, 220);
    set({ id, status: "playing", position: 0, duration: 0 });
    list.forEach((s, i) => {
      const u = new SpeechSynthesisUtterance(s);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? (lang === "fr" ? "fr-FR" : "en-US");
      u.rate = 0.95;
      u.pitch = 0.95;
      if (i === list.length - 1) u.onend = () => session.current === mine && set(null);
      u.onerror = () => session.current === mine && set(null);
      synth.speak(u);
    });
  };

  /** Plays a text from `from` seconds. Call from a tap (browsers only allow sound after one). */
  const play = useCallback(
    async (id: string, text: string, lang: Lang = "en", from = 0) => {
      const mine = ++session.current;
      halt();
      pausedTrack.current = null;
      setError(null);
      if (!natural) return speakBrowser(id, text, lang, mine);
      ctx(); // unlock audio inside the tap
      const t = getTrack(id, text, lang);
      set({ id, status: "loading", position: from, duration: estimatedDuration(t) });
      // Wait until the piece containing `from` is recorded (usually just the first piece).
      while (!t.failed && !t.complete && recordedSeconds(t) <= from) {
        await waitForPiece(t, recordedCount(t));
        if (session.current !== mine) return;
      }
      if (session.current !== mine) return;
      if (!recordedCount(t)) {
        set(null);
        setError({ id, message: t.failed ?? "Voice unavailable" });
        return;
      }
      startAt(t, Math.min(from, recordedSeconds(t) - 0.05));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [natural],
  );

  const pause = useCallback(() => {
    const s = stateRef.current;
    const e = engine.current;
    if (!s || !e) return;
    session.current++;
    const { pos } = positionNow();
    const t = e.track;
    halt();
    pausedTrack.current = t;
    set({ ...s, status: "paused", position: pos, duration: estimatedDuration(t) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = useCallback(() => {
    const s = stateRef.current;
    const t = pausedTrack.current;
    if (!s || s.status !== "paused" || !t || t.id !== s.id) return;
    session.current++;
    startAt(t, Math.min(s.position, recordedSeconds(t) - 0.05));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    session.current++;
    halt();
    pausedTrack.current = null;
    set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Jumps to a point (0..1) of the audio, within the part already recorded. */
  const seek = useCallback((id: string, fraction: number) => {
    const s = stateRef.current;
    if (!s || s.id !== id) return;
    const t = engine.current?.track ?? pausedTrack.current;
    if (!t) return;
    const target = Math.max(0, Math.min(1, fraction)) * estimatedDuration(t);
    const pos = Math.max(0, Math.min(target, recordedSeconds(t) - 0.05));
    if (s.status === "paused") set({ ...s, position: pos });
    else startAt(t, pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Records in the background so Play is instant (used when the voice is free). */
  const preload = useCallback((id: string, text: string, lang: Lang = "en") => {
    getTrack(id, text, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { natural, free, pending, state, audioInfo, error, play, pause, resume, stop, seek, preload };
}

export type Voice = ReturnType<typeof useVoice>;
