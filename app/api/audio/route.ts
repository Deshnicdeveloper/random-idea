import { isFreeProvider, speechAudio, ttsProvider } from "@/lib/tts";

export const runtime = "nodejs";
export const maxDuration = 600; // Kokoro on a busy CPU can take minutes for a long teaching

/** Tells the browser whether a natural voice is configured. */
export async function GET() {
  const provider = ttsProvider();
  return Response.json({ provider, free: isFreeProvider(provider) });
}

/** Returns the mp3 for a text. Generated once, then served from the saved copy. */
export async function POST(req: Request) {
  if (!ttsProvider()) return Response.json({ error: "No voice provider configured" }, { status: 501 });
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 5000) return Response.json({ error: "Text must be 1 to 5000 characters" }, { status: 400 });
  const lang = body.lang === "fr" ? "fr" : "en";
  const around = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 400) : undefined);
  try {
    const { audio, cached } = await speechAudio(text, lang, { previous: around(body.previous), next: around(body.next) });
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Audio-Cache": cached ? "hit" : "miss" },
    });
  } catch (err) {
    console.error("[audio]", err);
    const message = err instanceof Error && err.message.includes("npm run voice") ? err.message : "The voice service couldn't record this right now.";
    return Response.json({ error: message }, { status: 502 });
  }
}
