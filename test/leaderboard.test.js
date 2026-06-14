const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const testStateFile = path.join(__dirname, "..", "data", "leaderboardState.test.json");
const originalStateFile = process.env.LEADERBOARD_STATE_FILE;
process.env.LEADERBOARD_STATE_FILE = testStateFile;

if (fs.existsSync(testStateFile)) {
  fs.unlinkSync(testStateFile);
}

const leaderboardStore = require("../utils/leaderboardStore");
const { getLeaderboardFontFiles, renderLeaderboardPng } = require("../utils/leaderboardImage");

test.after(async () => {
  process.env.LEADERBOARD_STATE_FILE = originalStateFile;
  if (fs.existsSync(testStateFile)) {
    fs.unlinkSync(testStateFile);
  }
});

test("leaderboardStore: setScore stores and sorts entries by score", async () => {
  await leaderboardStore.resetLeaderboard();
  await leaderboardStore.setScore("Alpha", 100);
  await leaderboardStore.setScore("Beta", 300);
  await leaderboardStore.setScore("Gamma", 200);

  const entries = leaderboardStore.getEntries();
  assert.deepEqual(entries.map((entry) => entry.name), ["Beta", "Gamma", "Alpha"]);
  assert.deepEqual(entries.map((entry) => entry.score), [300, 200, 100]);
});

test("leaderboardStore: addScore increments existing entries and clamps at zero", async () => {
  await leaderboardStore.resetLeaderboard();
  await leaderboardStore.setScore("Alpha", 100);
  await leaderboardStore.addScore("Alpha", 50);
  await leaderboardStore.addScore("Alpha", -999);

  const [entry] = leaderboardStore.getEntries();
  assert.equal(entry.name, "Alpha");
  assert.equal(entry.score, 0);
});

test("leaderboardStore: removeEntry deletes a stored entry", async () => {
  await leaderboardStore.resetLeaderboard();
  await leaderboardStore.setScore("Alpha", 100);

  assert.equal(await leaderboardStore.removeEntry("Alpha"), true);
  assert.equal(await leaderboardStore.removeEntry("Alpha"), false);
  assert.deepEqual(leaderboardStore.getEntries(), []);
});

test("leaderboardImage: renderLeaderboardPng returns a PNG buffer", () => {
  const png = renderLeaderboardPng([
    { name: "Alpha", score: 300 },
    { name: "Beta", score: 200 },
    { name: "Gamma", score: 100 },
  ]);

  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.length > 1000);
});

test("leaderboardImage: bundled fonts are available for Unicode names", () => {
  const fonts = getLeaderboardFontFiles().map((filePath) => path.basename(filePath));

  assert.ok(fonts.includes("NotoSans.ttf"));
  assert.ok(fonts.includes("NotoSansDevanagariUI-Regular.ttf"));
  assert.ok(fonts.includes("NotoSansYi-Regular.ttf"));
  assert.ok(fonts.includes("NotoSansTaiViet-Regular.ttf"));
  assert.ok(fonts.includes("NotoSansCanadianAboriginal-Regular.ttf"));
  assert.ok(fonts.includes("NotoSerifTibetan-Regular.ttf"));
});
