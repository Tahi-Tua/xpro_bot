const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  loadHeroSource,
  getTargetHeroIdsForChangedPaths,
} = require("../handlers/heroTips");

test("heroTips: loads static heroes from config source", () => {
  const { heroes, heroesDir } = loadHeroSource();

  assert.ok(heroesDir.endsWith(path.join("config", "heroes")));
  assert.equal(heroes.length, 13);
  assert.ok(heroes.every((hero) => hero.id && hero.name && hero.tips && hero.sourceFile));
});

test("heroTips: targets only the changed hero file", () => {
  const { heroes } = loadHeroSource();
  const hero13 = heroes.find((hero) => hero.id === "hero13");
  const targets = getTargetHeroIdsForChangedPaths(heroes, [hero13.sourceFile]);

  assert.deepEqual(Array.from(targets), ["hero13"]);
});

test("heroTips: index changes trigger a full sync", () => {
  const { heroes, heroesDir } = loadHeroSource();
  const targets = getTargetHeroIdsForChangedPaths(heroes, [path.join(heroesDir, "index.js")]);

  assert.equal(targets, null);
});
