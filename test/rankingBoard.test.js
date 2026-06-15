const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  getNextRankingPublishDate,
  getScheduleKey,
  isEnabled,
} = require("../handlers/rankingAutoPublisher");

test("ranking board HTML uses bundled fonts and avoids emoji-only glyphs", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "leaderboard-xpro.html"), "utf8");

  assert.match(html, /@font-face/);
  assert.match(html, /NotoSans\.ttf/);
  assert.match(html, /NotoSansYi-Regular\.ttf/);
  assert.match(html, /NotoSerifTibetan-Regular\.ttf/);
  assert.doesNotMatch(html, /🏆|🌟|✨|📈|🏅|🥈|🥉/u);
});

test("ranking auto publish schedules Monday 03:00 Europe/Paris before due time", () => {
  const next = getNextRankingPublishDate(new Date("2026-06-14T20:00:00.000Z"));

  assert.equal(next.toISOString(), "2026-06-15T01:00:00.000Z");
  assert.equal(getScheduleKey(next), "2026-06-15");
});

test("ranking auto publish moves to the next Monday after due time", () => {
  const next = getNextRankingPublishDate(new Date("2026-06-15T01:01:00.000Z"));

  assert.equal(next.toISOString(), "2026-06-22T01:00:00.000Z");
});

test("ranking auto publish handles winter Paris offset", () => {
  const next = getNextRankingPublishDate(new Date("2026-01-04T12:00:00.000Z"));

  assert.equal(next.toISOString(), "2026-01-05T02:00:00.000Z");
});

test("ranking auto publish can be disabled by env", () => {
  assert.equal(isEnabled({ RANKING_AUTO_PUBLISH_ENABLED: "false" }), false);
  assert.equal(isEnabled({ RANKING_AUTO_PUBLISH_ENABLED: "true" }), true);
  assert.equal(isEnabled({}), true);
});
