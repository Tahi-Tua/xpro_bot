const test = require("node:test");
const assert = require("node:assert/strict");

const { sleep, withTimeout } = require("../utils/discordUtils");

test("withTimeout: resolves successful operation", async () => {
  const result = await withTimeout(Promise.resolve("ok"), "test operation", 100);
  assert.equal(result, "ok");
});

test("withTimeout: rejects slow operation", async () => {
  await assert.rejects(
    withTimeout(sleep(50), "slow operation", 5),
    /slow operation timed out/,
  );
});
