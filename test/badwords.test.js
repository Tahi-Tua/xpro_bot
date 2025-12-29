const test = require("node:test");
const assert = require("node:assert/strict");

const badwords = require("../handlers/badwords");

test("badwords: whole-word match (no substring false positives)", () => {
  assert.equal(badwords.containsBadWord("hello merde world"), true);
  // Common false-positive example: "assistant" contains "ass" as a substring.
  assert.equal(badwords.containsBadWord("assistant"), false);
});

test("badwords: ignores URLs to avoid false positives", () => {
  assert.equal(badwords.containsBadWord("https://example.com/fuck"), false);
  assert.equal(badwords.containsBadWord("check https://example.com/merde now"), false);
});

test("badwords: detects multi-word phrases", () => {
  assert.equal(badwords.containsBadWord("ta gueule"), true);
  assert.deepEqual(new Set(badwords.findBadWords("ta gueule")), new Set(["ta gueule"]));
});

test("badwords: detects obfuscated entries like p**n", () => {
  assert.equal(badwords.containsBadWord("p**n"), true);
  assert.ok(badwords.findBadWords("p**n").includes("p**n"));
});

test("badwords: purges stale in-memory moderation state", async () => {
  assert.equal(typeof badwords.getBadwordCacheStats, "function");
  assert.equal(typeof badwords.purgeExpiredBadwordEntries, "function");

  const fakeUser = {
    id: "user_test_1",
    tag: "user_test_1#0001",
    displayAvatarURL: () => "https://example.invalid/avatar.png",
  };

  await badwords.sendMemberBadwordReport(fakeUser, ["merde"], "merde");
  const before = badwords.getBadwordCacheStats();
  assert.ok(before.stats > 0);
  assert.ok(before.history > 0);

  const purged = badwords.purgeExpiredBadwordEntries(Date.now() + before.retentionMs + 1);
  assert.equal(purged, 1);

  const after = badwords.getBadwordCacheStats();
  assert.equal(after.stats, 0);
  assert.equal(after.history, 0);
});
