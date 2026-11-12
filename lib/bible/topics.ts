// Hand-picked passages for common feelings. Used when the AI isn't available, so the app
// still gives strong answers with no API key (and costs nothing for these cases).
const TOPICS: { words: RegExp; refs: string[] }[] = [
  { words: /\b(anxi|worr|nervous|stress|panic|overthink|exam|test|interview|inquiet|angoiss|souci|concours)/i, refs: ["Philippians 4:6-7", "1 Peter 5:7", "Isaiah 41:10", "Matthew 6:33-34", "Psalm 94:19"] },
  { words: /\b(afraid|fear|scared|terrified|frighten|peur|effray|crain)/i, refs: ["Isaiah 41:10", "Joshua 1:9", "Psalm 27:1", "2 Timothy 1:7", "Psalm 56:3-4"] },
  { words: /\b(tired|weary|exhausted|burn(ed|t)? out|drained|no strength|fatigu|epuis|épuis|plus de force)/i, refs: ["Matthew 11:28-30", "Isaiah 40:29-31", "Galatians 6:9", "Psalm 73:26"] },
  { words: /\b(lonely|alone|abandon|forsaken|no one|nobody|rejected|left me|seul|rejet|personne ne)/i, refs: ["Deuteronomy 31:8", "Psalm 27:10", "Hebrews 13:5-6", "Isaiah 49:15-16", "Psalm 68:6"] },
  { words: /\b(sad|depress|down|cry|crying|tears|heartbroken|broken ?hearted|hopeless|triste|déprim|deprim|pleur|larmes|désespér|desesper)/i, refs: ["Psalm 34:18", "Psalm 42:11", "Psalm 30:5", "Revelation 21:4", "Isaiah 61:3"] },
  { words: /\b(grie|mourn|died|death|passed away|funeral|lost my|deuil|décéd|deced|mort|perdu mon|perdu ma)/i, refs: ["Psalm 34:18", "Matthew 5:4", "John 11:25-26", "1 Thessalonians 4:13-14", "Revelation 21:4"] },
  { words: /\b(wait|waiting|delay|stuck|nothing is (moving|working|happening)|how long|attend|attente|bloqu|rien ne (bouge|marche|change)|retard)/i, refs: ["Isaiah 40:31", "Habakkuk 2:3", "Lamentations 3:25-26", "Psalm 27:14", "Ecclesiastes 3:1"] },
  { words: /\b(fail|failed|failure|start over|start again|messed up|mistake|fallen|échou|echou|échec|echec|recommencer|erreur)/i, refs: ["Micah 7:8", "Proverbs 24:16", "Lamentations 3:22-23", "Philippians 3:13-14", "Isaiah 43:18-19"] },
  { words: /\b(guilt|ashamed|shame|sin\b|sins\b|sinn|forgive me|condemn|unworthy|coupable|honte|péché|peche|pardonn|indigne)/i, refs: ["1 John 1:9", "Romans 8:1", "Psalm 103:12", "Isaiah 1:18", "Psalm 51:10"] },
  { words: /\b(money|broke|debt|rent|bills|job|jobless|unemploy|provision|financ|argent|dette|loyer|chômage|chomage|travail|emploi)/i, refs: ["Philippians 4:19", "Matthew 6:31-33", "Psalm 37:25", "Deuteronomy 8:18", "Hebrews 13:5"] },
  { words: /\b(sick|ill\b|illness|disease|pain|hospital|diagnos|healing|heal|malad|douleur|hôpital|hopital|guéri|gueri)/i, refs: ["Jeremiah 17:14", "Psalm 103:2-3", "Isaiah 53:5", "James 5:14-15", "Psalm 41:3"] },
  { words: /\b(battle|fight|enem|attack|war\b|wars\b|oppos|combat|bataille|ennemi|attaqu|guerre)/i, refs: ["Exodus 14:14", "2 Chronicles 20:15-17", "Isaiah 54:17", "Deuteronomy 20:4", "Romans 8:31"] },
  { words: /\b(confus|lost|direction|decision|which way|purpose|calling|perdu|décision|but de ma vie|appel)/i, refs: ["Proverbs 3:5-6", "Jeremiah 29:11", "James 1:5", "Psalm 32:8", "Isaiah 30:21"] },
  { words: /\b(angry|anger|bitter|offend|betray|hurt me|forgive (him|her|them)|colère|colere|amer|trahi|blessé|blesse)/i, refs: ["Ephesians 4:26", "Ephesians 4:31-32", "Romans 12:19", "Colossians 3:13", "Genesis 50:20"] },
  { words: /\b(marri|husband|wife|relationship|single|spouse|mariage|mari|épouse|epouse|célibat|celibat|couple)/i, refs: ["1 Corinthians 13:4-7", "Ecclesiastes 4:9-12", "Psalm 37:4-5", "Proverbs 3:5-6"] },
  { words: /\b(thank|grateful|happy|joy|celebrat|blessed|merci|reconnaiss|heureu|joie|béni|beni)/i, refs: ["Psalm 118:24", "1 Thessalonians 5:16-18", "Psalm 100:4-5", "James 1:17"] },
];

/** References for the feelings mentioned in a message, strongest topic first. */
export function topicReferences(message: string): string[] {
  // Accents are stripped first: JavaScript's \b doesn't treat "é" as a letter, so patterns use plain forms.
  const folded = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Topics are ordered by where they first appear in the message ("I failed my exam" -> failure first).
  const hits = TOPICS.map((t) => ({ t, at: folded.search(t.words) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  // Interleave so the top passage of each feeling comes before second choices.
  const out: string[] = [];
  for (let i = 0; i < 5; i++) for (const h of hits) if (h.t.refs[i] && !out.includes(h.t.refs[i])) out.push(h.t.refs[i]);
  return out;
}
