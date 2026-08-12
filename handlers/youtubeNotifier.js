const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const { ChannelType, Events, PermissionFlagsBits } = require("discord.js");
const {
  CLAN_CHATS_CATEGORY_ID,
  YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID,
  YOUTUBE_ANNOUNCEMENTS_CHANNEL_NAME,
} = require("../config/channels");
const {
  fetchLatestYoutubeVideos,
  getYoutubeFeedUrl,
  hasYoutubeFeedSource,
} = require("../utils/youtubeFeed");
const {
  extractYoutubeVideoIds,
  selectVideosForAnnouncement,
} = require("../utils/youtubeNotifierState");

const stateFile = path.join(__dirname, "../data/youtubeVideos.json");
const CHECK_INTERVAL_MS = Number(process.env.YOUTUBE_CHECK_INTERVAL_MS || 15 * 60 * 1000);
const FIRST_RUN_ANNOUNCEMENT_LIMIT = Number(
  process.env.YOUTUBE_FIRST_RUN_ANNOUNCEMENT_LIMIT || 1,
);
const DISCORD_HISTORY_LIMIT = Math.min(
  100,
  Math.max(1, Number(process.env.YOUTUBE_DISCORD_HISTORY_LIMIT || 100)),
);

let saveQueue = Promise.resolve();
let isChecking = false;

function loadState() {
  try {
    const data = fs.readFileSync(stateFile, "utf8");
    return JSON.parse(data || "{}");
  } catch {
    return { sourceKey: null, seenVideoIds: [], lastCheckedAt: null };
  }
}

function saveState(state) {
  saveQueue = saveQueue.then(() =>
    fsPromises.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8").catch((err) => {
      console.warn("[YouTube] Could not save video state:", err.message);
    }),
  );
  return saveQueue;
}

function sameChannelName(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

async function resolveAnnouncementChannel(client) {
  if (YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID) {
    try {
      const configuredChannel = await client.channels.fetch(YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID);
      if (configuredChannel?.isTextBased()) return configuredChannel;
      console.warn(
        `[YouTube] Configured channel ${YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID} is not text-based.`,
      );
    } catch (err) {
      console.warn(
        `[YouTube] Cannot access configured channel ${YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID}:`,
        err.message,
      );
    }
    return null;
  }

  const guild = process.env.GUILD_ID
    ? await client.guilds.fetch(process.env.GUILD_ID).catch(() => null)
    : client.guilds.cache.first();
  if (!guild) return null;

  const existingChannel = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      channel.parentId === CLAN_CHATS_CATEGORY_ID &&
      sameChannelName(channel.name, YOUTUBE_ANNOUNCEMENTS_CHANNEL_NAME),
  );
  if (existingChannel) return existingChannel;

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    console.warn("[YouTube] Missing Manage Channels permission; cannot create announcements channel.");
    return null;
  }

  return guild.channels.create({
    name: YOUTUBE_ANNOUNCEMENTS_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: CLAN_CHATS_CATEGORY_ID || null,
    topic: "New videos and Shorts from the Xavier Pro YouTube channel.",
    reason: "Create Xavier Pro YouTube announcements channel",
  }).catch((err) => {
    console.warn("[YouTube] Could not create announcements channel:", err.message);
    return null;
  });
}

async function getRecentlyAnnouncedVideoIds(channel, botUserId) {
  try {
    const messages = await channel.messages.fetch({ limit: DISCORD_HISTORY_LIMIT });
    const ids = new Set();

    for (const message of messages.values()) {
      if (message.author?.id !== botUserId) continue;
      for (const videoId of extractYoutubeVideoIds(message.content)) {
        ids.add(videoId);
      }
    }

    return ids;
  } catch (err) {
    console.warn("[YouTube] Could not inspect Discord announcement history:", err.message);
    return new Set();
  }
}

async function announceVideo(channel, video) {
  await channel.send({
    content: `@everyone A new video has been released, go check it out\n${video.url}`,
    allowedMentions: {
      parse: ["everyone"],
      roles: [],
    },
  });
}

async function checkYoutubeFeed(client) {
  if (isChecking) return;
  if (!hasYoutubeFeedSource()) return;

  isChecking = true;
  try {
    const channel = await resolveAnnouncementChannel(client);
    if (!channel?.isTextBased()) {
      console.warn("[YouTube] Announcement channel missing or not text-based.");
      return;
    }

    const feedUrl = await getYoutubeFeedUrl();
    const videos = await fetchLatestYoutubeVideos(feedUrl);
    if (videos.length === 0) {
      console.log("[YouTube] Feed contained no videos.");
      return;
    }

    const state = loadState();
    const seen = new Set(state.seenVideoIds || []);
    const discordSeen = await getRecentlyAnnouncedVideoIds(channel, client.user.id);
    for (const videoId of discordSeen) seen.add(videoId);

    const sourceChanged = state.sourceKey !== feedUrl;
    const isFirstRun = sourceChanged || !state.lastCheckedAt;
    const newVideos = selectVideosForAnnouncement(videos, seen, {
      firstRun: isFirstRun,
      firstRunLimit: FIRST_RUN_ANNOUNCEMENT_LIMIT,
    });

    for (const video of newVideos) {
      await announceVideo(channel, video);
      seen.add(video.videoId);
    }

    if (isFirstRun) {
      for (const video of videos) seen.add(video.videoId);
    }

    state.sourceKey = feedUrl;
    state.seenVideoIds = Array.from(seen).slice(-100);
    state.lastCheckedAt = new Date().toISOString();
    await saveState(state);

    console.log(
      `[YouTube] Check complete: ${videos.length} fetched, ${newVideos.length} announced.`,
    );
  } catch (err) {
    console.warn("[YouTube] Feed check failed:", err.message);
  } finally {
    isChecking = false;
  }
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => {
    if (!hasYoutubeFeedSource()) {
      console.log(
        "[YouTube] Notifier disabled. Set XPRO_YOUTUBE_CHANNEL_URL, XPRO_YOUTUBE_CHANNEL_ID, or XPRO_YOUTUBE_FEED_URL.",
      );
      return;
    }

    checkYoutubeFeed(client);
    setInterval(() => checkYoutubeFeed(client), CHECK_INTERVAL_MS).unref?.();
    console.log("[YouTube] Notifier started.");
  });
};

module.exports.checkYoutubeFeed = checkYoutubeFeed;
module.exports.resolveAnnouncementChannel = resolveAnnouncementChannel;
