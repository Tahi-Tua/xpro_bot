const fs = require("fs");
const path = require("path");

const STATE_PATH = path.join(__dirname, "..", "data", "violationState.json");

let store = {};

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
    console.warn("⚠️ Could not load violation state:", err.message);
    store = {};
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.warn("⚠️ Could not save violation state:", err.message);
  }
}

function getCount(userId) {
  return Number(store[userId]?.count || 0);
}

function increment(userId, amount = 1) {
  if (!store[userId]) {
    store[userId] = { count: 0 };
  }
  store[userId].count += Number(amount) || 0;
  saveStore();
  return store[userId].count;
}

function reset(userId) {
  if (!store[userId]) {
    return 0;
  }
  store[userId].count = 0;
  saveStore();
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
