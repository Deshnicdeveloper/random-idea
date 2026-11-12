import type { TeachEvent } from "@/lib/types";
import { findPassages } from "@/lib/search";
import { streamTeaching } from "@/lib/ai/teach";
import { describeError, hasCredentials } from "@/lib/ai/client";
import { asMessage, asStyle, asTranslation } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = asMessage(body.message);
  if (!message) return Response.json({ error: "Write between 2 and 2000 characters." }, { status: 400 });
  const translation = asTranslation(body.translation);
  const style = asStyle(body.style);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: TeachEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const found = await findPassages(message, translation, { limit: 4 });
        if (found.crisis === "urgent" && found.resources) {
          send({ type: "crisis", resources: found.resources });
          return send({ type: "done" });
        }
        const [anchor, ...supporting] = found.passages;
        if (!anchor) return send({ type: "error", message: "I couldn't find a scripture for that. Try saying it another way." });
        send({ type: "passages", anchor, supporting, crisis: found.crisis, resources: found.resources, lang: found.lang, translation: found.translation });

        if (!hasCredentials()) {
          return send({ type: "error", message: "Preacher mode needs an Anthropic API key in .env.local. Here are the scriptures I found." });
        }

        const ai = streamTeaching({ message, style, lang: found.lang, anchor, supporting, signal: req.signal });
        let head = "";
        let titleDone = false;
        for await (const event of ai) {
          if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") continue;
          let chunk = event.delta.text;
          if (!titleDone) {
            head += chunk;
            const nl = head.indexOf("\n");
            if (nl < 0 && head.length < 120) continue;
            const firstLine = nl < 0 ? head : head.slice(0, nl);
            const m = /^\s*TITLE:\s*(.+)$/i.exec(firstLine);
            if (m) {
              send({ type: "title", title: m[1].trim().replace(/[*#"]/g, "") });
              chunk = nl < 0 ? "" : head.slice(nl + 1);
            } else chunk = head;
            titleDone = true;
            chunk = chunk.replace(/^\s+/, "");
          }
          if (chunk) send({ type: "delta", text: chunk });
        }
        if (!titleDone && head.trim()) send({ type: "delta", text: head.replace(/^\s*TITLE:.*$/im, "").trim() });
        const final = await ai.finalMessage();
        if (final.stop_reason === "refusal") {
          send({ type: "error", message: "I couldn't write a teaching for this one. The scriptures above still stand." });
        }
        send({ type: "done" });
      } catch (err) {
        if (req.signal.aborted) return;
        console.error("[teach]", err);
        send({ type: "error", message: describeError(err) });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
