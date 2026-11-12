// Understands scripture references the way preachers SAY them, in live speech transcripts:
//   "turn with me to Romans chapter eight verse twenty eight"  -> Romans 8:28
//   "first Corinthians 13 verses 4 to 7"                        -> 1 Corinthians 13:4-7
//   "next verse" / "verse 29" / "go back to verse one"          -> relative to the current passage
//   "Jean chapitre 3 verset 16", "verset suivant"               -> French
// Deliberately strict: a book name must be followed by numbers, and a bare chapter needs the word
// "chapter" or a "turn to"-style lead-in, so everyday speech ("John said", "I was 16") doesn't fire.
import { BOOKS } from "../bible/books.generated";

export interface SpokenRef {
  book: number;
  chapter: number;
  start: number; // verse
  end: number;
}

export type Detection =
  | { kind: "ref"; ref: SpokenRef; sig: string } // explicit reference with a verse
  | { kind: "chapter"; ref: SpokenRef; sig: string } // "turn to Psalm 23"
  | { kind: "relative"; ref: SpokenRef; sig: string }; // next / previous / verse N

// ---------- number words -> digits ----------
const EN_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const FR_UNITS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const FR_TENS: Record<string, number> = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

function wordValue(w: string): { v: number; kind: "unit" | "ten" | "hundred" } | null {
  if (w in EN_UNITS) return { v: EN_UNITS[w], kind: "unit" };
  if (w in FR_UNITS) return { v: FR_UNITS[w], kind: "unit" };
  if (w in EN_TENS) return { v: EN_TENS[w], kind: "ten" };
  if (w in FR_TENS) return { v: FR_TENS[w], kind: "ten" };
  if (w === "hundred" || w === "cent" || w === "cents") return { v: 100, kind: "hundred" };
  return null;
}

/** Turns runs of number words ("one hundred and nineteen", "vingt huit") into digit tokens. */
function numbersToDigits(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const first = wordValue(tokens[i]);
    if (!first) {
      out.push(tokens[i++]);
      continue;
    }
    let total = 0;
    let current = 0;
    let j = i;
    let lastKind: string | null = null;
    while (j < tokens.length) {
      const t = tokens[j];
      if ((t === "and" || t === "et") && lastKind && wordValue(tokens[j + 1] ?? "")) {
        j++;
        continue;
      }
      const w = wordValue(t);
      if (!w) break;
      if (w.kind === "hundred") {
        current = (current || 1) * 100;
        total += current;
        current = 0;
      } else if (w.kind === "ten") {
        if (lastKind === "unit" && current === 4 && w.v === 20) current = 80; // quatre-vingt
        else if (lastKind === "ten" || lastKind === "unit") break; // "twenty thirty": separate numbers
        else current += w.v;
      } else {
        const frenchTeen = current % 100 === 10 && w.v < 10; // dix-sept, soixante-dix-huit
        if (lastKind === "unit" && !(current === 80 || current === 60) && !frenchTeen) break; // "eight twenty": separate
        current += w.v;
      }
      lastKind = w.kind;
      j++;
    }
    out.push(String(total + current));
    i = j;
  }
  return out;
}

// ---------- book names ----------
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const key = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");

// Spoken book names: the full English and French names, plus how people say them out loud.
const SPOKEN = new Map<string, number>();
BOOKS.forEach((b, i) => {
  SPOKEN.set(key(b.name), i);
  SPOKEN.set(key(b.fr), i);
});
const idx = (name: string) => BOOKS.findIndex((b) => b.name === name);
const EXTRA: Record<string, string> = {
  psalm: "Psalms", psaume: "Psalms", revelations: "Revelation", songofsongs: "Song of Solomon", songs: "Song of Solomon",
  canticle: "Song of Solomon", ecclesiastics: "Ecclesiastes", apocalypse: "Revelation", actsoftheapostles: "Acts",
  philippiens: "Philippians", hebreux: "Hebrews", proverb: "Proverbs", lamentation: "Lamentations", deuteronomie: "Deuteronomy",
  // How live transcription mishears "Psalm(s)"
  sam: "Psalms", sams: "Psalms", salm: "Psalms", salms: "Psalms", psalme: "Psalms", palm: "Psalms", palms: "Psalms",
  some: "Psalms", saum: "Psalms", psaumes: "Psalms",
};
for (const [k, name] of Object.entries(EXTRA)) SPOKEN.set(k, idx(name));
const ORDINAL: Record<string, string> = {
  "1": "1", first: "1", one: "1", i: "1", "1st": "1", premier: "1", premiere: "1", "1er": "1", "1re": "1",
  "2": "2", second: "2", two: "2", ii: "2", "2nd": "2", deuxieme: "2", seconde: "2", "2e": "2", "2eme": "2",
  "3": "3", third: "3", three: "3", iii: "3", "3rd": "3", troisieme: "3", "3e": "3", "3eme": "3",
};

// Book names that are also everyday words, first names, or mishearings: a bare "<name> <number>" with no
// verse needs a lead-in ("turn to John 3") before it counts. Unmistakable names ("Psalms 91") don't.
const AMBIGUOUS = new Set([
  "john", "mark", "luke", "james", "jude", "job", "acts", "numbers", "ruth", "amos", "daniel", "joel", "jonah", "micah",
  "esther", "titus", "kings", "judges", "samuel", "sam", "sams", "some", "palm", "palms", "salm", "salms", "saum",
  "jean", "marc", "luc", "actes", "nombres", "juges", "rois", "jacques", "pierre", "jonas", "michee", "tite", "exodus",
  "genesis", "proverbs", "revelation", "lamentations", "chronicles",
]);

/** Tries to read a book name starting at token i. Returns the book and how many tokens it used. */
function readBook(tokens: string[], i: number): { book: number; used: number; ambiguous: boolean } | null {
  for (let len = 4; len >= 1; len--) {
    const span = tokens.slice(i, i + len);
    if (span.length < len) continue;
    let k = key(span.join(""));
    const ord = ORDINAL[span[0]];
    if (ord && len > 1) k = ord + key(span.slice(1).join(""));
    // "the book of", "letter to the": tolerate a few connecting words inside multi-word names
    k = k.replace(/^(1|2|3)?(the)?(bookof|letterto|epistleto|lettreaux|epitreaux)?(the)?/, "$1");
    const book = SPOKEN.get(k);
    if (book !== undefined && book >= 0) return { book, used: len, ambiguous: AMBIGUOUS.has(k.replace(/^[123]/, "")) };
  }
  return null;
}

// ---------- tokenizing ----------
function tokenize(text: string): string[] {
  const t = fold(text)
    .replace(/(\d+)\s*:\s*(\d+)/g, "$1 verse $2") // "8:28" -> "8 verse 28"
    .replace(/(\d+)\s*[-–]\s*(\d+)/g, "$1 to $2")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ");
  return numbersToDigits(t.split(/\s+/).filter(Boolean));
}

const isNum = (t?: string) => t !== undefined && /^\d{1,3}$/.test(t);

/**
 * Live transcription often fuses chapter and verse: "John 316", "Romans 828", "Isaiah 4031".
 * Splits such a number into a chapter and verse that exist in the book. With two valid splits of a
 * three-digit number ("John 114": 1:14 or 11:4), the one-digit chapter wins (that's how it's usually said).
 */
function splitFused(book: number, digits: string): { chapter: number; verse: number } | null {
  if (!/^\d{3,5}$/.test(digits)) return null;
  const options: { chapter: number; verse: number }[] = [];
  for (let p = 1; p < digits.length; p++) {
    const vs = digits.slice(p);
    if (vs.startsWith("0")) continue;
    const chapter = Number(digits.slice(0, p));
    const verse = Number(vs);
    if (verse >= 1 && verse <= versesIn(book, chapter)) options.push({ chapter, verse });
  }
  return options[0] ?? null;
}
const VERSE_WORDS = new Set(["verse", "verses", "v", "vs", "verset", "versets"]);
const CHAPTER_WORDS = new Set(["chapter", "chapters", "chapitre", "chapitres", "chap"]);
const RANGE_WORDS = new Set(["to", "through", "thru", "till", "until", "a", "au", "jusqu", "and", "et"]);
const LEAD_INS = new Set([
  "turn", "open", "read", "reading", "go", "look", "find", "see", "in", "from", "to", "bible", "bibles",
  "tournez", "ouvrez", "lisons", "lisez", "dans", "allons", "bible", "bibles",
]);

const versesIn = (book: number, chapter: number) => BOOKS[book]?.chapters[chapter - 1] ?? 0;

function clampRef(book: number, chapter: number, start: number, end: number): SpokenRef | null {
  const count = versesIn(book, chapter);
  if (!count || start < 1 || start > count) return null;
  const e = Math.max(start, Math.min(end, count, start + 11));
  return { book, chapter, start, end: e };
}

/**
 * Finds references in a piece of transcript. `ctx` is the passage on screen, used for "next verse",
 * "verse 29" and "chapter 9". Signatures (`sig`) let callers ignore repeats as interim text grows.
 */
export function detect(text: string, ctx: SpokenRef | null): Detection[] {
  const tokens = tokenize(text);
  const out: Detection[] = [];
  const counts = new Map<string, number>();
  const sig = (base: string) => {
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return `${base}#${n}`;
  };
  let current = ctx;
  let i = 0;

  while (i < tokens.length) {
    // 1. Explicit: [book] [chapter word]? C [verse word | nothing] V [to E]?
    const b = readBook(tokens, i);
    if (b) {
      let j = i + b.used;
      let sawChapterWord = false;
      if (CHAPTER_WORDS.has(tokens[j])) {
        sawChapterWord = true;
        j++;
      }
      // "Romans 828" -> 8:28 (only when the whole number isn't itself a chapter followed by a verse)
      const fusedRaw = tokens[j];
      if (fusedRaw && /^\d{3,5}$/.test(fusedRaw) && !(isNum(fusedRaw) && versesIn(b.book, Number(fusedRaw)) && (VERSE_WORDS.has(tokens[j + 1]) || isNum(tokens[j + 1])))) {
        const f = splitFused(b.book, fusedRaw);
        if (f) {
          let end = f.verse;
          let k = j + 1;
          if (RANGE_WORDS.has(tokens[k]) && isNum(tokens[k + 1]) && Number(tokens[k + 1]) > f.verse && Number(tokens[k + 1]) - f.verse <= 11) {
            end = Number(tokens[k + 1]);
            k += 2;
          }
          const ref = clampRef(b.book, f.chapter, f.verse, end);
          if (ref) {
            out.push({ kind: "ref", ref, sig: sig(`ref:${ref.book}:${ref.chapter}:${ref.start}-${ref.end}`) });
            current = ref;
            i = k;
            continue;
          }
        }
      }
      if (isNum(tokens[j])) {
        let chapter = Number(tokens[j]);
        j++;
        let start: number | null = null;
        let end: number | null = null;
        if (VERSE_WORDS.has(tokens[j]) && isNum(tokens[j + 1])) {
          start = Number(tokens[j + 1]);
          j += 2;
        } else if (isNum(tokens[j]) && !sawChapterWord) {
          start = Number(tokens[j]); // "John 3 16"
          j++;
        }
        if (start !== null && RANGE_WORDS.has(tokens[j]) && isNum(tokens[j + 1])) {
          // "to 7", but "and" only when followed by a nearby verse number ("verses 4 and 5")
          const e = Number(tokens[j + 1]);
          if (e > start && e - start <= 11) {
            end = e;
            j += 2;
          }
        }
        // Single-chapter books are cited by verse: "Jude 24"
        if (BOOKS[b.book].chapters.length === 1 && start === null && chapter > 1) {
          start = chapter;
          chapter = 1;
        }
        if (start !== null) {
          const ref = clampRef(b.book, chapter, start, end ?? start);
          if (ref) {
            out.push({ kind: "ref", ref, sig: sig(`ref:${ref.book}:${ref.chapter}:${ref.start}-${ref.end}`) });
            current = ref;
            i = j;
            continue;
          }
        } else {
          const leadIn = tokens.slice(Math.max(0, i - 5), i).some((t) => LEAD_INS.has(t));
          if ((sawChapterWord || leadIn || !b.ambiguous) && versesIn(b.book, chapter)) {
            const ref = { book: b.book, chapter, start: 1, end: 1 };
            out.push({ kind: "chapter", ref, sig: sig(`chapter:${b.book}:${chapter}`) });
            current = ref;
            i = j;
            continue;
          }
        }
      }
    }

    // 2. Relative to the passage on screen.
    if (current) {
      const t = tokens[i];
      const t2 = tokens[i + 1];
      const nextPhrase =
        ((t === "next" || t === "following") && (t2 === "verse" || t2 === "1")) ||
        (t === "read" && t2 === "on") ||
        ((t === "verset" || t === "versets") && (t2 === "suivant" || t2 === "suivants")) ||
        (t === "verse" && t2 === "suivant");
      const prevPhrase =
        ((t === "previous" || t === "last") && t2 === "verse") ||
        (t === "verse" && t2 === "before") ||
        (t === "verset" && (t2 === "precedent" || t2 === "precedents"));
      if (nextPhrase || prevPhrase) {
        const v = nextPhrase ? current.end + 1 : current.start - 1;
        const ref = clampRef(current.book, current.chapter, v, v);
        if (ref) {
          out.push({ kind: "relative", ref, sig: sig(nextPhrase ? "next" : "prev") });
          current = ref;
        }
        i += 2;
        continue;
      }
      // "verse 29", "verses 29 to 31", "verset 5" (same chapter)
      if (VERSE_WORDS.has(t) && isNum(t2) && t !== "v") {
        const start = Number(t2);
        let end = start;
        let j = i + 2;
        if (RANGE_WORDS.has(tokens[j]) && isNum(tokens[j + 1]) && Number(tokens[j + 1]) > start) {
          end = Number(tokens[j + 1]);
          j += 2;
        }
        const ref = clampRef(current.book, current.chapter, start, end);
        if (ref) {
          out.push({ kind: "relative", ref, sig: sig(`verse:${start}-${end}`) });
          current = ref;
          i = j;
          continue;
        }
      }
      // "chapter 9 verse 3" / "chapitre 9" (same book)
      if (CHAPTER_WORDS.has(t) && isNum(t2)) {
        const chapter = Number(t2);
        let j = i + 2;
        let start = 1;
        let explicitVerse = false;
        if (VERSE_WORDS.has(tokens[j]) && isNum(tokens[j + 1])) {
          start = Number(tokens[j + 1]);
          explicitVerse = true;
          j += 2;
        }
        const ref = clampRef(current.book, chapter, start, start);
        if (ref) {
          out.push({ kind: explicitVerse ? "relative" : "chapter", ref, sig: sig(`ch:${chapter}:${start}`) });
          current = ref;
          i = j;
          continue;
        }
      }
    }
    i++;
  }
  return out;
}
