"use client";
// Soft church-style keys under the preacher's voice.
// Plays an Epidemic Sound track when the server has one, otherwise generates its own keys
// with the Web Audio API (original sound, no licence, no data download).
import { useCallback, useEffect, useRef, useState } from "react";

type TrackInfo = { source: "epidemic"; url: string; title: string; artist: string } | { source: "builtin" };

const MIDI = (n: number) => 440 * 2 ** ((n - 69) / 12);

// Db major worship progression: Dbmaj9 - Bbm9 - Gbmaj9 - Ab9sus (bass note first, then voicing).
const CHORDS: [number, number[]][] = [
  [37, [49, 56, 60, 63, 65]],
  [34, [46, 53, 56, 60, 61]],
  [30, [42, 49, 53, 56, 61]],
  [32, [44, 51, 54, 58, 61]],
];
const MELODY = [73, 75, 77, 80, 82, 85]; // Db major pentatonic, upper register
const CHORD_SECONDS = 6;
const LEVEL = { builtin: 0.22, epidemic: 0.13 };

function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

/** Generated soft keys: electric-piano tones over a warm pad, through a long reverb. */
class SoftKeys {
  private bus: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;

  constructor(private ctx: AudioContext, private out: GainNode) {
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 4, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    tone.connect(dry).connect(out);
    tone.connect(reverb).connect(wet).connect(out);
    this.bus = ctx.createGain();
    this.bus.connect(tone);
  }

  private piano(midi: number, t: number, vel: number, len: number) {
    const { ctx } = this;
    const f = MIDI(midi);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.015);
    env.gain.exponentialRampToValueAtTime(vel * 0.3, t + 1.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    env.connect(this.bus);
    const partials: [OscillatorType, number, number, number][] = [
      ["sine", 1, 1, 0],
      ["triangle", 1, 0.25, 4],
      ["sine", 2, 0.12, 0],
      ["sine", 3, 0.03, 0],
    ];
    for (const [type, mult, gain, detune] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(env);
      o.start(t);
      o.stop(t + len + 0.1);
    }
  }

  private pad(notes: number[], t: number, len: number) {
    const { ctx } = this;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.045, t + 2.2);
    env.gain.setValueAtTime(0.045, t + len - 1.5);
    env.gain.linearRampToValueAtTime(0, t + len + 1.5);
    filter.connect(env).connect(this.bus);
    for (const n of notes) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = MIDI(n);
        o.detune.value = detune;
        o.connect(filter);
        o.start(t);
        o.stop(t + len + 1.6);
      }
    }
  }

  private schedule(t: number) {
    const [bass, voicing] = CHORDS[this.step % CHORDS.length];
    this.pad([bass + 12, ...voicing.slice(0, 3)], t, CHORD_SECONDS);
    this.piano(bass, t, 0.18, CHORD_SECONDS);
    voicing.forEach((n, i) => this.piano(n, t + 0.06 + i * 0.05, 0.07, CHORD_SECONDS - 0.5));
    // a soft repeat of the top of the chord halfway through
    voicing.slice(-2).forEach((n, i) => this.piano(n, t + CHORD_SECONDS / 2 + i * 0.08, 0.04, 2.8));
    // now and then, a gentle melody note
    if (Math.random() < 0.6) {
      const m = MELODY[Math.floor(Math.random() * MELODY.length)];
      this.piano(m, t + 1.5 + Math.random() * 2.5, 0.045, 3);
    }
    this.step++;
  }

  start() {
    this.nextTime = this.ctx.currentTime + 0.1;
    const tick = () => {
      while (this.nextTime < this.ctx.currentTime + 1.5) {
        this.schedule(this.nextTime);
        this.nextTime += CHORD_SECONDS;
      }
    };
    tick();
    this.timer = setInterval(tick, 400);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// iPhones ignore volume on <audio>, so a full-volume track would drown the voice: use built-in keys there.
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const PREF_KEY = "selah:music";

export function useMusicBed() {
  const [enabled, setEnabledState] = useState(true);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const keys = useRef<{ synth: SoftKeys; out: GainNode } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fade = useRef<ReturnType<typeof setInterval> | null>(null);
  const info = useRef<Promise<TrackInfo> | null>(null);
  const session = useRef(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(PREF_KEY) === "off") setEnabledState(false);
    } catch {}
    return () => {
      keys.current?.synth.stop();
      audio.current?.pause();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      localStorage.setItem(PREF_KEY, on ? "on" : "off");
    } catch {}
  }, []);

  const fadeAudio = (el: HTMLAudioElement, to: number, ms: number, done?: () => void) => {
    if (fade.current) clearInterval(fade.current);
    const from = el.volume;
    const start = performance.now();
    fade.current = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) {
        clearInterval(fade.current!);
        fade.current = null;
        done?.();
      }
    }, 50);
  };

  const startBuiltin = (ctx: AudioContext) => {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);
    const synth = new SoftKeys(ctx, out);
    synth.start();
    out.gain.linearRampToValueAtTime(LEVEL.builtin, ctx.currentTime + 2.5);
    keys.current = { synth, out };
    setNowPlaying(null);
  };

  /** Call from the click that starts the preacher's voice (browsers only allow sound after a tap). */
  const start = useCallback(async () => {
    if (!enabled) return;
    const mine = ++session.current;
    // Create/resume the audio context synchronously inside the click.
    const ctx = (ctxRef.current ??= new AudioContext());
    ctx.resume().catch(() => {});
    if (keys.current || (audio.current && !audio.current.paused)) return; // already playing

    info.current ??= fetch("/api/music")
      .then((r) => r.json() as Promise<TrackInfo>)
      .catch(() => ({ source: "builtin" }) as TrackInfo);
    const track = await info.current;
    if (session.current !== mine) return;

    if (track.source === "epidemic" && !isIOS()) {
      const el = (audio.current ??= new Audio());
      el.src = track.url;
      el.loop = true;
      el.volume = 0;
      try {
        await el.play();
        if (session.current !== mine) return el.pause();
        fadeAudio(el, LEVEL.epidemic, 2500);
        setNowPlaying(`${track.title}${track.artist ? ` · ${track.artist}` : ""} (Epidemic Sound)`);
        return;
      } catch {
        info.current = null; // link expired or blocked: fall back and refetch next time
      }
    }
    startBuiltin(ctx);
  }, [enabled]);

  const stop = useCallback(() => {
    session.current++;
    const k = keys.current;
    const ctx = ctxRef.current;
    if (k && ctx) {
      keys.current = null;
      k.out.gain.cancelScheduledValues(ctx.currentTime);
      k.out.gain.setValueAtTime(k.out.gain.value, ctx.currentTime);
      k.out.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
      setTimeout(() => {
        k.synth.stop();
        k.out.disconnect();
      }, 3200);
    }
    const el = audio.current;
    if (el && !el.paused) fadeAudio(el, 0, 3000, () => el.pause());
    setNowPlaying(null);
  }, []);

  return { enabled, setEnabled, start, stop, nowPlaying };
}
