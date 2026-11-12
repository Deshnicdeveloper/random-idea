// BM25 keyword search over every verse (KJV + BSB + Louis Segond wording indexed together, so
// "wings as eagles", "wings like eagles" and "ailes comme les aigles" all find Isaiah 40:31).
// Works with no API key.
import { BOOKS } from "./books.generated";
import { bibleText } from "./data";

const STOP = new Set(
  (
    "a an and are as at be been but by for from had has have he her him his i if in into is it its me my " +
    "of on or our she so that the their them then there they this to was we were what when which who will " +
    "with you your yours not no all also am do does did can could would should shall may might must than " +
    "unto thee thou thy thine ye hath hast doth art shalt wilt saith said upon even o oh let us out up " +
    "about just like really very feel feeling felt im ive dont cant something someone verse scripture bible " +
    "remember says where talks know think want how why " +
    // French
    "le la les un une des du de d l et ou mais donc car ni je j tu il elle nous vous ils elles on me m te t se s " +
    "mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ce cet cette ces qui que qu quoi dont " +
    "est sont suis es etre ai as avons avez ont avait etait sera fait faire a au aux en dans par pour sur avec " +
    "sans sous ne pas plus tres tout tous toute toutes comme si quand y lui leur meme aussi bien c n " +
    "verset parle souviens quelque chose sens"
  ).split(" "),
);

export function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && (w.endsWith("eth") || w.endsWith("est"))) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ly")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function tokenize(s: string): string[] {
  return fold(s)
    .replace(/[’']/g, " ")
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

// Feeling words rarely appear in scripture as-is; map them to words that do (used without AI).
const EXPAND: Record<string, string> = {
  anxious: "anxious careful worry afraid fear troubled peace", anxiety: "anxious careful worry fear peace",
  worried: "worry careful anxious troubled peace", stress: "weary heavy burden rest peace",
  lonely: "alone forsake leave comfort near", alone: "alone forsake leave near",
  tired: "weary faint rest strength", exhausted: "weary faint rest strength",
  sad: "sorrow mourn weep comfort joy", depressed: "sorrow downcast soul hope brokenhearted",
  scared: "fear afraid courage strong", afraid: "fear afraid courage strong",
  broke: "provide supply need want", money: "provide supply need riches", job: "work labour provide",
  sick: "heal sickness health", ill: "heal sickness", waiting: "wait patience season time",
  failed: "fall rise restore strength", failure: "fall rise restore strength",
  guilt: "forgive sin cleanse condemnation", ashamed: "shame ashamed forgive", shame: "shame ashamed",
  angry: "anger wrath", grief: "mourn comfort sorrow death", died: "death mourn comfort resurrection",
  exam: "wisdom understanding knowledge", exams: "wisdom understanding knowledge",
  battle: "fight battle", enemies: "enemies fight deliver", confused: "wisdom understanding way direct",
  rejected: "rejected despised chosen", hopeless: "hope", heartbroken: "brokenhearted heal",
};

const ARCHAIC: Record<string, string> = { thy: "your", thine: "your", thee: "you", thou: "you", ye: "you", hath: "has", art: "are", my: "your" };

function bigrams(s: string): Set<string> {
  const words = fold(s)
    .replace(/[’']/g, " ")
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((w) => ARCHAIC[w] ?? w);
  const out = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) out.add(`${words[i]} ${words[i + 1]}`);
  return out;
}

interface Index {
  postings: Map<string, Array<[number, number]>>;
  docLen: Float32Array;
  avgLen: number;
  loc: Int32Array; // flat id -> book*1e6 + chapter*1e3 + verse
}

const g = globalThis as unknown as { __bm25?: Index };

function buildIndex(): Index {
  const { KJV, BSB, LSG } = bibleText();
  const postings = new Map<string, Array<[number, number]>>();
  const lens: number[] = [];
  const locs: number[] = [];
  let id = 0;
  BOOKS.forEach((b, bi) =>
    b.chapters.forEach((n, ci) => {
      for (let v = 0; v < n; v++) {
        const toks = tokenize(`${KJV[bi][ci][v]} ${BSB[bi][ci][v]} ${LSG[bi][ci][v]}`);
        const tf = new Map<string, number>();
        for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
        for (const [t, f] of tf) {
          let list = postings.get(t);
          if (!list) postings.set(t, (list = []));
          list.push([id, f]);
        }
        lens.push(toks.length);
        locs.push(bi * 1e6 + (ci + 1) * 1e3 + (v + 1));
        id++;
      }
    }),
  );
  const docLen = Float32Array.from(lens);
  return { postings, docLen, avgLen: lens.reduce((a, n) => a + n, 0) / lens.length, loc: Int32Array.from(locs) };
}

function index(): Index {
  return (g.__bm25 ??= buildIndex());
}

export interface KeywordHit {
  book: number;
  chapter: number;
  verse: number;
  score: number;
  coverage: number; // share of distinct query terms found in the verse (0-1)
  terms: number;
}

export function keywordSearch(query: string, opts: { limit?: number; expand?: boolean } = {}): KeywordHit[] {
  const idx = index();
  const raw = fold(query);
  let terms = tokenize(raw);
  if (opts.expand) {
    const extra = raw.split(/[^a-z]+/).flatMap((w) => (EXPAND[w] ? tokenize(EXPAND[w]) : []));
    terms = terms.concat(extra);
  }
  const weights = new Map<string, number>();
  for (const t of terms) weights.set(t, (weights.get(t) ?? 0) + 1);
  if (!weights.size) return [];

  const N = idx.docLen.length;
  const k1 = 1.2;
  const b = 0.75;
  const scores = new Map<number, number>();
  const matched = new Map<number, number>();
  for (const [t, qw] of weights) {
    const list = idx.postings.get(t);
    if (!list) continue;
    const idf = Math.log(1 + (N - list.length + 0.5) / (list.length + 0.5));
    for (const [doc, f] of list) {
      const s = (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * idx.docLen[doc]) / idx.avgLen));
      scores.set(doc, (scores.get(doc) ?? 0) + s * Math.min(qw, 2));
      matched.set(doc, (matched.get(doc) ?? 0) + 1);
    }
  }
  // Reward verses that cover more of what was typed, not just one rare word.
  for (const [doc, s] of scores) scores.set(doc, s * (0.5 + (matched.get(doc)! / weights.size) ** 1.5));
  let ranked = [...scores.entries()].sort((a, b2) => b2[1] - a[1]);

  // Half-remembered quotes: re-rank the best candidates by shared word pairs in order
  // ("be still", "still and", "and know"...), which plain keyword scoring ignores.
  const qb = bigrams(raw);
  if (qb.size >= 2) {
    const text = bibleText();
    ranked = ranked
      .slice(0, 80)
      .map(([doc, s]): [number, number] => {
        const l = idx.loc[doc];
        const bi = Math.floor(l / 1e6), ci = Math.floor((l % 1e6) / 1e3) - 1, vi = (l % 1e3) - 1;
        const vb = bigrams(`${text.KJV[bi][ci][vi]} ${text.BSB[bi][ci][vi]} ${text.LSG[bi][ci][vi]}`);
        let hit = 0;
        for (const x of qb) if (vb.has(x)) hit++;
        return [doc, s * (1 + 3 * (hit / qb.size))];
      })
      .sort((a, b2) => b2[1] - a[1])
      .concat(ranked.slice(80));
  }

  return ranked
    .slice(0, opts.limit ?? 10)
    .map(([doc, score]) => {
      const l = idx.loc[doc];
      const coverage = matched.get(doc)! / weights.size;
      return { book: Math.floor(l / 1e6), chapter: Math.floor((l % 1e6) / 1e3), verse: l % 1e3, score, coverage, terms: weights.size };
    });
}
