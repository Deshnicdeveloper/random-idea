"use client";
// The conversation loop: listen → think → speak → listen, built to feel like talking to a person.
//
// Turn-taking uses the microphone's VOLUME (voice activity detection), not just the browser's speech
// recognition, which lags by a second or more:
// - When you go quiet for ~0.65 s after speaking, your turn is sent at once with what was recognised.
// - When your voice starts while the pastor is speaking, the pastor's voice dips immediately; once your
//   words are recognised (and aren't the pastor's own voice echoing back), the pastor stops and listens.
//   A cough or a noise lets the voice come back up.
//
// Voice out: the reply is spoken while it is still being written. The first short sentence goes to the
// voice straight away; later sentences are grouped into larger chunks so the delivery flows.
// Chunks are recorded strictly in order (the voice service works on one at a time).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Passage, TranslationId } from "../types";
import { useLiveListening, type Heard } from "./listen";

export type Phase = "idle" | "listening" | "thinking" | "speaking";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  passages: Passage[];
  crisis?: boolean;
  interrupted?: boolean;
  error?: string;
}

const SILENCE_MS = 650; // quiet this long after speech = end of your turn
const VOICE_ON_MS = 120; // sound this long = you're speaking
const CHUNK_CHARS = 320; // later reply chunks group sentences up to this size
const DUCK = 0.2; // pastor's volume while you start talking

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9']+/)
    .filter(Boolean);

/** True if speech heard while the pastor talks is really the user, not the pastor's voice echoing back. */
function isUserSpeech(heard: string, pastorText: string): boolean {
  const h = words(heard);
  if (!h.length) return false;
  const pastor = new Set(words(pastorText));
  const fresh = h.filter((w) => !pastor.has(w)).length;
  return fresh >= 2 || (h.length >= 4 && fresh / h.length >= 0.5);
}

const SENTENCE = /[^.!?…]+[.!?…]+["”’»)]*(\s+|$)/g;
const looksFrench = (t: string) => /[àâçéèêëîïôûùüœ]/i.test(t) || /\b(je|tu|nous|vous|est|pas|une|les|des)\b/i.test(t);

export function useConversation(opts: { translation: TranslationId; natural: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [live, setLive] = useState(""); // what you're saying right now
  const [handsFree, setHandsFree] = useState(false);
  const [level, setLevel] = useState(0); // mic level 0..1, for the orb

  const phaseRef = useRef<Phase>("idle");
  const messagesRef = useRef<ChatMessage[]>([]);
  const handsFreeRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const turn = useRef(0);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const setMsgs = (fn: (m: ChatMessage[]) => ChatMessage[]) => {
    messagesRef.current = fn(messagesRef.current);
    setMessages(messagesRef.current);
  };
  const patch = (id: string, p: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
    setMsgs((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof p === "function" ? p(m) : p) } : m)));

  // ---------- audio graph ----------
  const ctxRef = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);
  const ctx = () => {
    if (!ctxRef.current) {
      const c = new AudioContext();
      const g = c.createGain();
      g.connect(c.destination);
      ctxRef.current = c;
      master.current = g;
    }
    ctxRef.current.resume().catch(() => {});
    return ctxRef.current;
  };
  const setVolume = (v: number, ms = 80) => {
    const c = ctxRef.current;
    const g = master.current;
    if (!c || !g) return;
    g.gain.cancelScheduledValues(c.currentTime);
    g.gain.setValueAtTime(g.gain.value, c.currentTime);
    g.gain.linearRampToValueAtTime(v, c.currentTime + ms / 1000);
  };

  // ---------- the reply being spoken ----------
  const reply = useRef<{
    id: string;
    full: string; // streamed text so far
    cut: number; // chars split into sentences so far
    pending: string[]; // sentences waiting for the voice
    chunks: number; // chunks sent to the voice
    spoken: string; // said aloud so far
    done: boolean;
    abort: AbortController;
  } | null>(null);
  const fetching = useRef(false);
  const playQueue = useRef<{ text: string; buf: AudioBuffer | null }[]>([]);
  const playing = useRef(false);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const lastReply = useRef<{ text: string; until: number }>({ text: "", until: 0 });
  // You kept talking before the pastor said anything: your next words continue this message.
  const continueUser = useRef<string | null>(null);

  const fetchAudio = (text: string): Promise<AudioBuffer | null> =>
    fetch("/api/audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: looksFrench(text) ? "fr" : "en" }),
    })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? ctx().decodeAudioData(b) : null))
      .catch(() => null);

  const finishIfDone = () => {
    const r = reply.current;
    if (!r || !r.done || playing.current || fetching.current || r.pending.length || playQueue.current.length) return;
    lastReply.current = { text: r.full, until: Date.now() + 1500 };
    reply.current = null;
    setVolume(1, 10);
    setPhase(handsFreeRef.current ? "listening" : "idle");
    startUtterance();
  };

  const playNext = async () => {
    if (playing.current) return;
    const item = playQueue.current.shift();
    if (!item) return finishIfDone();
    playing.current = true;
    const mine = turn.current;
    const r = reply.current;
    if (r) r.spoken = `${r.spoken} ${item.text}`.trim();
    if (phaseRef.current === "thinking") setPhase("speaking");
    if (item.buf) {
      await new Promise<void>((resolve) => {
        const c = ctx();
        const src = c.createBufferSource();
        src.buffer = item.buf;
        src.connect(master.current!);
        src.onended = () => resolve();
        source.current = src;
        src.start(c.currentTime + 0.04);
      });
    } else {
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(item.text);
        u.rate = 1;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
    }
    if (mine !== turn.current) return;
    playing.current = false;
    void playNext();
  };

  /** Sends the next chunk of the reply to the voice, one at a time and in order. */
  const pump = async () => {
    const r = reply.current;
    if (!r || fetching.current || !r.pending.length) return finishIfDone();
    // First chunk: just the first sentence, so the voice starts as soon as possible.
    let text = r.pending.shift()!;
    if (r.chunks > 0) while (r.pending.length && text.length + r.pending[0].length < CHUNK_CHARS) text += ` ${r.pending.shift()}`;
    r.chunks++;
    const mine = turn.current;
    if (!optsRef.current.natural) {
      playQueue.current.push({ text, buf: null });
      void playNext();
      return pump();
    }
    fetching.current = true;
    const buf = await fetchAudio(text);
    if (mine !== turn.current) return;
    fetching.current = false;
    playQueue.current.push({ text, buf });
    void playNext();
    void pump();
  };

  /** Splits the streamed text into finished sentences for the voice. */
  const feed = (flush = false) => {
    const r = reply.current;
    if (!r) return;
    const rest = r.full.slice(r.cut);
    let used = 0;
    for (const m of rest.matchAll(SENTENCE)) {
      if (m.index !== used) break;
      const s = m[0].trim();
      if (s) r.pending.push(s);
      used += m[0].length;
    }
    if (flush && rest.slice(used).trim()) {
      r.pending.push(rest.slice(used).trim());
      used = rest.length;
    }
    r.cut += used;
    void pump();
  };

  /** Stops the pastor mid-reply. */
  const interrupt = useCallback(() => {
    const r = reply.current;
    if (!r) return;
    turn.current++;
    r.abort.abort();
    playQueue.current = [];
    playing.current = false;
    fetching.current = false;
    try {
      source.current?.stop();
    } catch {}
    window.speechSynthesis?.cancel();
    setVolume(1, 10);
    if (r.spoken) {
      patch(r.id, { text: `${r.spoken} —`, interrupted: true });
    } else {
      // Nothing was said yet: drop the empty reply and treat your next words as the rest of your message.
      const list = messagesRef.current;
      const prev = list[list.findIndex((m) => m.id === r.id) - 1];
      setMsgs((l) => l.filter((m) => m.id !== r.id));
      continueUser.current = prev?.role === "user" ? prev.id : null;
    }
    lastReply.current = { text: r.full, until: Date.now() + 1500 };
    reply.current = null;
    setPhase(handsFreeRef.current ? "listening" : "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- asking the pastor ----------
  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) return;
      if (reply.current) interrupt();
      ctx();
      const myTurn = ++turn.current;
      const answer: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: "", passages: [] };
      const cont = continueUser.current;
      continueUser.current = null;
      if (cont && messagesRef.current.at(-1)?.id === cont) {
        patch(cont, (m) => ({ text: `${m.text} ${content}` }));
        setMsgs((m) => [...m, answer]);
      } else {
        const user: ChatMessage = { id: crypto.randomUUID(), role: "user", text: content, passages: [] };
        setMsgs((m) => [...m, user, answer]);
      }
      setPhase("thinking");
      const abort = new AbortController();
      reply.current = { id: answer.id, full: "", cut: 0, pending: [], chunks: 0, spoken: "", done: false, abort };

      const history = messagesRef.current
        .filter((m) => m.id !== answer.id && (m.text || m.passages.length))
        .map((m) => ({
          role: m.role,
          content:
            m.role === "assistant" && m.passages.length
              ? `${m.text} (Shown on screen: ${m.passages.map((p) => p.reference).join(", ")}.)`
              : m.text,
        }));

      try {
        const r = await fetch("/api/talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history, translation: optsRef.current.translation }),
          signal: abort.signal,
        });
        if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? "The pastor couldn't answer right now.");
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line || myTurn !== turn.current) continue;
            const e = JSON.parse(line);
            if (e.type === "delta" && reply.current) {
              reply.current.full += e.text;
              patch(answer.id, { text: reply.current.full });
              feed();
            } else if (e.type === "passage") patch(answer.id, (m) => ({ passages: [...m.passages, e.passage] }));
            else if (e.type === "crisis") patch(answer.id, { crisis: true });
            else if (e.type === "error") patch(answer.id, { error: e.message });
          }
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        patch(answer.id, { error: err instanceof Error ? err.message : "Something went wrong." });
      }
      if (myTurn !== turn.current || !reply.current) return;
      reply.current.done = true;
      feed(true);
      finishIfDone();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interrupt],
  );

  // ---------- your voice: recognised words ----------
  const results = useRef(new Map<string, { s: number; i: number; text: string }>());
  const accepting = useRef<{ session: number; index: number } | null>(null); // first result of this utterance
  const maxSeen = useRef<{ session: number; index: number }>({ session: -1, index: -1 });
  const finalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startUtterance = () => {
    results.current.clear();
    // Results already seen (echo, or late words of a sent turn) never start a new message.
    accepting.current = maxSeen.current.index >= 0 ? { session: maxSeen.current.session, index: maxSeen.current.index + 1 } : null;
    setLive("");
  };
  const utterance = () =>
    [...results.current.values()]
      .sort((a, z) => a.s - z.s || a.i - z.i)
      .map((r) => r.text)
      .join(" ")
      .trim();

  const endTurn = () => {
    if (finalTimer.current) clearTimeout(finalTimer.current);
    const text = utterance();
    // Anything recognised later for these same results belongs to this (already sent) turn.
    accepting.current = { session: maxSeen.current.session, index: maxSeen.current.index + 1 };
    results.current.clear();
    setLive("");
    if (words(text).length) void send(text);
  };

  const onHeard = useCallback(
    (h: Heard) => {
      if (!handsFreeRef.current) return;
      if (h.session > maxSeen.current.session || (h.session === maxSeen.current.session && h.index > maxSeen.current.index))
        maxSeen.current = { session: h.session, index: h.index };
      const busy = phaseRef.current === "speaking" || phaseRef.current === "thinking";
      const echoOf = busy ? (reply.current?.full ?? "") : Date.now() < lastReply.current.until ? lastReply.current.text : null;
      if (echoOf !== null && !isUserSpeech(h.text, echoOf)) return; // the pastor's own voice through the mic
      if (busy) interrupt(); // your words confirmed: the pastor stops and listens
      const a = accepting.current;
      if (a && h.session === a.session && h.index < a.index) return;
      if (!a) accepting.current = { session: h.session, index: h.index };
      results.current.set(`${h.session}:${h.index}`, { s: h.session, i: h.index, text: h.text });
      setLive(utterance());
      // Your turn ends on whichever comes first:
      //  - the volume detector hears you go quiet (in the detector loop below),
      //  - the recogniser finalises your words and nothing new follows for 0.7 s,
      //  - your words stop changing for 1.4 s (some mics are slow to reach "final").
      if (finalTimer.current) clearTimeout(finalTimer.current);
      if (vad.current && !vad.current.speaking && h.isFinal && vad.current.endedAt && Date.now() - vad.current.endedAt > SILENCE_MS) {
        endTurn(); // words arrived after the silence was already detected
      } else {
        const stillLoud = vad.current?.speaking ?? false;
        finalTimer.current = setTimeout(endTurn, h.isFinal ? (stillLoud ? 1200 : 700) : 1400);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interrupt],
  );

  const mic = useLiveListening(onHeard);

  // ---------- your voice: volume (voice activity detection) ----------
  const vad = useRef<{
    stream: MediaStream;
    timer: ReturnType<typeof setInterval>;
    speaking: boolean;
    since: number; // when sound started
    lastVoice: number;
    endedAt: number;
    floor: number; // room noise
    bleed: number; // how loud the pastor's own voice is in the mic
  } | null>(null);

  const startVad = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const c = ctx();
      const analyser = c.createAnalyser();
      analyser.fftSize = 1024;
      c.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const v = { stream, timer: 0 as unknown as ReturnType<typeof setInterval>, speaking: false, since: 0, lastVoice: 0, endedAt: 0, floor: 0.004, bleed: 0 };
      v.timer = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();
        const pastorTalking = playing.current;
        if (pastorTalking && !v.speaking) v.bleed = 0.9 * v.bleed + 0.1 * rms;
        else if (!pastorTalking) v.bleed *= 0.95;
        // Sensitive enough for a laptop mic at arm's length; relative to the room's own noise.
        const threshold = Math.max(0.005, v.floor * 2.5, pastorTalking ? v.bleed * 2.5 : 0);
        const loud = rms > threshold;
        if (!loud && !v.speaking && !pastorTalking) v.floor = 0.97 * v.floor + 0.03 * rms;
        setLevel(Math.round(Math.min(1, rms / Math.max(threshold * 3, 0.05)) * 10) / 10);
        if (loud) {
          v.lastVoice = now;
          if (!v.since) v.since = now;
          if (!v.speaking && now - v.since >= VOICE_ON_MS) {
            v.speaking = true;
            if (pastorTalking) setVolume(DUCK); // dip immediately; words decide if it really stops
          }
        } else if (now - v.lastVoice > 200) v.since = 0;
        if (v.speaking && now - v.lastVoice > SILENCE_MS) {
          v.speaking = false;
          v.endedAt = now;
          if (reply.current) setVolume(1, 200); // it was a noise, not an interruption
          else if (handsFreeRef.current && words(utterance()).length) endTurn();
        }
      }, 40);
      vad.current = v;
    } catch {
      vad.current = null; // no mic access for volume: recogniser pauses are used instead
    }
  };
  const stopVad = () => {
    const v = vad.current;
    if (!v) return;
    clearInterval(v.timer);
    v.stream.getTracks().forEach((t) => t.stop());
    vad.current = null;
    setLevel(0);
  };

  /** Starts or ends hands-free conversation. Call from a tap. */
  const toggleHandsFree = useCallback(
    (language = "en-US") => {
      if (handsFreeRef.current) {
        handsFreeRef.current = false;
        setHandsFree(false);
        mic.stop();
        stopVad();
        setLive("");
        if (phaseRef.current === "listening") setPhase("idle");
        return;
      }
      ctx();
      handsFreeRef.current = true;
      setHandsFree(true);
      startUtterance();
      mic.start(language);
      void startVad();
      if (!reply.current) setPhase("listening");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mic.start, mic.stop],
  );

  /** "I'm done": sends what you've said right away. Returns false if nothing was heard yet. */
  const sendNow = useCallback(() => {
    if (!words(utterance()).length) return false;
    endTurn();
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    interrupt();
    setMsgs(() => []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupt]);

  useEffect(
    () => () => {
      turn.current++;
      reply.current?.abort.abort();
      try {
        source.current?.stop();
      } catch {}
      window.speechSynthesis?.cancel();
      stopVad();
      ctxRef.current?.close().catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { messages, phase, live, level, handsFree, micSupported: mic.supported, micError: mic.error, send, sendNow, interrupt, toggleHandsFree, reset };
}
