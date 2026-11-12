"use client";
// Continuous speech recognition for live use (service mode, conversation mode).
// Wraps the browser's SpeechRecognition (Chrome, Edge, Safari): keeps listening across the browser's
// own automatic stops, and reports every result with its index so callers can tell new speech from
// the same phrase being refined.
import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult {
  0: { transcript: string };
  isFinal: boolean;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onspeechstart?: (() => void) | null;
}

export interface Heard {
  index: number; // result index within this recognition session
  session: number; // increments each time the browser restarts recognition
  text: string;
  isFinal: boolean;
}

function ctor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useLiveListening(onHeard: (h: Heard) => void, opts: { onSpeechStart?: () => void } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const want = useRef(false);
  const session = useRef(0);
  const lang = useRef("en-US");
  const cb = useRef(onHeard);
  cb.current = onHeard;
  const speechStart = useRef(opts.onSpeechStart);
  speechStart.current = opts.onSpeechStart;

  useEffect(() => setSupported(Boolean(ctor())), []);

  const begin = useCallback(() => {
    const C = ctor();
    if (!C) return;
    const r = new C();
    r.lang = lang.current;
    r.continuous = true;
    r.interimResults = true;
    const mySession = ++session.current;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        cb.current({ index: i, session: mySession, text: res[0].transcript, isFinal: res.isFinal });
      }
    };
    r.onspeechstart = () => speechStart.current?.();
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        want.current = false;
        setError("Microphone permission was blocked. Allow it in the browser's address bar.");
      } else if (e.error === "network") setError("Speech recognition needs an internet connection.");
    };
    // Browsers stop recognition after silence or about a minute: restart while we still want it.
    r.onend = () => {
      if (want.current && rec.current === r) setTimeout(() => want.current && begin(), 150);
      else setListening(false);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      /* already started */
    }
  }, []);

  const start = useCallback(
    (language = "en-US") => {
      if (!ctor()) return;
      setError(null);
      lang.current = language;
      want.current = true;
      rec.current?.abort();
      begin();
    },
    [begin],
  );

  const stop = useCallback(() => {
    want.current = false;
    rec.current?.stop();
    rec.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => {
    want.current = false;
    rec.current?.abort();
  }, []);

  return { supported, listening, error, start, stop };
}
