const fs = require("fs");
const path = require("path");
const { Events } = require("discord.js");
const { MEMBER_RANKINGS_CHANNEL_ID } = require("../config/channels");
const { buildRankingBoardMessagePayload } = require("../commands/utility/ranking");

const STATE_PATH = process.env.RANKING_AUTO_PUBLISH_STATE_FILE ||
  path.join(__dirname, "..", "data", "rankingAutoPublishState.json");
const DEFAULT_TIME_ZONE = "Europe/Paris";
const DEFAULT_WEEKDAY = 1;
const DEFAULT_HOUR = 3;
const DEFAULT_MINUTE = 0;

let started = false;
let timer = null;

function isEnabled(env = process.env) {
  return String(env.RANKING_AUTO_PUBLISH_ENABLED || "true").toLowerCase() !== "false";
}

function getZonedParts(date, timeZone = DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    weekday: weekdays[parts.weekday],
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function addDaysToLocalDate(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function zonedDateTimeToUtc(year, month, day, hour, minute, timeZone = DEFAULT_TIME_ZONE) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const desiredLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let index = 0; index < 4; index += 1) {
    const actual = getZonedParts(guess, timeZone);
    const actualLocalMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
    const delta = desiredLocalMs - actualLocalMs;
    if (delta === 0) return guess;
    guess = new Date(guess.getTime() + delta);
  }

  return guess;
}

function getNextRankingPublishDate(now = new Date(), options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const weekday = Number.isInteger(options.weekday) ? options.weekday : DEFAULT_WEEKDAY;
  const hour = Number.isInteger(options.hour) ? options.hour : DEFAULT_HOUR;
  const minute = Number.isInteger(options.minute) ? options.minute : DEFAULT_MINUTE;
  const nowParts = getZonedParts(now, timeZone);
  let daysUntil = (weekday - nowParts.weekday + 7) % 7;

  if (
    daysUntil === 0 &&
    (nowParts.hour > hour || (nowParts.hour === hour && nowParts.minute >= minute))
  ) {
    daysUntil = 7;
  }

  let target = addDaysToLocalDate(nowParts, daysUntil);
  let candidate = zonedDateTimeToUtc(target.year, target.month, target.day, hour, minute, timeZone);

  if (candidate.getTime() <= now.getTime()) {
    target = addDaysToLocalDate(target, 7);
    candidate = zonedDateTimeToUtc(target.year, target.month, target.day, hour, minute, timeZone);
  }

  return candidate;
}

function getScheduleKey(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function loadState(statePath = STATE_PATH) {
  try {
    if (!fs.existsSync(statePath)) return {};
    return JSON.parse(fs.readFileSync(statePath, "utf8") || "{}");
  } catch (error) {
    console.warn("[ranking-auto] Could not load state:", error.message);
    return {};
  }
}

function saveState(state, statePath = STATE_PATH) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function publishRankingBoard(client, options = {}) {
  const channelId = options.channelId || process.env.RANKING_AUTO_PUBLISH_CHANNEL_ID || MEMBER_RANKINGS_CHANNEL_ID;
  if (!channelId) throw new Error("Missing MEMBER_RANKINGS_CHANNEL_ID or RANKING_AUTO_PUBLISH_CHANNEL_ID.");

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Configured ranking channel is not text-based: ${channelId}`);
  }

  const payload = await buildRankingBoardMessagePayload({
    rosterUrl: options.rosterUrl || process.env.MEMBER_RANKING_ROSTER_URL,
  });
  return channel.send(payload);
}

function startRankingAutoPublisher(client, options = {}) {
  if (started || !isEnabled(options.env || process.env)) return null;
  started = true;

  const timeZone = options.timeZone || process.env.RANKING_AUTO_PUBLISH_TIMEZONE || DEFAULT_TIME_ZONE;
  const statePath = options.statePath || STATE_PATH;
  const nowFn = options.now || (() => new Date());
  const setTimer = options.setTimeout || setTimeout;

  const scheduleNext = (referenceDate = nowFn()) => {
    const next = getNextRankingPublishDate(referenceDate, { timeZone });
    const delay = Math.max(1000, next.getTime() - referenceDate.getTime());

    console.log(`[ranking-auto] Next ranking board publish: ${next.toISOString()} (${timeZone})`);

    timer = setTimer(async () => {
      const runDate = nowFn();
      const key = getScheduleKey(runDate, timeZone);
      const state = loadState(statePath);

      try {
        if (state.lastPublishedKey === key) {
          console.log(`[ranking-auto] Ranking board already published for ${key}.`);
        } else {
          await publishRankingBoard(client, options);
          saveState({
            ...state,
            lastPublishedKey: key,
            lastPublishedAt: runDate.toISOString(),
          }, statePath);
          console.log(`[ranking-auto] Ranking board published for ${key}.`);
        }
      } catch (error) {
        console.error("[ranking-auto] Failed to publish ranking board:", error);
      } finally {
        scheduleNext(new Date(runDate.getTime() + 60 * 1000));
      }
    }, delay);

    return timer;
  };

  return scheduleNext();
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => {
    startRankingAutoPublisher(client);
  });
};

module.exports.DEFAULT_TIME_ZONE = DEFAULT_TIME_ZONE;
module.exports.getNextRankingPublishDate = getNextRankingPublishDate;
module.exports.getScheduleKey = getScheduleKey;
module.exports.getZonedParts = getZonedParts;
module.exports.isEnabled = isEnabled;
module.exports.loadState = loadState;
module.exports.publishRankingBoard = publishRankingBoard;
module.exports.saveState = saveState;
module.exports.startRankingAutoPublisher = startRankingAutoPublisher;
