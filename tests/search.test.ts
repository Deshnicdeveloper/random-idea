// Keyword search and quote recognition over the full Bible text (needs `npm run setup` first).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const hasData = fs.existsSync(path.join(process.cwd(), "data", "bible.json"));
const skip = hasData ? false : "run `npm run setup` to download and build the Bible data";

test("half-remembered wording finds the verse", { skip }, async () => {
  const { keywordSearch } = await import("../lib/bible/keyword");
  const top = (q: string) => {
    const [h] = keywordSearch(q, { limit: 1 });
    return `${h.book}:${h.chapter}:${h.verse}`;
  };
  assert.equal(top("they that wait upon the lord shall mount up with wings"), "22:40:31"); // Isaiah 40:31
  assert.equal(top("be still and know that i am god"), "18:46:10"); // Psalm 46:10
  assert.equal(top("the joy of the lord is my strength"), "15:8:10"); // Nehemiah 8:10
});

test("quotes are recognised, everyday speech and formulas are not", { skip }, async () => {
  const { quoteMatch } = await import("../lib/bible/keyword");
  const ref = (s: string) => {
    const m = quoteMatch(s);
    return m ? `${m.book}:${m.chapter}:${m.verse}` : null;
  };
  assert.equal(ref("and church the Bible says for God so loved the world that he gave his only begotten son"), "42:3:16");
  assert.equal(ref("Car Dieu a tant aimé le monde qu'il a donné son Fils unique"), "42:3:16");
  assert.equal(ref("I can do all things through Christ who strengthens me amen"), "49:4:13");
  assert.equal(ref("I went to the market and bought some bread for my family today"), null);
  assert.equal(ref("the word of the Lord came to me this morning in my prayer time"), null);
});
