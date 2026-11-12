"use client";
// Browser voice in and voice out (Web Speech API). Free and key-less; quality varies by browser.
import { useCallback, useEffect, useRef, useState } from "react";

// ---------- Voice input ----------

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => setSupported(Boolean(getRecognitionCtor())), []);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    const lang = navigator.language?.toLowerCase().startsWith("en") ? navigator.language : "en-US";
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      onTextRef.current((finalText + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") setError("Microphone permission was blocked.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError("Voice input stopped. Try again.");
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }, []);

  return { supported, listening, error, start, stop };
}

// ---------- Read aloud ----------
// Uses the natural voice from /api/speak when one is configured (ElevenLabs or Azure),
// otherwise the browser's built-in voice.

type Lang = "en" | "fr";

const PREFERRED_VOICES: Record<Lang, string[]> = {
  en: ["Microsoft Andrew Online (Natural)", "Microsoft Guy Online (Natural)", "Google UK English Male", "Daniel", "Aaron", "Google US English", "Samantha"],
  fr: ["Microsoft Henri Online (Natural)", "Microsoft Denise Online (Natural)", "Google français", "Thomas", "Amélie", "Audrey"],
};

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  for (const name of PREFERRED_VOICES[lang]) {
    const v = voices.find((x) => x.name.startsWith(name));
    if (v) return v;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
}

/** Splits text into pieces of at most `max` characters, preferring sentence boundaries. */
function chunks(text: string, max: number): string[] {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?;:]+[.!?;:]+["”’»)]*|\S[^.!?;:]*$/g) ?? [text];
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + p).length > max && buf) {
      out.push(buf.trim());
      buf = "";
    }
    buf += p + " ";
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Paragraph-sized pieces for the natural voice: small first piece so audio starts fast. */
function voiceChunks(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    const limit = out.length === 0 ? 450 : 1200;
    if (p.length <= limit) out.push(p);
    else out.push(...chunks(p, limit));
  }
  // merge tiny neighbours to reduce requests
  const merged: string[] = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && merged.length > 1 && last.length + c.length < 900) merged[merged.length - 1] = `${last}\n\n${c}`;
    else merged.push(c);
  }
  return merged;
}

export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [natural, setNatural] = useState(false);
  const [supported, setSupported] = useState(false);
  const session = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported("speechSynthesis" in window || "Audio" in window);
    window.speechSynthesis?.getVoices(); // warm the voice list
    fetch("/api/speak")
      .then((r) => r.json())
      .then((d: { provider: string | null }) => setNatural(Boolean(d.provider)))
      .catch(() => {});
    return () => {
      window.speechSynthesis?.cancel();
      audio.current?.pause();
    };
  }, []);

  const stop = useCallback(() => {
    session.current++;
    window.speechSynthesis?.cancel();
    audio.current?.pause();
    setSpeakingId(null);
    setLoadingId(null);
  }, []);

  const speakBrowser = useCallback((id: string, text: string, lang: Lang, mine: number) => {
    const synth = window.speechSynthesis;
    if (!synth) return setSpeakingId(null);
    const voice = pickVoice(lang);
    const list = chunks(text, 220);
    list.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? (lang === "fr" ? "fr-FR" : "en-US");
      u.rate = 0.95;
      u.pitch = 0.95;
      if (i === list.length - 1) u.onend = () => session.current === mine && setSpeakingId(null);
      u.onerror = () => session.current === mine && setSpeakingId(null);
      synth.speak(u);
    });
  }, []);

  const speak = useCallback(
    async (id: string, text: string, lang: Lang = "en") => {
      window.speechSynthesis?.cancel();
      audio.current?.pause();
      const mine = ++session.current;
      setSpeakingId(id);
      if (!natural) return speakBrowser(id, text, lang, mine);

      // Create the audio element inside the click so mobile browsers allow playback.
      const el = (audio.current ??= new Audio());
      const parts = voiceChunks(text);
      const fetchPart = (i: number) =>
        fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: parts[i], lang, previous: parts[i - 1]?.slice(-400), next: parts[i + 1]?.slice(0, 400) }),
        }).then((r) => {
          if (!r.ok) throw new Error(`voice ${r.status}`);
          return r.blob();
        });

      setLoadingId(id);
      try {
        let next = fetchPart(0);
        for (let i = 0; i < parts.length; i++) {
          const blob = await next;
          if (session.current !== mine) return;
          if (i + 1 < parts.length) next = fetchPart(i + 1); // prepare the next piece while this one plays
          setLoadingId(null);
          const url = URL.createObjectURL(blob);
          el.src = url;
          await new Promise<void>((resolve) => {
            el.onended = () => resolve();
            el.onerror = () => resolve();
            el.onpause = () => session.current !== mine && resolve();
            el.play().catch(() => resolve());
          });
          URL.revokeObjectURL(url);
          if (session.current !== mine) return;
        }
        setSpeakingId(null);
      } catch {
        // Natural voice failed (network, quota): fall back to the browser voice.
        if (session.current !== mine) return;
        setLoadingId(null);
        speakBrowser(id, text, lang, mine);
      }
    },
    [natural, speakBrowser],
  );

  return { supported, natural, speakingId, loadingId, speak, stop };
}
