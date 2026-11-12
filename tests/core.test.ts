// Language detection, crisis detection and audio splitting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLang, translationFor } from "../lib/lang";
import { looksUrgent } from "../lib/safety";
import { splitPieces } from "../lib/speech-pieces";

test("detects French and English and picks the Bible", () => {
  assert.equal(detectLang("Je suis tellement fatiguée, rien ne marche dans ma vie"), "fr");
  assert.equal(detectLang("I'm tired and nothing is working"), "en");
  assert.equal(translationFor("fr", "KJV"), "LSG");
  assert.equal(translationFor("en", "BSB"), "BSB");
  assert.equal(translationFor("en", "LSG"), "KJV");
});

test("crisis patterns catch clear danger, in English and French", () => {
  for (const s of ["I want to end my life", "I don't want to live anymore", "I've been thinking about suicide", "je veux mourir", "je ne veux plus vivre"]) {
    assert.equal(looksUrgent(s), true, s);
  }
  for (const s of ["I'm dying to see my family", "this exam is killing me", "I feel tired"]) {
    assert.equal(looksUrgent(s), false, s);
  }
});

test("audio pieces: short first piece, paragraph-sized after", () => {
  const text = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} has a few sentences. It keeps going for a while. And then it ends.`).join("\n\n");
  const pieces = splitPieces(text, 200, 80);
  assert.ok(pieces[0].length <= 80, "first piece is short so playback starts fast");
  assert.ok(pieces.every((p) => p.length <= 200));
  assert.equal(pieces.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
});
