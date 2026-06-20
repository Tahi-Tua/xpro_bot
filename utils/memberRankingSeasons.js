const fs = require("fs").promises;
const https = require("https");
const path = require("path");

const DEFAULT_SEASONS_PATH = path.join(__dirname, "..", "data", "memberRankingSeasons.json");
const DEFAULT_SEASONS_URL = "https://raw.githubusercontent.com/Tahi-Tua/xpro_bot/main/data/memberRankingSeasons.json";

function toSafeSeason(value) {
  const season = Number(value);
  if (!Number.isInteger(season) || season < 1) return null;
  return String(season);
}

function toSafeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0) return null;
  return Math.floor(score);
}

function getDisplayName(entry) {
  return String(
    entry?.name ||
      entry?.displayName ||
      entry?.renderName ||
      entry?.member ||
      "",
  ).trim();
}

function normalizeSeasonEntries(entries = []) {
  return entries
    .map((entry) => ({
      name: getDisplayName(entry),
      score: toSafeScore(entry?.score ?? entry?.season),
    }))
    .filter((entry) => entry.name && entry.score !== null)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return a.name.localeCompare(b.name);
    });
}

function rankSeasonEntries(entries = []) {
  let lastScore = null;
  let lastRank = 0;

  return entries.map((entry, index) => {
    if (entry.score !== lastScore) {
      lastRank = index + 1;
      lastScore = entry.score;
    }

    return {
      ...entry,
      rank: lastRank,
    };
  });
}

function parseSeasonRankings(raw, season) {
  const seasonKey = toSafeSeason(season);
  if (!seasonKey) return [];

  const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
  const seasons = parsed?.seasons && typeof parsed.seasons === "object" ? parsed.seasons : {};
  const entries = Array.isArray(seasons[seasonKey]) ? seasons[seasonKey] : [];

  return rankSeasonEntries(normalizeSeasonEntries(entries));
}

function readHttpsText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 10000 }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });

    request.on("timeout", () => request.destroy(new Error("Request timed out")));
    request.on("error", reject);
  });
}

async function loadSeasonRankings(season, options = {}) {
  const seasonKey = toSafeSeason(season);
  if (!seasonKey) {
    return {
      ok: false,
      season: String(season ?? ""),
      source: null,
      rankings: [],
      error: "Invalid season number.",
    };
  }

  if (options.raw || options.data) {
    return {
      ok: true,
      season: seasonKey,
      source: "provided data",
      rankings: parseSeasonRankings(options.raw || options.data, seasonKey),
    };
  }

  const env = options.env || process.env;
  const seasonsUrl = options.url || env.MEMBER_RANKING_SEASONS_URL || DEFAULT_SEASONS_URL;
  const seasonsPath = options.filePath || env.MEMBER_RANKING_SEASONS_FILE || DEFAULT_SEASONS_PATH;

  try {
    const raw = await readHttpsText(seasonsUrl);
    return {
      ok: true,
      season: seasonKey,
      source: "GitHub raw seasons",
      rankings: parseSeasonRankings(raw, seasonKey),
    };
  } catch (remoteErr) {
    try {
      const raw = await fs.readFile(seasonsPath, "utf8");
      return {
        ok: true,
        season: seasonKey,
        source: "local seasons fallback",
        rankings: parseSeasonRankings(raw, seasonKey),
      };
    } catch (localErr) {
      return {
        ok: false,
        season: seasonKey,
        source: null,
        rankings: [],
        error: `Remote seasons failed (${remoteErr.message}) and local seasons failed (${localErr.message}).`,
      };
    }
  }
}

module.exports = {
  DEFAULT_SEASONS_PATH,
  DEFAULT_SEASONS_URL,
  loadSeasonRankings,
  normalizeSeasonEntries,
  parseSeasonRankings,
  rankSeasonEntries,
  toSafeSeason,
};
