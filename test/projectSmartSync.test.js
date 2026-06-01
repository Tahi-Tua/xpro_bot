const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyProjectChanges,
  isAllowedProjectFile,
  toStateKey,
} = require("../utils/projectSmartSync");

test("projectSmartSync: classifies command changes for slash deployment", () => {
  const targets = classifyProjectChanges([
    "commands/utility/poll.js",
  ]);

  assert.equal(targets.slashCommands, true);
  assert.equal(targets.heroTips, false);
  assert.equal(targets.rulesMessage, false);
});

test("projectSmartSync: classifies hero file changes with targeted paths", () => {
  const targets = classifyProjectChanges([
    "config/heroes/hero-13.js",
  ]);

  assert.equal(targets.heroTips, true);
  assert.equal(targets.heroPaths.length, 1);
  assert.ok(targets.heroPaths[0].replace(/\\/g, "/").endsWith("config/heroes/hero-13.js"));
});

test("projectSmartSync: classifies rules content and banner changes", () => {
  const targets = classifyProjectChanges([
    "config/rules-content.js",
    "attached_assets/rules-banner.jpg",
  ]);

  assert.equal(targets.rulesMessage, true);
  assert.equal(targets.slashCommands, false);
});

test("projectSmartSync: ignores runtime data state files", () => {
  assert.equal(isAllowedProjectFile("data/heroState.json"), false);
  assert.equal(isAllowedProjectFile("data/heroes/hero-13.js"), true);
});

test("projectSmartSync: normalizes state keys", () => {
  const key = toStateKey(require.resolve("../handlers/heroTips"));
  assert.equal(key, "handlers/heroTips.js");
});
