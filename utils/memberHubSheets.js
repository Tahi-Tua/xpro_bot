const {
  clearValues,
  getGoogleSheetsConfig,
  getValues,
  updateValues,
} = require("./googleSheetsClient");
const { getEntries } = require("./leaderboardStore");

const LEADERBOARD_SHEET = "Leaderboard";
const LEADERBOARD_HEADERS = ["Name", "DiscordId", "Score", "Rank", "LastUpdated"];
const EVENTS_SHEET = "Events";

function buildLeaderboardSheetRows(entries = getEntries(), now = new Date()) {
  const sorted = [...entries].sort((a, b) => {
    const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  let lastScore = null;
  let lastRank = 0;

  const rows = sorted.map((entry, index) => {
    const score = Number(entry.score) || 0;
    if (score !== lastScore) {
      lastRank = index + 1;
      lastScore = score;
    }

    return [
      entry.name || "",
      entry.discordId || "",
      score,
      lastRank,
      entry.updatedAt ? new Date(entry.updatedAt).toISOString() : now.toISOString(),
    ];
  });

  return [LEADERBOARD_HEADERS, ...rows];
}

function getMemberHubSheetsStatus(env = process.env) {
  const config = getGoogleSheetsConfig(env);
  return {
    configured: config.configured,
    missing: config.missing,
  };
}

function rowsToObjects(values = []) {
  const [headers = [], ...rows] = values;
  return rows
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const aTime = Date.parse(a.StartsAt);
    const bTime = Date.parse(b.StartsAt);
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return String(a.Title).localeCompare(String(b.Title));
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return aTime - bTime;
  });
}

async function getUpcomingEventsFromGoogleSheets(options = {}) {
  const config = getGoogleSheetsConfig(options.env || process.env);
  if (!config.configured) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_config",
      missing: config.missing,
      events: [],
    };
  }

  const response = await getValues(`${EVENTS_SHEET}!A:G`, config);
  const now = options.now || new Date();
  const limit = options.limit || 5;
  const events = rowsToObjects(response.values || [])
    .filter((event) => !["cancelled", "archived", "closed"].includes(String(event.Status || "").toLowerCase()))
    .filter((event) => {
      const timestamp = Date.parse(event.StartsAt);
      return Number.isNaN(timestamp) || timestamp >= now.getTime();
    });

  return {
    ok: true,
    skipped: false,
    events: sortEvents(events).slice(0, limit),
  };
}

async function syncLeaderboardToGoogleSheets(options = {}) {
  const config = getGoogleSheetsConfig(options.env || process.env);
  if (!config.configured) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_config",
      missing: config.missing,
    };
  }

  const values = buildLeaderboardSheetRows(options.entries || getEntries(), options.now || new Date());
  await clearValues(`${LEADERBOARD_SHEET}!A:E`, config);
  const updated = await updateValues(`${LEADERBOARD_SHEET}!A1:E${values.length}`, values, config);

  return {
    ok: true,
    skipped: false,
    updatedRange: updated.updatedRange,
    updatedRows: updated.updatedRows,
  };
}

module.exports = {
  LEADERBOARD_HEADERS,
  LEADERBOARD_SHEET,
  EVENTS_SHEET,
  buildLeaderboardSheetRows,
  getUpcomingEventsFromGoogleSheets,
  getMemberHubSheetsStatus,
  rowsToObjects,
  syncLeaderboardToGoogleSheets,
};
