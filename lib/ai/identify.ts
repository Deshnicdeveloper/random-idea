// Service mode, second line of recognition: catches verses a preacher PARAPHRASES or half-quotes
// ("he shall prepare a table for me in front of kings" -> Psalm 23:5), which exact-word matching misses.
// Fast, cheap model; strict about confidence; the reference is always verified against the database.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./client";

const Answer = z.object({
  reference: z.string().nullable(),
  confidence: z.enum(["high", "low"]),
});

const SYSTEM = `You watch a live sermon transcript for an on-screen Bible display. The transcript comes from speech recognition, so expect misheard words (e.g. "Sam's" for "Psalms").

Decide whether the most recent words quote, paraphrase or point to a specific Bible verse (or a short passage of up to 3 verses in one chapter). The preacher may still be mid-sentence.
- Cue phrases like "the Bible says", "it is written", "Jesus said", "Paul says", "God's word tells us", "la Bible dit" usually mean a verse is being cited.
- If the statement is a specific scriptural saying that appears in several places (e.g. "honour your father and mother": Exodus 20:12, Ephesians 6:2), give its best-known occurrence (usually the original or the most quoted one) with confidence "high". Prefer the occurrence whose wording fits what was said.
- Give references with English book names (e.g. "Psalm 23:5", "Isaiah 40:31", "John 3:16-17").
- Return reference null (or confidence "low") for general themes with no specific verse ("God is good", "trust God in hard times"), loosely retold stories, or when you are unsure.
- Candidate verses from a keyword search are given; use one if it fits, but you may name another verse that fits better.
A wrong verse on the church screen is worse than none, but a clearly cited saying should appear quickly.`;

export async function identifyVerse(speech: string, candidates: string[]): Promise<string | null> {
  const res = await anthropic().messages.parse({
    model: MODELS.helper,
    max_tokens: 2000,
    // No pre-answer thinking: this runs while the preacher talks, so speed matters most.
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(Answer) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Transcript (most recent last):\n${speech}\n\nKeyword candidates:\n${candidates.join("\n") || "(none)"}`,
      },
    ],
  });
  if (res.stop_reason === "refusal") return null;
  const a = res.parsed_output;
  return a && a.reference && a.confidence === "high" ? a.reference : null;
}
