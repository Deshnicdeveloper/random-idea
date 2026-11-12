import type { StyleId, TranslationId } from "./types";
import { STYLES, TRANSLATIONS } from "./types";

export const asTranslation = (v: unknown): TranslationId =>
  typeof v === "string" && v in TRANSLATIONS ? (v as TranslationId) : "KJV";

export const asStyle = (v: unknown): StyleId =>
  typeof v === "string" && v in STYLES ? (v as StyleId) : "deep";

export const asMessage = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= 2 && s.length <= 2000 ? s : null;
};
