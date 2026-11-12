// Natural voice for read-aloud. Set ONE of these in .env.local:
//   ELEVENLABS_API_KEY (+ optional ELEVENLABS_VOICE_ID, ELEVENLABS_VOICE_ID_FR)
//   AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (+ optional AZURE_VOICE_EN, AZURE_VOICE_FR)
// With neither, the browser's built-in voice is used.
import type { Lang } from "./types";

export type TtsProvider = "elevenlabs" | "azure";

export function ttsProvider(): TtsProvider | null {
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure";
  return null;
}

export interface SpeakRequest {
  text: string;
  lang: Lang;
  previous?: string; // neighbouring text helps keep intonation smooth across chunks
  next?: string;
}

export async function synthesize(req: SpeakRequest): Promise<Response> {
  const provider = ttsProvider();
  if (provider === "elevenlabs") return elevenlabs(req);
  if (provider === "azure") return azure(req);
  throw new Error("No voice provider configured");
}

async function elevenlabs({ text, lang, previous, next }: SpeakRequest) {
  // Default: a stock ElevenLabs narrator voice. Pick a warmer one from the Voice Library and set its id.
  const voice =
    (lang === "fr" && process.env.ELEVENLABS_VOICE_ID_FR) || process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      previous_text: previous,
      next_text: next,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function azure({ text, lang }: SpeakRequest) {
  // en-NG-AbeoNeural: a Nigerian English male voice. fr-FR-HenriNeural: a French male voice.
  const voice = lang === "fr" ? process.env.AZURE_VOICE_FR || "fr-FR-HenriNeural" : process.env.AZURE_VOICE_EN || "en-NG-AbeoNeural";
  const locale = voice.split("-").slice(0, 2).join("-");
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voice}"><prosody rate="-6%">${xml(text).replace(/…/g, '<break time="450ms"/>')}</prosody></voice></speak>`;
  return fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "selah",
    },
    body: ssml,
  });
}
