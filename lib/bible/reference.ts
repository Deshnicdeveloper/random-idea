// Parses human-typed Bible references ("Ps 23", "1 cor 13:4-7", "John 3 16", "Jean 3.16", "Ésaïe 41:10")
// and finds them inside text. English and French book names both work.
// Pure and dependency-free so it runs on both server and client.
import { BOOKS } from "./books.generated";
import type { Lang } from "../types";

export interface ParsedRef {
  book: number; // 0-based
  chapter: number;
  start?: number;
  end?: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/^(premier|premiere|1er|1re)\s*/, "1")
    .replace(/^(deuxieme|2e|2eme|second|seconde)\s*/, "2")
    .replace(/^(troisieme|3e|3eme)\s*/, "3")
    .replace(/^(first|1st)\s*/, "1")
    .replace(/^(second|2nd)\s*/, "2")
    .replace(/^(third|3rd)\s*/, "3")
    .replace(/^iii\s+/, "3")
    .replace(/^ii\s+/, "2")
    .replace(/^i\s+/, "1")
    .replace(/\s+/g, "");

const FULL = BOOKS.map((b) => norm(b.name));
const FULL_FR = BOOKS.map((b) => norm(b.fr));
const NAMES = [...FULL.map((f, i) => [f, i] as const), ...FULL_FR.map((f, i) => [f, i] as const)];

// Abbreviations that a prefix match can't resolve (or resolves wrongly).
const ALIASES: Record<string, string> = {
  ps: "psalms", psa: "psalms", psalm: "psalms", pss: "psalms", psm: "psalms",
  jn: "john", jhn: "john", mt: "matthew", mat: "matthew", mk: "mark", mrk: "mark",
  lk: "luke", luk: "luke", phil: "philippians", php: "philippians", phl: "philippians",
  phm: "philemon", philem: "philemon", jas: "james", jm: "james",
  song: "songofsolomon", sos: "songofsolomon", sng: "songofsolomon", songofsongs: "songofsolomon",
  canticles: "songofsolomon", eccl: "ecclesiastes", ecc: "ecclesiastes", qoh: "ecclesiastes",
  ezk: "ezekiel", jdg: "judges", jg: "judges", judg: "judges", nm: "numbers", dt: "deuteronomy",
  rv: "revelation", re: "revelation", revelations: "revelation", jud: "jude", jdt: "jude",
  hab: "habakkuk", zeph: "zephaniah", zep: "zephaniah", hag: "haggai", zech: "zechariah",
  zec: "zechariah", mal: "malachi", jl: "joel", am: "amos", ob: "obadiah", jon: "jonah",
  mic: "micah", na: "nahum", nah: "nahum", hos: "hosea", lam: "lamentations", dan: "daniel",
  jos: "joshua", josh: "joshua", ru: "ruth", est: "esther", esth: "esther", jb: "job",
  pr: "proverbs", prv: "proverbs", prov: "proverbs", is: "isaiah", isa: "isaiah",
  jer: "jeremiah", ez: "ezekiel", gn: "genesis", ex: "exodus", lv: "leviticus",
  ro: "romans", rom: "romans", rm: "romans", gal: "galatians", ga: "galatians",
  eph: "ephesians", col: "colossians", ti: "titus", tit: "titus", heb: "hebrews",
  ac: "acts", act: "acts",
  // numbered-book short forms (the number is re-attached below)
  sam: "samuel", sa: "samuel", sm: "samuel", ki: "kings", kgs: "kings", kin: "kings",
  chr: "chronicles", ch: "chronicles", chron: "chronicles", cor: "corinthians", co: "corinthians",
  th: "thessalonians", thes: "thessalonians", thess: "thessalonians", ts: "thessalonians",
  tim: "timothy", tm: "timothy", pet: "peter", pe: "peter", pt: "peter", jo: "john", joh: "john",
  // French
  psaume: "psalms", psaumes: "psalms", ap: "revelation", apoc: "revelation", cant: "songofsolomon",
  ct: "songofsolomon", qo: "ecclesiastes", eccle: "ecclesiastes", es: "isaiah", esaie: "isaiah",
  jr: "jeremiah", os: "hosea", abd: "obadiah", mi: "micah",
  so: "zephaniah", ag: "haggai", za: "zechariah", jc: "james", jac: "james", rs: "kings", rois: "kings",
  r: "kings", chroniques: "chronicles", corinthiens: "corinthians",
  thessaloniciens: "thessalonians", timothee: "timothy", pi: "peter", pierre: "peter", jean: "john",
  ph: "philippians", phi: "philippians", he: "hebrews", hb: "hebrews",
  ep: "ephesians", mc: "mark", lc: "luke",
};

export function findBook(raw: string): number {
  const key = norm(raw);
  if (!key) return -1;
  const exact = NAMES.find(([f]) => f === key);
  if (exact) return exact[1];
  const num = /^[1-3]/.test(key) ? key[0] : "";
  const rest = num ? key.slice(1) : key;
  const alias = ALIASES[rest];
  if (alias) {
    const i = FULL.indexOf(num + alias);
    if (i >= 0) return i;
  }
  if (rest.length >= 2) {
    const hits = new Set(NAMES.filter(([f]) => f.startsWith(key)).map(([, i]) => i));
    if (hits.size === 1) return [...hits][0];
  }
  return -1;
}

const REF_RE =
  /^\s*((?:[1-3]|i{1,3}|first|second|third|1st|2nd|3rd|1er|1re|premier|premi[eè]re)?\s*\p{L}[\p{L} .']*?)\s*(\d{1,3})(?:\s*[:., v]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?\s*$/iu;

/** Parses a whole string as a single reference, or returns null. */
export function parseReference(input: string): ParsedRef | null {
  const m = REF_RE.exec(input.replace(/[“”"]/g, ""));
  if (!m) return null;
  const book = findBook(m[1]);
  if (book < 0) return null;
  let chapter = Number(m[2]);
  const counts = BOOKS[book].chapters;
  // Single-chapter books are cited by verse alone: "Jude 24" means Jude 1:24.
  if (counts.length === 1 && !m[3] && chapter > 1) {
    m[4] = undefined as unknown as string;
    m[3] = String(chapter);
    chapter = 1;
  }
  if (chapter < 1 || chapter > counts.length) return null;
  if (!m[3]) return { book, chapter };
  const start = Number(m[3]);
  const max = counts[chapter - 1];
  if (start < 1 || start > max) return null;
  let end = m[4] ? Number(m[4]) : start;
  if (end < start) end = start;
  return { book, chapter, start, end: Math.min(end, max) };
}

export function bookName(book: number, lang: Lang = "en"): string {
  if (lang === "fr") return BOOKS[book].fr === "Psaumes" ? "Psaume" : BOOKS[book].fr;
  return BOOKS[book].name === "Psalms" ? "Psalm" : BOOKS[book].name;
}

export function formatReference(r: ParsedRef, lang: Lang = "en"): string {
  const name = bookName(r.book, lang);
  if (!r.start) return `${name} ${r.chapter}`;
  return r.end && r.end !== r.start
    ? `${name} ${r.chapter}:${r.start}–${r.end}`
    : `${name} ${r.chapter}:${r.start}`;
}

export interface FoundRef extends ParsedRef {
  index: number;
  length: number;
  text: string;
}

const INLINE_RE =
  /(?<![\p{L}\d])((?:[1-3]\s?)?\p{Lu}\p{Ll}+(?:\s+(?:of\s+|des\s+)?\p{L}\p{Ll}+)?)\.?\s+(\d{1,3})[:.](\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/gu;

/** Finds references like "Genesis 50:20" or "1 Peter 5:7" inside running text. */
export function findReferences(text: string): FoundRef[] {
  const out: FoundRef[] = [];
  for (const m of text.matchAll(INLINE_RE)) {
    const tail = `${m[2]}:${m[3]}${m[4] ? `-${m[4]}` : ""}`;
    let bookText = m[1];
    let parsed = parseReference(`${bookText} ${tail}`);
    // "In Romans 8:28" -> retry without the leading word
    if (!parsed && /\s/.test(bookText)) {
      bookText = bookText.replace(/^\S+\s+/, "");
      parsed = parseReference(`${bookText} ${tail}`);
    }
    if (!parsed) continue;
    const offset = m[0].lastIndexOf(bookText);
    out.push({ ...parsed, index: m.index! + offset, length: m[0].length - offset, text: m[0].slice(offset) });
  }
  return out;
}

/** "Jean 3:16" or "Psaume 23" is French; "John 3:16" English; names spelled the same in both return null. */
export function referenceLang(input: string): Lang | null {
  const m = REF_RE.exec(input);
  if (!m) return null;
  const key = norm(m[1]);
  const fr = FULL_FR.some((f, i) => f.startsWith(key) && f !== FULL[i]) || ["psaume", "psaumes"].includes(key);
  const en = FULL.some((f, i) => f.startsWith(key) && f !== FULL_FR[i]);
  return fr && !en ? "fr" : en && !fr ? "en" : null;
}
