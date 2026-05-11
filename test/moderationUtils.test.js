const test = require("node:test");
const assert = require("node:assert/strict");

const {
  stripDiacritics,
  normalizeSymbols,
  normalizeLeetspeak,
  compressRepeats,
  normalizeContentForSpam,
  normalizeContentForBadwords,
  buildTelegramMessage,
  escapeTelegramMarkdown,
  TELEGRAM_MAX_LENGTH,
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

test("buildTelegramMessage: escapes user content and stays below Telegram limit", () => {
  const message = buildTelegramMessage({
    prefix: "Spam *detected*",
    author: "user_name",
    authorId: "123456789012345678",
    channel: "general(chat)",
    violations: "link_spam",
    action: "Warning",
    content: "*".repeat(5000),
  });

  assert.ok(message.length <= TELEGRAM_MAX_LENGTH);
  assert.ok(message.includes("\\*detected\\*"));
  assert.ok(message.includes("user\\_name"));
});

test("escapeTelegramMarkdown: handles empty and null", () => {
  assert.equal(escapeTelegramMarkdown(""), "");
  assert.equal(escapeTelegramMarkdown(null), "");
  assert.equal(escapeTelegramMarkdown(undefined), "");
});
