// Removed OpenAI/GPT applicant analysis. This file is intentionally left empty.
// If referenced, please remove imports from handlers.

function redactSecrets(text) {
  if (!text) return text;
  return String(text)
    // OpenAI-style keys (includes sk-proj-..., sk-..., etc)
    .replace(/\bsk-[a-zA-Z0-9_-]{10,}\b/g, "sk-REDACTED")
    .replace(/\bsk-proj-[a-zA-Z0-9_-]{10,}\b/g, "sk-proj-REDACTED");
}

function postJson(url, headers, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(new Error(`Invalid JSON response: ${err.message}`));
            }
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}: ${redactSecrets(body).slice(0, 2000)}`));
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function safeParseJsonObject(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, ".").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function evaluateRequirements(stats) {
  const thresholds = {
    gamesPlayed: 15000,
    brWinRatePercent: 25,
    averageKillsPerGame: 1.5,
    svsGames: 3000,
  };

  const gamesPlayed = toNumber(stats.games_played);
  const brWinRatePercent = toNumber(stats.br_win_rate_percent);
  const averageKillsPerGame = toNumber(stats.average_kills_per_game);
  const svsGames = toNumber(stats.svs_games);

  const missing = [];
  if (gamesPlayed === null) missing.push("games_played");
  if (brWinRatePercent === null) missing.push("br_win_rate_percent");
  if (averageKillsPerGame === null) missing.push("average_kills_per_game");
  if (svsGames === null) missing.push("svs_games");

  const meets =
    gamesPlayed !== null &&
    brWinRatePercent !== null &&
    averageKillsPerGame !== null &&
    svsGames !== null &&
    gamesPlayed >= thresholds.gamesPlayed &&
    brWinRatePercent >= thresholds.brWinRatePercent &&
    averageKillsPerGame >= thresholds.averageKillsPerGame &&
    svsGames >= thresholds.svsGames;

  return {
    thresholds,
    extracted: { gamesPlayed, brWinRatePercent, averageKillsPerGame, svsGames },
    missing,
    meets,
  };
}


  module.exports = {};
