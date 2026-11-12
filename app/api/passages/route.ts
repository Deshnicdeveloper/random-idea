// Re-reads passages in another translation (used when the reader switches Bibles).
import type { Passage } from "@/lib/types";
import { passageFrom } from "@/lib/bible/data";
import { asTranslation } from "@/lib/validate";

export const runtime = "nodejs";

interface Item {
  book: number;
  chapter: number;
  start: number;
  end: number;
  reason?: string;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const t = asTranslation(body.translation);
  const items: Item[] = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  const passages: (Passage | null)[] = items.map((i) =>
    Number.isInteger(i?.book) && Number.isInteger(i?.chapter) && Number.isInteger(i?.start) && Number.isInteger(i?.end)
      ? passageFrom({ book: i.book, chapter: i.chapter, start: i.start, end: i.end }, t, typeof i.reason === "string" ? i.reason : undefined)
      : null,
  );
  return Response.json({ passages });
}
