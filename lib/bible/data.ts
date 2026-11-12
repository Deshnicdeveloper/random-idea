// Server-only access to the Bible text. Verse text ALWAYS comes from here, never from a model.
import fs from "node:fs";
import path from "node:path";
import type { Passage, TranslationId } from "../types";
import { TRANSLATIONS } from "../types";
import { BOOKS } from "./books.generated";
import { formatReference, parseReference, type ParsedRef } from "./reference";

type Text = Record<TranslationId, string[][][]>; // [book][chapter-1][verse-1]

const g = globalThis as unknown as { __bibleText?: Text };

export function bibleText(): Text {
  if (!g.__bibleText) {
    const file = path.join(process.cwd(), "data", "bible.json");
    g.__bibleText = (JSON.parse(fs.readFileSync(file, "utf8")) as { text: Text }).text;
  }
  return g.__bibleText;
}

export function verseText(t: TranslationId, book: number, chapter: number, verse: number): string {
  return bibleText()[t][book]?.[chapter - 1]?.[verse - 1] ?? "";
}

const MAX_RANGE = 12;
const MAX_CHAPTER = 40;

/** Builds a passage from a parsed reference. Whole chapters are capped so cards stay readable. */
export function passageFrom(ref: ParsedRef, t: TranslationId, reason?: string): Passage | null {
  const count = BOOKS[ref.book]?.chapters[ref.chapter - 1];
  if (!count) return null;
  const start = ref.start ?? 1;
  const cap = ref.start ? MAX_RANGE : MAX_CHAPTER;
  const end = Math.min(ref.end ?? (ref.start ? start : count), count, start + cap - 1);
  const other: TranslationId = t === "KJV" ? "BSB" : "KJV"; // only BSB has gaps, so KJV backs it up
  const verses: Passage["verses"] = [];
  for (let v = start; v <= end; v++) {
    const text = verseText(t, ref.book, ref.chapter, v);
    if (text) verses.push({ verse: v, text });
    else {
      // e.g. BSB omits a few verses that aren't in its source manuscripts
      const alt = verseText(other, ref.book, ref.chapter, v);
      if (alt) verses.push({ verse: v, text: alt, fromTranslation: other });
    }
  }
  if (!verses.length) return null;
  const shown = { book: ref.book, chapter: ref.chapter, start, end };
  const isWholeChapter = !ref.start && end === count;
  const lang = TRANSLATIONS[t].lang;
  return {
    key: `${ref.book}:${ref.chapter}:${start}-${end}`,
    reference: isWholeChapter ? formatReference({ book: ref.book, chapter: ref.chapter }, lang) : formatReference(shown, lang),
    translation: t,
    book: ref.book,
    chapter: ref.chapter,
    start,
    end,
    verses,
    reason,
  };
}

export function passageFromString(s: string, t: TranslationId, reason?: string): Passage | null {
  const ref = parseReference(s);
  return ref ? passageFrom(ref, t, reason) : null;
}

/** Plain text of a passage, for prompts and read-aloud. */
export function passageText(p: Passage): string {
  return p.verses.map((v) => v.text).join(" ");
}
