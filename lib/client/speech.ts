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

// Read-aloud lives in lib/client/voice.ts.
