import { passageFromString } from "@/lib/bible/data";
import { asTranslation } from "@/lib/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? "";
  const p = ref.length <= 60 ? passageFromString(ref, asTranslation(url.searchParams.get("t"))) : null;
  return p ? Response.json(p) : Response.json({ error: "Reference not found" }, { status: 404 });
}
