// Types shared by the server (API routes) and the browser (UI).

export type TranslationId = "KJV" | "BSB" | "LSG";
export type Lang = "en" | "fr";
export type Mode = "preacher" | "scripture";
export type StyleId = "deep" | "restoration" | "purpose" | "gentle";
export type CrisisLevel = "none" | "concern" | "urgent";

export const TRANSLATIONS: Record<TranslationId, { id: TranslationId; name: string; lang: Lang }> = {
  KJV: { id: "KJV", name: "King James Version", lang: "en" },
  BSB: { id: "BSB", name: "Berean Standard Bible", lang: "en" },
  LSG: { id: "LSG", name: "Louis Segond 1910", lang: "fr" },
};

export const STYLES: Record<StyleId, { id: StyleId; label: string; blurb: string }> = {
  deep: { id: "deep", label: "Deep & Revelatory", blurb: "Original words, hidden principles, layered insight" },
  restoration: { id: "restoration", label: "Restoration", blurb: "Raw honesty, then the strength to get up again" },
  purpose: { id: "purpose", label: "Purpose & Kingdom", blurb: "Design, potential, and how God's principles work" },
  gentle: { id: "gentle", label: "Gentle & Hopeful", blurb: "Warm, simple encouragement for a hard day" },
};

/** A contiguous run of verses inside one chapter, with text taken straight from the database. */
export interface Passage {
  key: string; // e.g. "43:3:16-17"
  reference: string; // e.g. "John 3:16–17"
  translation: TranslationId;
  book: number; // 0-based index into BOOKS
  chapter: number;
  start: number;
  end: number;
  verses: { verse: number; text: string; fromTranslation?: TranslationId }[];
  reason?: string; // short AI note on why this passage fits (never verse text)
}

export interface CrisisResources {
  message: string;
  lines: { label: string; detail: string; href?: string }[];
  passage?: Passage;
}

export interface SearchResponse {
  lang: Lang;
  translation: TranslationId; // the translation actually used (French messages get Louis Segond)
  crisis: CrisisLevel;
  resources?: CrisisResources;
  passages: Passage[];
  source: "reference" | "ai" | "keyword";
  notice?: string;
}

/** Events streamed (as newline-delimited JSON) from /api/teach. */
export type TeachEvent =
  | { type: "passages"; anchor: Passage; supporting: Passage[]; crisis: CrisisLevel; resources?: CrisisResources; lang: Lang; translation: TranslationId }
  | { type: "crisis"; resources: CrisisResources }
  | { type: "title"; title: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };
