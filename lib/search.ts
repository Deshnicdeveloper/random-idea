// Finds passages for a message: typed reference -> AI-suggested references (verified) -> keyword search.
import type { CrisisLevel, Lang, Passage, SearchResponse, TranslationId } from "./types";
import { passageFrom, passageFromString } from "./bible/data";
import { keywordSearch } from "./bible/keyword";
import { parseReference, referenceLang } from "./bible/reference";
import { detectLang, translationFor } from "./lang";
import { topicReferences } from "./bible/topics";
import { analyze } from "./ai/analyze";
import { describeError, hasCredentials } from "./ai/client";
import { crisisResources, looksUrgent } from "./safety";

const overlaps = (a: Passage, b: Passage) =>
  a.book === b.book && a.chapter === b.chapter && a.start <= b.end && b.start <= a.end;

function addUnique(list: Passage[], p: Passage | null, limit: number) {
  if (p && list.length < limit && !list.some((q) => overlaps(q, p))) list.push(p);
}

const NOTICES: Record<Lang, { noKey: string; fallback: string }> = {
  en: {
    noKey: "Add an Anthropic API key to get smarter matches. Showing keyword matches for now.",
    fallback: "Showing keyword matches instead.",
  },
  fr: {
    noKey: "Ajoutez une clé API Anthropic pour de meilleurs résultats. Voici les correspondances par mots-clés.",
    fallback: "Voici les correspondances par mots-clés.",
  },
};

export async function findPassages(
  message: string,
  chosen: TranslationId,
  opts: { limit?: number } = {},
): Promise<SearchResponse> {
  const limit = opts.limit ?? 6;
  const text = message.trim().slice(0, 2000);

  // 1. A typed reference ("Psalm 23", "Jean 3:16") needs no AI at all.
  const ref = parseReference(text);
  if (ref) {
    const refLang = referenceLang(text);
    const t = refLang ? translationFor(refLang, chosen) : chosen;
    const p = passageFrom(ref, t);
    if (p) return { lang: refLang ?? "en", translation: t, crisis: "none", passages: [p], source: "reference" };
  }

  // French messages are answered from Louis Segond, English ones from the chosen English Bible.
  const lang = detectLang(text);
  const t = translationFor(lang, chosen);

  let crisis: CrisisLevel = looksUrgent(text) ? "urgent" : "none";
  const passages: Passage[] = [];
  let source: SearchResponse["source"] = "keyword";
  let notice: string | undefined;
  let keywords: string[] = [];

  // 2. AI suggests references; each one is checked against the database.
  if (hasCredentials()) {
    try {
      const a = await analyze(text);
      if (a) {
        if (a.crisis === "urgent" || (a.crisis === "concern" && crisis === "none")) crisis = a.crisis;
        for (const s of a.passages) addUnique(passages, passageFromString(s.reference, t, s.reason), limit);
        keywords = a.keywords;
        if (passages.length) source = "ai";
      }
    } catch (err) {
      console.error("[search] analyze failed:", err);
      notice = `${describeError(err)} ${NOTICES[lang].fallback}`;
    }
  } else {
    notice = NOTICES[lang].noKey;
  }

  if (crisis === "urgent") {
    return { lang, translation: t, crisis, resources: crisisResources(t), passages: [], source, notice };
  }

  // 3. Without AI results: a verse that contains every word typed is almost certainly the one they
  //    remember; otherwise use the hand-picked passages for any feelings mentioned.
  if (!passages.length) {
    const [best] = keywordSearch(text, { limit: 1 });
    if (best && best.terms >= 3 && best.coverage === 1) {
      addUnique(passages, passageFrom({ book: best.book, chapter: best.chapter, start: best.verse, end: best.verse }, t), limit);
    }
    for (const r of topicReferences(text).slice(0, Math.max(1, limit - 2))) addUnique(passages, passageFromString(r, t), limit);
  }

  // 4. Keyword search fills any remaining slots (and catches half-remembered wording).
  if (passages.length < limit) {
    const q = keywords.length ? `${keywords.join(" ")} ${text}` : text;
    for (const h of keywordSearch(q, { limit: 20, expand: !keywords.length })) {
      addUnique(passages, passageFrom({ book: h.book, chapter: h.chapter, start: h.verse, end: h.verse }, t), limit);
    }
  }

  return {
    lang,
    translation: t,
    crisis,
    resources: crisis === "concern" ? crisisResources(t) : undefined,
    passages,
    source,
    notice,
  };
}
