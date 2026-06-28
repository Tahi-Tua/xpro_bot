const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

test("ranking board HTML uses bundled fonts and avoids emoji-only glyphs", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "leaderboard-xpro.html"), "utf8");

  assert.match(html, /@font-face/);
  assert.match(html, /NotoSans\.ttf/);
  assert.match(html, /NotoSansYi-Regular\.ttf/);
  assert.match(html, /NotoSerifTibetan-Regular\.ttf/);
  assert.doesNotMatch(html, /🏆|🌟|✨|📈|🏅|🥈|🥉/u);
});
