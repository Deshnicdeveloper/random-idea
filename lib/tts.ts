// Natural voice. Choose with TTS_PROVIDER in .env.local (kokoro | elevenlabs | azure | browser).
// Without TTS_PROVIDER, ElevenLabs or Azure is used when its key is set, else the browser voice.
//   kokoro:     free, open source, runs in voice-service/ (npm run voice). KOKORO_URL, KOKORO_VOICE_EN/FR
//   elevenlabs: ELEVENLABS_API_KEY (+ ELEVENLABS_VOICE_ID, ELEVENLABS_VOICE_ID_FR, ELEVENLABS_MODEL)
//   azure:      AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (+ AZURE_VOICE_EN, AZURE_VOICE_FR)
//
// Each text is turned into ONE mp3 and saved to .cache/audio/, so playing it again never
// calls the voice service (or spends credits) a second time.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Lang } from "./types";
import { splitPieces } from "./speech-pieces";

export type TtsProvider = "kokoro" | "elevenlabs" | "azure";

export function ttsProvider(): TtsProvider | null {
  const chosen = process.env.TTS_PROVIDER?.toLowerCase();
  if (chosen === "browser") return null;
  if (chosen === "kokoro") return "kokoro";
  if (chosen === "elevenlabs") return process.env.ELEVENLABS_API_KEY ? "elevenlabs" : null;
  if (chosen === "azure") return process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION ? "azure" : null;
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure";
  return null;
}

/** Providers with no per-character cost: audio can be recorded before anyone presses Play. */
export const isFreeProvider = (p: TtsProvider | null) => p === "kokoro";

const elevenVoice = (lang: Lang) =>
  (lang === "fr" && process.env.ELEVENLABS_VOICE_ID_FR) || process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const elevenModel = () => process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const kokoroUrl = () => (process.env.KOKORO_URL || "http://127.0.0.1:8880").replace(/\/$/, "");
const kokoroVoice = (lang: Lang) =>
  lang === "fr" ? process.env.KOKORO_VOICE_FR || "ff_siwis" : process.env.KOKORO_VOICE_EN || "am_michael";
const kokoroSpeed = () => Number(process.env.KOKORO_SPEED || "0.92");
const azureVoice = (lang: Lang) =>
  lang === "fr" ? process.env.AZURE_VOICE_FR || "fr-FR-HenriNeural" : process.env.AZURE_VOICE_EN || "en-NG-AbeoNeural";

// 64 kbps mono keeps a two-minute word around 1 MB on mobile data.
const ELEVEN_FORMAT = "mp3_44100_64";
const AZURE_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

interface Piece {
  text: string;
  lang: Lang;
  previous?: string; // neighbouring text keeps intonation smooth across pieces
  next?: string;
}

async function elevenlabs({ text, lang, previous, next }: Piece): Promise<Buffer> {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elevenVoice(lang))}?output_format=${ELEVEN_FORMAT}`,
    {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: elevenModel(),
        previous_text: previous,
        next_text: next,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
    },
  );
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function kokoro({ text, lang }: Piece, pauseAfter: boolean): Promise<Buffer> {
  let r: Response;
  try {
    r = await fetch(`${kokoroUrl()}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: kokoroVoice(lang),
        lang: lang === "fr" ? "fr-fr" : process.env.KOKORO_LANG_EN || "en-us",
        speed: kokoroSpeed(),
        pause_after: pauseAfter,
      }),
    });
  } catch {
    throw new Error("The Kokoro voice service isn't running. Start it with: npm run voice");
  }
  if (!r.ok) throw new Error(`Kokoro ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function azure({ text, lang }: Piece): Promise<Buffer> {
  // en-NG-AbeoNeural: a Nigerian English male voice. fr-FR-HenriNeural: a French male voice.
  const voice = azureVoice(lang);
  const locale = voice.split("-").slice(0, 2).join("-");
  const body = xml(text).replace(/…/g, '<break time="450ms"/>').replace(/\n\s*\n/g, '<break time="700ms"/>');
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${voice}"><prosody rate="-6%">${body}</prosody></voice></speak>`;
  const r = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": AZURE_FORMAT,
      "User-Agent": "selah",
    },
    body: ssml,
  });
  if (!r.ok) throw new Error(`Azure ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Removes a leading ID3v2 tag so mp3 pieces can be joined into one stream. */
function stripId3(b: Buffer): Buffer {
  if (b.length > 10 && b.toString("latin1", 0, 3) === "ID3") {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    return b.subarray(10 + size + (b[5] & 0x10 ? 10 : 0));
  }
  return b;
}

/** Text around a piece when the browser records a long text piece by piece. */
export interface SpeechContext {
  previous?: string;
  next?: string;
}

async function render(text: string, lang: Lang, ctx: SpeechContext): Promise<Buffer> {
  const provider = ttsProvider();
  if (provider === "azure") return azure({ text, lang }); // Azure takes ten minutes of text in one call
  if (provider === "kokoro") {
    // One piece at a time (the service handles one at a time anyway), with a pause after each piece
    // that has text following it, including text the browser will request next.
    const parts = splitPieces(text, 700);
    const out: Buffer[] = [];
    for (let i = 0; i < parts.length; i++) out.push(await kokoro({ text: parts[i], lang }, i < parts.length - 1 || Boolean(ctx.next)));
    return Buffer.concat(out);
  }
  if (provider !== "elevenlabs") throw new Error("No voice provider configured");
  const parts = splitPieces(text, 1000);
  const out: Buffer[] = new Array(parts.length);
  // Two at a time: fast, and within ElevenLabs' concurrency limits on small plans.
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const i = next++;
      const before = i > 0 ? parts[i - 1].slice(-400) : ctx.previous?.slice(-400);
      const after = i + 1 < parts.length ? parts[i + 1].slice(0, 400) : ctx.next?.slice(0, 400);
      out[i] = await elevenlabs({ text: parts[i], lang, previous: before, next: after });
    }
  };
  await Promise.all([worker(), worker()]);
  return Buffer.concat(out.map((b, i) => (i === 0 ? b : stripId3(b))));
}

const CACHE_DIR = path.join(process.cwd(), ".cache", "audio");
const g = globalThis as unknown as { __ttsInflight?: Map<string, Promise<Buffer>> };
const inflight = (g.__ttsInflight ??= new Map());

function cacheKey(text: string, lang: Lang, ctx: SpeechContext): string {
  const provider = ttsProvider();
  // Neighbouring text changes the recording (intonation for ElevenLabs, a trailing pause for Kokoro).
  const around =
    provider === "elevenlabs" ? `${ctx.previous?.slice(-400) ?? ""}|${ctx.next?.slice(0, 400) ?? ""}` : provider === "kokoro" ? String(Boolean(ctx.next)) : "";
  const voice =
    provider === "elevenlabs"
      ? `${elevenVoice(lang)}|${elevenModel()}|${ELEVEN_FORMAT}`
      : provider === "kokoro"
        ? `${kokoroVoice(lang)}|${kokoroSpeed()}|v1.0`
        : `${azureVoice(lang)}|${AZURE_FORMAT}`;
  return crypto.createHash("sha256").update(`${provider}|${voice}|${lang}|${around}|${text}`).digest("hex");
}

/** Returns the mp3 for a text, generating it only the first time. */
export async function speechAudio(
  text: string,
  lang: Lang,
  ctx: SpeechContext = {},
): Promise<{ audio: Buffer; cached: boolean }> {
  const key = cacheKey(text, lang, ctx);
  const file = path.join(CACHE_DIR, `${key}.mp3`);
  try {
    return { audio: await fs.readFile(file), cached: true };
  } catch {}
  // Two taps at once share one generation instead of paying twice.
  let job = inflight.get(key);
  if (!job) {
    job = render(text, lang, ctx)
      .then(async (audio) => {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        await fs.writeFile(file, audio);
        return audio;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return { audio: await job, cached: false };
}
