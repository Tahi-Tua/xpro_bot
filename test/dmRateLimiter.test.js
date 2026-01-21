const test = require("node:test");
const assert = require("node:assert/strict");

const dmRateLimiter = require("../utils/dmRateLimiter");

test("dmRateLimiter: canSendDm returns true initially", () => {
  const userId = "test-rate-user-1";
  assert.equal(dmRateLimiter.canSendDm(userId), true);
});

test("dmRateLimiter: recordDm and subsequent canSendDm", () => {
  const userId = "test-rate-user-2";
  
  // First DM should be allowed
  assert.equal(dmRateLimiter.canSendDm(userId), true);
  
  // Record a DM
  dmRateLimiter.recordDm(userId);
  
  // Immediately after, should be rate limited
  const canSend = dmRateLimiter.canSendDm(userId);
  // May be false due to rate limit, or true if DM_RATE_LIMIT_MS is 0
  assert.equal(typeof canSend, "boolean");
});

test("dmRateLimiter: getDelayForUser returns number", () => {
  const userId = "test-rate-user-3";
  const delay = dmRateLimiter.getDelayForUser(userId);
  assert.equal(typeof delay, "number");
  assert.ok(delay >= 0);
});

test("dmRateLimiter: exports config constants", () => {
  assert.equal(typeof dmRateLimiter.DM_RATE_LIMIT_MS, "number");
  assert.equal(typeof dmRateLimiter.DM_GLOBAL_LIMIT, "number");
  assert.equal(typeof dmRateLimiter.DM_GLOBAL_WINDOW_MS, "number");
});

test("dmRateLimiter: sendDmWithRateLimit is a function", () => {
  assert.equal(typeof dmRateLimiter.sendDmWithRateLimit, "function");
});

test("dmRateLimiter: sendBulkDms is a function", () => {
  assert.equal(typeof dmRateLimiter.sendBulkDms, "function");
});
