// Conversation mode: streams the pastor's reply as newline-delimited JSON events.
import { runTalk, type TalkEvent, type TalkTurn } from "@/lib/ai/talk";
import { describeError, hasCredentials } from "@/lib/ai/client";
import { detectLang } from "@/lib/lang";
import { looksUrgent } from "@/lib/safety";
import { asTranslation } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const history: TalkTurn[] = (Array.isArray(body.history) ? body.history : [])
    .filter((m: TalkTurn) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-24)
    .map((m: TalkTurn) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  const last = history[history.length - 1];
  if (!last || last.role !== "user") return Response.json({ error: "Say something first." }, { status: 400 });
  if (!hasCredentials()) return Response.json({ error: "Conversation mode needs an Anthropic API key in .env.local." }, { status: 501 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: TalkEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {}
      };
      // Safety net that doesn't depend on the model: show help at once on clear danger words.
      if (looksUrgent(last.content)) send({ type: "crisis" });
      try {
        await runTalk({ history, lang: detectLang(last.content), translation: asTranslation(body.translation), emit: send, signal: req.signal });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("[talk]", err);
          send({ type: "error", message: describeError(err) });
        }
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
