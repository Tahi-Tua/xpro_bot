/**
 * Mute State Manager
 * Persists mute information to survive bot restarts.
 * Stores when a mute should expire so it can be lifted on restart.
 */

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const STATE_PATH = path.join(__dirname, "..", "data", "muteState.json");

let store = {};
let saveQueue = Promise.resolve();

/**
 * Load mute state from disk synchronously (called once at startup).
 */
function loadStore() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, "utf8");
      store = JSON.parse(raw || "{}");
    } else {
      store = {};
      fs.writeFileSync(STATE_PATH, JSON.stringify(store, null, 2));
    }
  } catch (err) {
    console.warn("⚠️ Could not load mute state:", err.message);
    store = {};
  }
}

/**
 * Save mute state to disk asynchronously.
 */
function saveStore() {
  saveQueue = saveQueue
    .then(async () => {
      try {
        await fsPromises.writeFile(STATE_PATH, JSON.stringify(store, null, 2), "utf8");
      } catch (err) {
        console.warn("⚠️ Could not save mute state:", err.message);
      }
    })
    .catch((err) => {
      console.warn("⚠️ Unexpected error in mute save queue:", err.message);
    });
  return saveQueue;
}

/**
 * Record a mute with its expiration time.
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {number} expiresAt - Unix timestamp when mute expires
 * @param {string} reason - Reason for the mute
 */
function recordMute(guildId, userId, expiresAt, reason = "Automatic mute") {
  if (!store[guildId]) {
    store[guildId] = {};
  }
  store[guildId][userId] = {
    expiresAt,
    reason,
    createdAt: Date.now(),
  };
  saveStore();
}

/**
 * Remove a mute record (when unmuted or expired).
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 */
function removeMute(guildId, userId) {
  if (store[guildId]) {
    delete store[guildId][userId];
    if (Object.keys(store[guildId]).length === 0) {
      delete store[guildId];
    }
    saveStore();
  }
}

/**
 * Get all active mutes for a guild.
 * @param {string} guildId - The guild ID
 * @returns {Object} Map of userId -> mute data
 */
function getGuildMutes(guildId) {
  return store[guildId] || {};
}

/**
 * Get all mutes across all guilds.
 * @returns {Object} The full mute store
 */
function getAllMutes() {
  return store;
}

/**
 * Check if a user is muted.
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {boolean}
 */
function isMuted(guildId, userId) {
  return !!(store[guildId] && store[guildId][userId]);
}

/**
 * Get mute info for a user.
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Object|null} Mute data or null
 */
function getMuteInfo(guildId, userId) {
  return store[guildId]?.[userId] || null;
}

// Load state on module initialization
loadStore();

module.exports = {
  recordMute,
  removeMute,
  getGuildMutes,
  getAllMutes,
  isMuted,
  getMuteInfo,
};
