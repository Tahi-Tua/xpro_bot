const test = require("node:test");
const assert = require("node:assert/strict");

const {
  stripDiacritics,
  normalizeSymbols,
  normalizeLeetspeak,
  compressRepeats,
  normalizeContentForSpam,
  normalizeContentForBadwords,
  escapeTelegramMarkdown,
} = require("../utils/moderationUtils");

test("stripDiacritics: removes accents", () => {
  assert.equal(stripDiacritics("café"), "cafe");
  assert.equal(stripDiacritics("mërdé"), "merde");
  assert.equal(stripDiacritics("résumé"), "resume");
  assert.equal(stripDiacritics("naïve"), "naive");
});

test("normalizeSymbols: converts lookalike chars", () => {
  assert.equal(normalizeSymbols("@ss"), "ass");
  assert.equal(normalizeSymbols("$h!t"), "shit");
  assert.equal(normalizeSymbols("fück"), "fuck");
});

test("normalizeLeetspeak: converts numbers to letters", () => {
  assert.equal(normalizeLeetspeak("h3ll0"), "hello");
  assert.equal(normalizeLeetspeak("l33t"), "leet");
  assert.equal(normalizeLeetspeak("m3rd3"), "merde");
  assert.equal(normalizeLeetspeak("sh1t"), "shit");
});

test("compressRepeats: reduces repeated chars", () => {
  assert.equal(compressRepeats("hellooo"), "heloo");
  assert.equal(compressRepeats("fuuuuck"), "fuuck");
  assert.equal(compressRepeats("noooooo"), "nooo");
});

test("normalizeContentForSpam: full normalization pipeline", () => {
  const result = normalizeContentForSpam("Hëllô Wörld!!!");
  assert.ok(result.includes("helo")); // lowercase, stripped diacritics, compressed
  assert.ok(!result.includes("Ë"));
});

test("normalizeContentForBadwords: handles special chars", () => {
  const result = normalizeContentForBadwords("F*ck you @sshole");
  // Should normalize for detection
  assert.ok(typeof result === "string");
  assert.ok(result.length > 0);
});

test("escapeTelegramMarkdown: escapes special chars", () => {
  const text = "Hello *world* _test_ `code`";
  const escaped = escapeTelegramMarkdown(text);
  assert.ok(escaped.includes("\\*"));
  assert.ok(escaped.includes("\\_"));
  assert.ok(escaped.includes("\\`"));
});

test("escapeTelegramMarkdown: handles empty and null", () => {
  assert.equal(escapeTelegramMarkdown(""), "");
  assert.equal(escapeTelegramMarkdown(null), "");
  assert.equal(escapeTelegramMarkdown(undefined), "");
});
