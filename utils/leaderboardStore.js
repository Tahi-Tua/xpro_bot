const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const stateFile = process.env.LEADERBOARD_STATE_FILE ||
  path.join(__dirname, "../data/leaderboardState.json");

let saveQueue = Promise.resolve();

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function loadLeaderboardState() {
  try {
    const data = fs.readFileSync(stateFile, "utf8");
    const parsed = JSON.parse(data || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLeaderboardState(state) {
  const dir = path.dirname(stateFile);
  saveQueue = saveQueue.then(async () => {
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
  }).catch((err) => {
    console.warn("[Leaderboard] Could not save state:", err.message);
  });

  return saveQueue;
}

function getEntries(state = loadLeaderboardState()) {
  return Object.values(state.entries || {})
    .filter((entry) => entry && typeof entry.name === "string")
    .map((entry) => ({
      name: entry.name,
      score: Number(entry.score) || 0,
      updatedAt: Number(entry.updatedAt) || 0,
      createdAt: Number(entry.createdAt) || 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
}

async function setScore(name, score) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  if (!cleanName) return { error: "Name is required." };

  const numericScore = Number(score);
  if (!Number.isInteger(numericScore) || numericScore < 0) {
    return { error: "Score must be a positive integer." };
  }

  const state = loadLeaderboardState();
  state.entries ||= {};

  const key = normalizeName(cleanName);
  const existing = state.entries[key] || {};
  state.entries[key] = {
    name: cleanName,
    score: numericScore,
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  await saveLeaderboardState(state);
  return { entry: state.entries[key] };
}

async function addScore(name, points) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  if (!cleanName) return { error: "Name is required." };

  const numericPoints = Number(points);
  if (!Number.isInteger(numericPoints)) {
    return { error: "Points must be an integer." };
  }

  const state = loadLeaderboardState();
  state.entries ||= {};

  const key = normalizeName(cleanName);
  const existing = state.entries[key] || {
    name: cleanName,
    score: 0,
    createdAt: Date.now(),
  };

  const nextScore = Math.max(0, (Number(existing.score) || 0) + numericPoints);
  state.entries[key] = {
    ...existing,
    name: existing.name || cleanName,
    score: nextScore,
    updatedAt: Date.now(),
  };

  await saveLeaderboardState(state);
  return { entry: state.entries[key] };
}

async function removeEntry(name) {
  const key = normalizeName(name);
  if (!key) return false;

  const state = loadLeaderboardState();
  if (!state.entries?.[key]) return false;

  delete state.entries[key];
  await saveLeaderboardState(state);
  return true;
}

async function resetLeaderboard() {
  await saveLeaderboardState({ entries: {} });
}

module.exports = {
  addScore,
  getEntries,
  loadLeaderboardState,
  normalizeName,
  removeEntry,
  resetLeaderboard,
  saveLeaderboardState,
  setScore,
};
