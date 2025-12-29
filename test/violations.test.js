const assert = require("assert");
const path = require("path");
const fs = require("fs");

const statePath = path.join(__dirname, "..", "data", "violationState.json");

// Ensure a clean state for test
fs.writeFileSync(statePath, JSON.stringify({}, null, 2));

const store = require("../utils/violationStore");

const userId = "test-user-123";

assert.equal(store.getCount(userId), 0);

store.increment(userId, 5);
assert.equal(store.getCount(userId), 5);

store.increment(userId, 15);
assert.equal(store.getCount(userId), 20);

assert.equal(store.hasReachedThreshold(userId, 20), true);

store.reset(userId);
assert.equal(store.getCount(userId), 0);

console.log("✅ violations.test.js passed");
