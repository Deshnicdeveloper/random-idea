import { findPassages } from "@/lib/search";
import { asMessage, asTranslation } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = asMessage(body.message);
  if (!message) return Response.json({ error: "Write between 2 and 2000 characters." }, { status: 400 });
  const result = await findPassages(message, asTranslation(body.translation), { limit: 6 });
  return Response.json(result);
}
