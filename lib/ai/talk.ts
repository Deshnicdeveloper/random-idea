// Conversation mode: a warm pastor you can talk with. Replies are short and spoken; scripture is quoted
// only after looking it up in the database (show_scripture tool), so every verse is exact.
import type Anthropic from "@anthropic-ai/sdk";
import type { Lang, Passage, TranslationId } from "../types";
import { TRANSLATIONS } from "../types";
import { passageFromString, passageText } from "../bible/data";
import { anthropic } from "./client";

const SYSTEM = `You are the pastor in Selah's conversation mode: a warm, wise pastor in the African church, talking one on one with someone who came to you. They speak to you out loud and hear your replies as speech.

How you talk:
- Like a real conversation, not a sermon. Usually one to four short sentences (about 15 to 70 words). Listen more than you speak.
- Respond to what they actually said, with their details. Ask one gentle question at a time when it helps you understand them.
- Warm, unhurried, grounded. Encourage with substance, not clichés. You may pray with them briefly when they want it, or offer to.
- Spoken words only: no lists, headings, markdown, asterisks or emojis. Write scripture references with digits ("Romans 8:28").
- Reply in the language they use (English or French; in French use "tu").
- Don't assume their gender, age or situation; address them as "my friend" or by name if they give it, not "my brother" or "my sister" unless they tell you.

Scripture:
- When a verse would truly help, first say one short sentence (for example "Let me show you something."), then call show_scripture with its reference. It appears on their screen in full. Then you may quote a short part of it, word for word, from the tool result. Never quote scripture from memory. One passage per reply at most, and not every reply needs one.

If they cut you off:
- Their message may arrive after a reply of yours that ends with "—" because they interrupted you. Respond to what they just said; don't repeat what you were saying unless they ask.

Honesty and care:
- You are an AI companion, not a human or an ordained minister. If they ask, say so simply and kindly, and encourage them to also have real people around them: a church family, friends, a pastor they can meet.
- No medical, legal or financial directives. For a doctor, counsellor or other professional need, encourage that gently alongside faith.
- Stay within historic Christian teaching; don't take sides in denominational disputes.
- If they speak of wanting to die, harming themselves or someone else, or being in danger or abuse: respond with direct, gentle care, urge them to reach someone right now, and call show_crisis_help. Stay with them in the conversation.`;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "show_scripture",
    description:
      "Look up a Bible passage and show it on the person's screen. Returns the exact text, which you may then quote. Use standard references with English book names, at most 6 verses, e.g. \"Isaiah 41:10\" or \"Philippians 4:6-7\".",
    input_schema: {
      type: "object",
      properties: { reference: { type: "string", description: "e.g. Psalm 34:18" } },
      required: ["reference"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "show_crisis_help",
    description:
      "Show emergency numbers and helplines on the person's screen. Use whenever they may be in danger or thinking of harming themselves or others.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
];

export interface TalkTurn {
  role: "user" | "assistant";
  content: string;
}

export type TalkEvent =
  | { type: "delta"; text: string }
  | { type: "passage"; passage: Passage }
  | { type: "crisis" }
  | { type: "done" }
  | { type: "error"; message: string };

/** Runs one pastor reply, streaming text and tool results through `emit`. */
export async function runTalk(args: {
  history: TalkTurn[];
  lang: Lang;
  translation: TranslationId;
  emit: (e: TalkEvent) => void;
  signal?: AbortSignal;
}) {
  const { lang, translation, emit } = args;
  const t = TRANSLATIONS[translation].lang === lang ? translation : lang === "fr" ? "LSG" : "KJV";
  const messages: Anthropic.Beta.BetaMessageParam[] = args.history.map((m) => ({ role: m.role, content: m.content }));

  const model = process.env.CONVERSATION_MODEL || "claude-sonnet-5-5";
  for (let round = 0; round < 3; round++) {
    const stream = anthropic().beta.messages.stream(
      {
        // Sonnet 5.5: first words in ~1-1.4 s (vs 1.3-2.8 s for Opus), which matters in a live conversation.
        model,
        // No silent thinking before a conversational reply (Sonnet 5.5's lowest thinking setting).
        ...(model === "claude-sonnet-5-5" ? { thinking: { type: "between_tools" as const } } : {}),
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      },
      { signal: args.signal },
    );
    stream.on("text", (delta) => emit({ type: "delta", text: delta }));
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") return emit({ type: "error", message: "I can't continue this one. Let's talk about something else." });
    if (final.stop_reason !== "tool_use") break;

    // Run the tools, show their results on screen, and let the pastor continue.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "show_crisis_help") {
        emit({ type: "crisis" });
        results.push({ type: "tool_result", tool_use_id: block.id, content: "Shown." });
        continue;
      }
      const ref = (block.input as { reference?: unknown })?.reference;
      const passage = typeof ref === "string" ? passageFromString(ref, t) : null;
      if (passage) {
        emit({ type: "passage", passage });
        results.push({ type: "tool_result", tool_use_id: block.id, content: `${passage.reference} (${passage.translation}): ${passageText(passage)}` });
      } else {
        results.push({ type: "tool_result", tool_use_id: block.id, content: "That reference was not found. Don't quote it.", is_error: true });
      }
    }
    messages.push({ role: "assistant", content: final.content });
    messages.push({ role: "user", content: results });
  }
  emit({ type: "done" });
}
