import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  teaching: process.env.TEACHING_MODEL || "claude-opus-5-5",
  helper: process.env.HELPER_MODEL || "claude-haiku-5-5",
};

// Low effort keeps the first words to ~3s while keeping Opus-level depth (tested Nov 2026).
export const TEACHING_EFFORT = (process.env.TEACHING_EFFORT || "low") as "low" | "medium" | "high";

export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const g = globalThis as unknown as { __anthropic?: Anthropic };

export function anthropic(): Anthropic {
  return (g.__anthropic ??= new Anthropic());
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  if (err instanceof Anthropic.RateLimitError) return "Too many requests right now. Wait a moment and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Check your internet connection.";
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status ?? "unknown"}). Try again.`;
  return "Something went wrong. Try again.";
}
