import { backgroundTrack } from "@/lib/music";

export const runtime = "nodejs";

/** Returns an Epidemic Sound track for the background, or {source: "builtin"} for the browser's own keys. */
export async function GET() {
  try {
    const track = await backgroundTrack();
    if (track) return Response.json(track);
  } catch (err) {
    console.error("[music]", err);
  }
  return Response.json({ source: "builtin" });
}
