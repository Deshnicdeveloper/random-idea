// Detects whether a message is French or English (the two languages the app serves today),
// and picks the Bible translation to answer with.
import type { Lang, TranslationId } from "./types";
import { TRANSLATIONS } from "./types";

const FR_WORDS = new Set(
  (
    "je j me m moi mon ma mes tu te toi ton ta tes il elle nous vous ils elles le la les un une des du de et est " +
    "suis sont ai pas ne plus tres que qui quoi pour dans avec sans mais car comment pourquoi quand ou cest jai " +
    "dieu seigneur verset peur triste fatigue seul seule mal coeur vie aide aidez prier priere besoin toujours " +
    "rien personne veux voudrais sais peux dois examen travail argent famille mari femme enfant attends"
  ).split(" "),
);
const EN_WORDS = new Set(
  (
    "i me my mine you your he she we they the a an and is am are was were not no to of in for with but because " +
    "how why when what god lord verse fear sad tired alone help pray prayer need always nothing want know can feel"
  ).split(" "),
);

export function detectLang(text: string): Lang {
  const folded = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words = folded.replace(/[’']/g, "").split(/[^a-z]+/).filter(Boolean);
  let fr = /[àâçéèêëîïôûùüÿœ]/i.test(text) ? 2 : 0;
  let en = 0;
  for (const w of words) {
    if (FR_WORDS.has(w)) fr++;
    if (EN_WORDS.has(w)) en++;
  }
  return fr > en ? "fr" : "en";
}

/** French messages are answered from Louis Segond; English ones from the chosen English Bible. */
export function translationFor(lang: Lang, chosen: TranslationId): TranslationId {
  if (TRANSLATIONS[chosen].lang === lang) return chosen;
  return lang === "fr" ? "LSG" : "KJV";
}
