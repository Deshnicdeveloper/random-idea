// One fast, cheap model call that (1) checks for crisis and (2) suggests scripture REFERENCES.
// The model never supplies verse text: every reference is looked up in the database, and
// anything that doesn't resolve to a real verse is dropped.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./client";

const Analysis = z.object({
  crisis: z.enum(["none", "concern", "urgent"]),
  intent: z.enum(["feeling", "find_verse", "question", "other"]),
  passages: z.array(z.object({ reference: z.string(), reason: z.string() })),
  keywords: z.array(z.string()),
});
export type Analysis = z.infer<typeof Analysis>;

const SYSTEM = `You help a Bible app find scripture for someone. Read what they wrote and return JSON.

crisis:
- "urgent" if they express wanting to die, end their life, harm themselves or someone else, or are in immediate danger or abuse.
- "concern" only for despair that sounds deep or lasting: hopelessness about life itself ("nothing matters", "I can't go on", "I feel empty all the time"), without immediate danger. Ordinary worry, stress, sadness, disappointment, failure or fear is "none".
- "none" otherwise.

intent: "find_verse" if they are trying to recall or locate a specific verse or passage; "feeling" if they are sharing emotions or a situation; "question" for a question about the Bible; otherwise "other".

passages: up to 8 Bible passages, best first, as standard references from the 66-book Protestant canon, e.g. "Isaiah 41:10" or "Philippians 4:6-7" (at most 6 verses each, one chapter only).
- For find_verse, put the verse they are most likely remembering first, then close alternatives.
- For feelings, choose passages that speak directly to their situation with depth, not only the most famous verses. The first passage should be the strongest anchor for a short teaching.
- Always write references with English book names (e.g. "John 3:16", never "Jean 3:16"), even when they write in French.
- reason: one short sentence (max 20 words) telling them why this passage fits, addressed to them as "you", written in the same language they wrote in (in French, use the warm "tu"). Never quote verse text.

keywords: 3 to 8 single words likely to appear in the verse text (KJV, modern English, or Louis Segond French wording), for a keyword search.`;

export async function analyze(message: string): Promise<Analysis | null> {
  const response = await anthropic().messages.parse({
    model: MODELS.helper,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Analysis) },
    system: SYSTEM,
    messages: [{ role: "user", content: message }],
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}
