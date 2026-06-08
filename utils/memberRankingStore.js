const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const STATE_PATH = process.env.MEMBER_RANKING_STATE_FILE || path.join(__dirname, "..", "data", "memberRankings.json");

let saveQueue = Promise.resolve();
let state = null;
let storageWarningShown = false;

function emptyState() {
  return {
    members: {},
    publishedMessageId: null,
    updatedAt: null,
  };
}

function warnAboutRuntimeStorage() {
  if (storageWarningShown) return;
  if (process.env.RENDER !== "true") return;
  if (process.env.RENDER_PERSISTENT_DISK === "true") return;

  storageWarningShown = true;
  console.warn(
    `[memberRankingStore] Using file-based ranking state at ${STATE_PATH}. ` +
      "Use a persistent disk or external database if rankings must survive Render rebuilds.",
  );
}

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== "object") return emptyState();
  return {
    members: parsed.members && typeof parsed.members === "object" ? parsed.members : {},
    publishedMessageId: parsed.publishedMessageId || null,
    updatedAt: parsed.updatedAt || null,
  };
}

function loadState() {
  warnAboutRuntimeStorage();
  if (state) return state;

  try {
    if (!fs.existsSync(STATE_PATH)) {
      state = emptyState();
      return state;
    }

    const raw = fs.readFileSync(STATE_PATH, "utf8");
    state = normalizeState(JSON.parse(raw || "{}"));
    return state;
  } catch (err) {
    console.warn("[memberRankingStore] Could not load rankings:", err.message);
    state = emptyState();
    return state;
  }
}

function saveState(nextState = state) {
  state = normalizeState(nextState);
  state.updatedAt = new Date().toISOString();

  saveQueue = saveQueue
    .then(async () => {
      await fsPromises.mkdir(path.dirname(STATE_PATH), { recursive: true });
      await fsPromises.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
    })
    .catch((err) => {
      console.warn("[memberRankingStore] Could not save rankings:", err.message);
    });

  return saveQueue;
}

function toSafeNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function calculateScore(entry) {
  return toSafeNumber(entry.season) + toSafeNumber(entry.weekly) + toSafeNumber(entry.dailyXp);
}

function upsertMemberRanking({ userId, tag, displayName, avatarUrl, weekly = 0, season = 0, dailyXp = 0, updatedBy }) {
  if (!userId) throw new Error("userId is required");
  const current = loadState();

  current.members[userId] = {
    userId,
    tag: tag || userId,
    displayName: displayName || tag || userId,
    avatarUrl: avatarUrl || null,
    weekly: toSafeNumber(weekly),
    season: toSafeNumber(season),
    dailyXp: toSafeNumber(dailyXp),
    score: calculateScore({ weekly, season, dailyXp }),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || null,
  };

  return saveState(current).then(() => current.members[userId]);
}

function removeMemberRanking(userId) {
  const current = loadState();
  if (!current.members[userId]) return Promise.resolve(false);
  delete current.members[userId];
  return saveState(current).then(() => true);
}

function resetRankings() {
  state = emptyState();
  return saveState(state);
}

function setPublishedMessageId(messageId) {
  const current = loadState();
  current.publishedMessageId = messageId || null;
  return saveState(current);
}

function getPublishedMessageId() {
  return loadState().publishedMessageId || null;
}

function getAllRankings() {
  const current = loadState();
  return Object.values(current.members || {}).sort((a, b) => {
    const scoreDiff = toSafeNumber(b.score) - toSafeNumber(a.score);
    if (scoreDiff !== 0) return scoreDiff;

    const seasonDiff = toSafeNumber(b.season) - toSafeNumber(a.season);
    if (seasonDiff !== 0) return seasonDiff;

    return toSafeNumber(b.weekly) - toSafeNumber(a.weekly);
  });
}

function getTopRankings(limit = 5) {
  return getAllRankings().slice(0, Math.max(1, Math.min(25, Number(limit) || 5)));
}

module.exports = {
  calculateScore,
  getAllRankings,
  getPublishedMessageId,
  getTopRankings,
  removeMemberRanking,
  resetRankings,
  setPublishedMessageId,
  upsertMemberRanking,
};