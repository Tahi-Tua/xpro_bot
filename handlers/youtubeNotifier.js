const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const { ChannelType, Events, PermissionFlagsBits } = require("discord.js");
const {
  CLAN_CHATS_CATEGORY_ID,
  MEDIA_MANAGER_ROLE_ID,
  MEDIA_MANAGER_ROLE_NAME,
  YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID,
  YOUTUBE_ANNOUNCEMENTS_CHANNEL_NAME,
} = require("../config/channels");
const { fetchLatestYoutubeVideos, hasYoutubeFeedSource } = require("../utils/youtubeFeed");

const stateFile = path.join(__dirname, "../data/youtubeVideos.json");
const CHECK_INTERVAL_MS = Number(process.env.YOUTUBE_CHECK_INTERVAL_MS || 15 * 60 * 1000);
const ANNOUNCE_ON_FIRST_RUN = process.env.YOUTUBE_ANNOUNCE_ON_FIRST_RUN === "true";

let saveQueue = Promise.resolve();
let isChecking = false;

function loadState() {
  try {
    const data = fs.readFileSync(stateFile, "utf8");
    return JSON.parse(data || "{}");
  } catch {
    return { seenVideoIds: [], lastCheckedAt: null };
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

function getMediaManagerTarget(guild) {
  if (MEDIA_MANAGER_ROLE_ID) {
    return { mention: `<@&${MEDIA_MANAGER_ROLE_ID}>`, roleId: MEDIA_MANAGER_ROLE_ID };
  }

  const role = guild.roles.cache.find(
    (candidate) => candidate.name.toLowerCase() === MEDIA_MANAGER_ROLE_NAME.toLowerCase(),
  );
  return role
    ? { mention: `<@&${role.id}>`, roleId: role.id }
    : { mention: `@${MEDIA_MANAGER_ROLE_NAME}`, roleId: null };
}

function sameChannelName(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

async function resolveAnnouncementChannel(client) {
  if (YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID) {
    const configuredChannel = await client.channels.fetch(YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID).catch(() => null);
    if (configuredChannel?.isTextBased()) return configuredChannel;
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
    topic: "New YouTube videos from the Xavier Pro media manager.",
    reason: "Create YouTube announcements channel for media manager videos",
  }).catch((err) => {
    console.warn("[YouTube] Could not create announcements channel:", err.message);
    return null;
  });
}

async function announceVideo(channel, guild, video) {
  const mediaManager = getMediaManagerTarget(guild);
  await channel.send({
    content: `@here ${mediaManager.mention} just dropped a new video, check it out:\n${video.url}`,
    allowedMentions: {
      parse: ["everyone"],
      roles: mediaManager.roleId ? [mediaManager.roleId] : [],
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

    const videos = await fetchLatestYoutubeVideos();
    if (videos.length === 0) return;

    const state = loadState();
    const seen = new Set(state.seenVideoIds || []);
    const newVideos = videos.filter((video) => !seen.has(video.videoId)).reverse();
    const isFirstRun = seen.size === 0;

    if (isFirstRun && !ANNOUNCE_ON_FIRST_RUN) {
      state.seenVideoIds = videos.map((video) => video.videoId).slice(0, 50);
      state.lastCheckedAt = new Date().toISOString();
      await saveState(state);
      console.log(`[YouTube] Seeded ${state.seenVideoIds.length} existing video(s) without announcement.`);
      return;
    }

    for (const video of newVideos) {
      await announceVideo(channel, channel.guild, video);
      seen.add(video.videoId);
    }

    state.seenVideoIds = Array.from(seen).slice(-50);
    state.lastCheckedAt = new Date().toISOString();
    await saveState(state);
  } catch (err) {
    console.warn("[YouTube] Feed check failed:", err.message);
  } finally {
    isChecking = false;
  }
}

module.exports = (client) => {
  client.once(Events.ClientReady, () => {
    if (!hasYoutubeFeedSource()) {
      console.log("[YouTube] Notifier disabled. Set YOUTUBE_CHANNEL_URL, YOUTUBE_CHANNEL_ID, or YOUTUBE_FEED_URL.");
      return;
    }

    checkYoutubeFeed(client);
    setInterval(() => checkYoutubeFeed(client), CHECK_INTERVAL_MS).unref?.();
    console.log("[YouTube] Notifier started.");
  });
};

module.exports.checkYoutubeFeed = checkYoutubeFeed;
module.exports.resolveAnnouncementChannel = resolveAnnouncementChannel;
