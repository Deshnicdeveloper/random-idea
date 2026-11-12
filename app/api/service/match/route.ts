// Live service: recognises a verse quoted aloud without a reference.
// 1. Exact words (fast, free): enough of the verse's own word pairs were spoken.
// 2. If that finds nothing, a quick AI check for paraphrases and half-quotes, verified against the database.
import type { TranslationId } from "@/lib/types";
import { keywordSearch, quoteMatch } from "@/lib/bible/keyword";
import { passageFrom, passageFromString, passageText } from "@/lib/bible/data";
import { formatReference } from "@/lib/bible/reference";
import { identifyVerse } from "@/lib/ai/identify";
import { hasCredentials } from "@/lib/ai/client";
import { asTranslation } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const speech = typeof body.speech === "string" ? body.speech.slice(-600) : "";
  const t: TranslationId = asTranslation(body.translation);
  if (!speech) return Response.json({ match: null });

  // The verse already on screen (sent as "book:chapter:start-end") doesn't count as a new match.
  const onScreen = typeof body.exclude === "string" ? body.exclude : null;
  const isOnScreen = (p: { key: string } | null) => Boolean(p && onScreen && p.key === onScreen);

  const m = quoteMatch(speech);
  if (m) {
    const passage = passageFrom({ book: m.book, chapter: m.chapter, start: m.verse, end: m.verse }, t);
    if (passage && !isOnScreen(passage)) return Response.json({ match: { passage, via: "words" } });
  }

  // Paraphrases: only for a real stretch of speech, and only when the AI is available.
  const lastWords = speech.split(/\s+/).slice(-30).join(" ");
  if (body.ai === false || !hasCredentials() || lastWords.split(" ").length < 6) return Response.json({ match: null });
  try {
    const candidates = keywordSearch(lastWords, { limit: 6 })
      .map((h) => passageFrom({ book: h.book, chapter: h.chapter, start: h.verse, end: h.verse }, "KJV"))
      .filter((p) => p !== null)
      .map((p) => `${formatReference({ book: p.book, chapter: p.chapter, start: p.start, end: p.end })}: ${passageText(p)}`);
    const ref = await identifyVerse(speech.split(/\s+/).slice(-60).join(" "), candidates);
    const passage = ref ? passageFromString(ref, t) : null;
    return Response.json({ match: passage && !isOnScreen(passage) ? { passage, via: "ai" } : null });
  } catch (err) {
    console.error("[service/match] identify failed:", err);
    return Response.json({ match: null });
  }
}
