// Crisis detection. A fast pattern check runs on every message (no API needed); the AI
// analysis adds a second opinion. If either says "urgent", the app stops and points to people.
import type { CrisisResources, Lang, TranslationId } from "./types";
import { TRANSLATIONS } from "./types";
import { passageFromString } from "./bible/data";

const URGENT_PATTERNS = [
  /\b(kill|killing|hang|hanging|shoot|shooting|end)\s+my\s*self\b/i,
  /\bkill\s+myself\b/i,
  /\bend(ing)?\s+(it\s+all|my\s+life|everything)\b/i,
  /\bsuicid(e|al)\b/i,
  /\b(want|wanna|going|ready|planning)\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+alive|exist|wake\s+up)\b/i,
  /\b(hurt|harm|cut|cutting)\s+myself\b/i,
  /\bself[-\s]?harm/i,
  /\b(no|nothing\s+to)\s+(reason|point)\s+(to|in)\s+(live|living|go\s+on)\b/i,
  /\bbetter\s+off\s+(dead|without\s+me)\b/i,
  /\btake\s+my\s+(own\s+)?life\b/i,
  /\boverdose\b/i,
  // French
  /\bme\s+(suicider|tuer)\b/i,
  /\bmettre\s+fin\s+[àa]\s+mes\s+jours\b/i,
  /\benvie\s+de\s+mourir\b/i,
  /\b(je\s+)?veux\s+mourir\b/i,
  /\bplus\s+(envie\s+de\s+|la\s+force\s+de\s+)?vivre\b/i,
  /\bme\s+faire\s+du\s+mal\b/i,
  /\ben\s+finir\s+avec\s+(la|ma)\s+vie\b/i,
];

export function looksUrgent(message: string): boolean {
  return URGENT_PATTERNS.some((re) => re.test(message));
}

// Numbers checked against the Government of Canada travel advisory for Cameroon (Nov 2026).
// Verify locally before launch and add numbers for each country you serve.
const COPY: Record<Lang, Omit<CrisisResources, "passage">> = {
  en: {
    message:
      "I'm really glad you said something. What you're carrying sounds heavy, and you deserve a real person " +
      "with you right now, not just words on a screen. Please reach out to someone today.",
    lines: [
      { label: "In danger right now?", detail: "Cameroon: call 119 (medical emergency, SAMU) or 117 (police). Elsewhere, call your local emergency number." },
      { label: "Talk to someone trained", detail: "Find a free, confidential helpline in your country", href: "https://findahelpline.com" },
      { label: "Call someone you trust", detail: "A pastor, a friend, a family member. Tell them exactly what you told me." },
    ],
  },
  fr: {
    message:
      "Merci de m'en avoir parlé. Ce que tu portes est lourd, et tu mérites d'avoir une vraie " +
      "personne avec toi maintenant, pas seulement des mots sur un écran. S'il te plaît, parle à quelqu'un aujourd'hui.",
    lines: [
      { label: "En danger maintenant ?", detail: "Cameroun : appelle le 119 (urgences médicales, SAMU) ou le 117 (police). Ailleurs, appelle le numéro d'urgence local." },
      { label: "Parle à quelqu'un de formé", detail: "Trouve une ligne d'écoute gratuite et confidentielle dans ton pays", href: "https://findahelpline.com" },
      { label: "Appelle quelqu'un de confiance", detail: "Un pasteur, un ami, un membre de ta famille. Dis-leur exactement ce que tu m'as dit." },
    ],
  },
};

export function crisisResources(t: TranslationId): CrisisResources {
  const lang = TRANSLATIONS[t].lang;
  return { ...COPY[lang], passage: passageFromString("Psalm 34:18", t) ?? undefined };
}
