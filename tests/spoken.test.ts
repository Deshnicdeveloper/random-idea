// Service mode: references the way preachers say them, and the way live transcription writes them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, type SpokenRef } from "../lib/service/spoken";
import { formatReference } from "../lib/bible/reference";

/** Runs lines in order (context carries over, like a sermon) and returns what each line shows. */
function sermon(lines: string[]): (string | null)[] {
  let ctx: SpokenRef | null = null;
  return lines.map((line) => {
    const found = detect(line, ctx);
    if (!found.length) return null;
    ctx = found[found.length - 1].ref;
    return found.map((d) => formatReference(d.ref)).join(", ");
  });
}

test("explicit and relative references through a sermon", () => {
  assert.deepEqual(
    sermon([
      "Church, turn with me to Romans chapter eight verse twenty eight",
      "and we know that all things work together for good",
      "now look at the next verse",
      "read on",
      "go back to verse one",
      "Let's go to First Corinthians 13 verses 4 to 7",
      "Psalm one hundred and nineteen verse one hundred and five",
      "open your Bibles to Psalm 23",
      "verse four",
    ]),
    ["Romans 8:28", null, "Romans 8:29", "Romans 8:30", "Romans 8:1", "1 Corinthians 13:4–7", "Psalm 119:105", "Psalm 23:1", "Psalm 23:4"],
  );
});

test("everyday speech does not trigger a verse", () => {
  assert.deepEqual(sermon(["I gave John 20 dollars yesterday when I was 16", "My brother Mark 2 times asked me", "I paid 316 dollars", "I bought some 23 oranges", "Kings 2 of them"]), [null, null, null, null, null]);
});

test("fused numbers from live transcription", () => {
  assert.deepEqual(
    sermon(["turn to Romans 828", "John 316 says", "Isaiah 4031", "Philippians 413", "Jeremiah 2911", "Genesis 5020"]),
    ["Romans 8:28", "John 3:16", "Isaiah 40:31", "Philippians 4:13", "Jeremiah 29:11", "Genesis 50:20"],
  );
});

test("mishearings of Psalm and unmistakable bare chapters", () => {
  // "Sam" is also a name, so a bare "Sam's 91" needs a lead-in ("turn to") or a verse number.
  assert.deepEqual(
    sermon(["Sam's 91", "turn to Sam's 91", "turn to Sams 23", "some 23 verse 5", "Isaiah 53"]),
    [null, "Psalm 91:1", "Psalm 23:1", "Psalm 23:5", "Isaiah 53:1"],
  );
});

test("French sermons", () => {
  assert.deepEqual(
    sermon(["Ouvrez vos Bibles dans Jean chapitre trois verset seize", "verset suivant", "Romains huit vingt-huit", "Psaume quatre-vingt-onze verset un", "Matthieu dix-sept verset vingt"]),
    ["John 3:16", "John 3:17", "Romans 8:28", "Psalm 91:1", "Matthew 17:20"],
  );
});
