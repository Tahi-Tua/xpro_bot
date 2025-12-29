const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const STATE_PATH = path.join(__dirname, "..", "data", "violationState.json");

let store = {};
let saveQueue = Promise.resolve();

function loadStore() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, "utf8");
      store = JSON.parse(raw || "{}");
    } else {
      store = {};
      // Initial write can be sync as it's only done once at startup
      fs.writeFileSync(STATE_PATH, JSON.stringify(store, null, 2));
    }
  } catch (err) {
    console.warn("⚠️ Could not load violation state:", err.message);
    store = {};
  }
}

/**
 * Save the violation store to disk asynchronously.
 * Uses a queue to serialize save operations and prevent event loop blocking.
 */
function saveStore() {
  saveQueue = saveQueue
    .then(async () => {
      try {
        await fsPromises.writeFile(STATE_PATH, JSON.stringify(store, null, 2), "utf8");
      } catch (err) {
        console.warn("⚠️ Could not save violation state:", err.message);
      }
    })
    .catch((err) => {
      console.warn("⚠️ Unexpected error in save queue:", err.message);
    });
  return saveQueue;
}

function getCount(userId) {
  return Number(store[userId]?.count || 0);
}

function increment(userId, amount = 1) {
  if (!store[userId]) {
    store[userId] = { count: 0 };
  }
  store[userId].count += Number(amount) || 0;
  saveStore(); // Fire and forget async save
  return store[userId].count;
}

function reset(userId) {
  if (!store[userId]) {
    return 0;
  }
  store[userId].count = 0;
  saveStore(); // Fire and forget async save
  return 0;
}

function hasReachedThreshold(userId, threshold = 20) {
  return getCount(userId) >= threshold;
}

loadStore();

module.exports = {
  getCount,
  increment,
  reset,
  hasReachedThreshold,
};
