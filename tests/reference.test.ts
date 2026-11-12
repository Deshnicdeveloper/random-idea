// Typed references ("Ps 23", "Jean 3:16") and references inside teaching text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findReferences, formatReference, parseReference, referenceLang } from "../lib/bible/reference";

const fmt = (s: string) => {
  const r = parseReference(s);
  return r ? formatReference(r) : null;
};

test("English references in many spellings", () => {
  assert.equal(fmt("John 3:16"), "John 3:16");
  assert.equal(fmt("ps 91"), "Psalm 91");
  assert.equal(fmt("1 cor 13:4-7"), "1 Corinthians 13:4–7");
  assert.equal(fmt("2 tim 1:7"), "2 Timothy 1:7");
  assert.equal(fmt("II Kings 2:9"), "2 Kings 2:9");
  assert.equal(fmt("first john 4:18"), "1 John 4:18");
  assert.equal(fmt("phil 4 13"), "Philippians 4:13");
  assert.equal(fmt("ex 14 14"), "Exodus 14:14");
});

test("single-chapter books are cited by verse", () => {
  assert.equal(fmt("Jude 24"), "Jude 1:24");
  assert.equal(fmt("jud 5"), "Jude 1:5");
});

test("French book names and accents", () => {
  assert.equal(fmt("Jean 3:16"), "John 3:16");
  assert.equal(fmt("Ésaïe 41:10"), "Isaiah 41:10");
  assert.equal(fmt("Psaume 23"), "Psalm 23");
  assert.equal(formatReference(parseReference("Jean 3:16")!, "fr"), "Jean 3:16");
  assert.equal(referenceLang("Jean 3:16"), "fr");
  assert.equal(referenceLang("John 3:16"), "en");
});

test("rejects things that aren't references", () => {
  assert.equal(fmt("hello there"), null);
  assert.equal(fmt("John 99:1"), null);
});

test("finds references inside running text", () => {
  const found = findReferences("Remember Joseph in Genesis 50:20. In Romans 8:28 Paul says it. Look at 1 Peter 5:7. But Paul 3:4 is not real.");
  assert.deepEqual(found.map((f) => f.text), ["Genesis 50:20", "Romans 8:28", "1 Peter 5:7"]);
});
