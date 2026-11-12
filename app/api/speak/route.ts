import { synthesize, ttsProvider } from "@/lib/tts";

export const runtime = "nodejs";

/** Tells the browser whether a natural voice is configured. */
export async function GET() {
  return Response.json({ provider: ttsProvider() });
}

/** Turns one chunk of text (max ~1500 chars) into MP3 audio. */
export async function POST(req: Request) {
  if (!ttsProvider()) return Response.json({ error: "No voice provider configured" }, { status: 501 });
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 1500) return Response.json({ error: "Text must be 1 to 1500 characters" }, { status: 400 });
  const lang = body.lang === "fr" ? "fr" : "en";
  const clip = (v: unknown) => (typeof v === "string" ? v.slice(0, 400) : undefined);
  try {
    const r = await synthesize({ text, lang, previous: clip(body.previous), next: clip(body.next) });
    if (!r.ok || !r.body) {
      console.error("[speak] provider error", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return Response.json({ error: "Voice service error" }, { status: 502 });
    }
    return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[speak]", err);
    return Response.json({ error: "Voice service unavailable" }, { status: 502 });
  }
}
