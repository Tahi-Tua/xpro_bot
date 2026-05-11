const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

// Mock the state file before requiring muteStore
const testStateFile = path.join(__dirname, "..", "data", "muteState.test.json");

// Temporarily set the state file path for testing
const originalEnv = process.env.MUTE_STATE_FILE;
process.env.MUTE_STATE_FILE = testStateFile;

// Clean up before tests
if (fs.existsSync(testStateFile)) {
  fs.unlinkSync(testStateFile);
}
fs.writeFileSync(testStateFile, "{}");

// Now require the module
const muteStore = require("../utils/muteStore");

test.afterEach(async () => {
  // Clean up test state between tests
  await muteStore.flushSaves();
  if (fs.existsSync(testStateFile)) {
    fs.writeFileSync(testStateFile, "{}");
  }
});

test.after(async () => {
  // Final cleanup
  await muteStore.flushSaves();
  if (fs.existsSync(testStateFile)) {
    fs.unlinkSync(testStateFile);
  }
  process.env.MUTE_STATE_FILE = originalEnv;
});

test("muteStore: recordMute and isMuted", async () => {
  const guildId = "test-guild-1";
  const userId = "test-user-1";
  const expiresAt = Date.now() + 60000;

  await muteStore.recordMute(guildId, userId, expiresAt, "spam");
  
  const muted = muteStore.isMuted(guildId, userId);
  assert.equal(muted, true);
});

test("muteStore: getMuteInfo returns correct data", async () => {
  const guildId = "test-guild-2";
  const userId = "test-user-2";
  const expiresAt = Date.now() + 60000;

  await muteStore.recordMute(guildId, userId, expiresAt, "badwords");
  
  const info = muteStore.getMuteInfo(guildId, userId);
  assert.ok(info);
  assert.equal(info.expiresAt, expiresAt);
  assert.equal(info.reason, "badwords");
});

test("muteStore: removeMute removes mute", async () => {
  const guildId = "test-guild-3";
  const userId = "test-user-3";
  const expiresAt = Date.now() + 60000;

  await muteStore.recordMute(guildId, userId, expiresAt, "test");
  assert.equal(muteStore.isMuted(guildId, userId), true);

  await muteStore.removeMute(guildId, userId);
  assert.equal(muteStore.isMuted(guildId, userId), false);
});

test("muteStore: getGuildMutes returns all mutes for guild", async () => {
  const guildId = "test-guild-4";
  const expiresAt = Date.now() + 60000;

  await muteStore.recordMute(guildId, "user-a", expiresAt, "spam");
  await muteStore.recordMute(guildId, "user-b", expiresAt, "badwords");
  
  const mutes = muteStore.getGuildMutes(guildId);
  assert.ok(mutes);
  assert.ok(Object.keys(mutes).length >= 2);
});

test("muteStore: expired mutes return false for isMuted", async () => {
  const guildId = "test-guild-5";
  const userId = "test-user-5";
  const expiresAt = Date.now() - 1000; // Already expired

  await muteStore.recordMute(guildId, userId, expiresAt, "test");
  
  const muted = muteStore.isMuted(guildId, userId);
  await muteStore.flushSaves();
  assert.equal(muted, false);
});
