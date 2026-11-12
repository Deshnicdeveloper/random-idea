// Splits text into pieces for recording. Shared by the browser (which plays piece by piece, so audio
// starts after the first one) and the server (which records and caches each piece once).

/** Splits at paragraph, then sentence, boundaries into pieces of at most `max` characters. */
export function splitPieces(text: string, max = 700, firstMax = max): string[] {
  const out: string[] = [];
  const limit = () => (out.length === 0 ? firstMax : max);
  const sentences = (para: string) => para.match(/[^.!?…]+[.!?…]+["”»)]*\s*|.+$/g) ?? [para];

  for (const para of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    const last = out[out.length - 1];
    if (last && out.length > 1 && last.length + para.length + 2 <= max) {
      out[out.length - 1] = `${last}\n\n${para}`; // join short paragraphs (never into the quick first piece)
      continue;
    }
    if (para.length <= limit()) {
      out.push(para);
      continue;
    }
    let buf = "";
    for (const s of sentences(para)) {
      if ((buf + s).length > limit() && buf) {
        out.push(buf.trim());
        buf = "";
      }
      buf += s;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

/** Piece sizes used for read-aloud: a short first piece so playback starts within seconds. */
export const SPEECH_FIRST_PIECE = 260;
export const SPEECH_PIECE = 700;
