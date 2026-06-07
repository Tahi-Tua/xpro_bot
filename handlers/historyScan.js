const { ChannelType, EmbedBuilder, PermissionsBitField } = require("discord.js");
const { MODERATION_LOG_CHANNEL_ID, BUG_REPORTS_CHANNEL_ID, FILTER_EXEMPT_CHANNEL_IDS } = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");
const { analyzeBadwordContext } = require("../utils/openaiModeration");
const badwordsHandler = require("./badwords");
const spamHandler = require("./spam");

// The number of messages to scan per channel at startup. A value of 0
// disables the startup scan entirely. Scanning a large number of
// messages on every restart can trigger rate limits on Discord and slow
// down the bot, so the default is disabled. Set STARTUP_SCAN_LIMIT to enable.
const STARTUP_SCAN_LIMIT = Number(process.env.STARTUP_SCAN_LIMIT ?? 0);

// The maximum number of channels to scan at startup. If set to 0 or
// undefined, all scannable channels will be scanned.
const STARTUP_SCAN_CHANNEL_LIMIT = Number(process.env.STARTUP_SCAN_CHANNEL_LIMIT ?? 0);
const SCANNABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.AnnouncementThread,
]);

const FILTER_EXEMPT_SET = new Set(FILTER_EXEMPT_CHANNEL_IDS || []);

async function fetchChannelMessages(channel, limit) {
  const collected = [];
  let lastId;

  while (collected.length < limit) {
    const remaining = limit - collected.length;
    const batchSize = Math.min(100, remaining);
    const batch = await channel.messages
      .fetch({ limit: batchSize, before: lastId })
      .catch(() => null);

    if (!batch || batch.size === 0) break;

    const sorted = Array.from(batch.values()).sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );
    collected.push(...sorted);
    lastId = sorted[0]?.id;

    if (batch.size < batchSize) break;
  }

  return collected;
}

async function ensureMember(guild, userId, cache) {
  const cacheKey = `${guild.id}:${userId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const member = await guild.members.fetch(userId).catch(() => null);
  cache.set(cacheKey, member);
  return member;
}

async function logBadwordFinding(message, detectedWords, aiDecision) {
  const reportEmbed = await badwordsHandler.sendMemberBadwordReport(
    message.author,
    detectedWords,
    message.content || "",
    aiDecision,
  );

  const embed = reportEmbed || new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("Badword detected by startup history scan")
    .addFields(
      { name: "Member", value: `${message.author}`, inline: true },
      { name: "Channel", value: `${message.channel}`, inline: true },
      { name: "Words", value: detectedWords.join(", ") || "N/A" },
    )
    .setTimestamp();

  embed.addFields(
    { name: "Scan", value: "Startup history log-only mode", inline: true },
    { name: "Context reason", value: String(aiDecision?.reason || "No reason").slice(0, 1024), inline: false },
  );

  await badwordsHandler.sendModerationLog(message.guild, embed, message.author);
}

async function logSpamFinding(message, reasons) {
  const violationObjects = reasons.map((reason) => ({
    type: `Spam: ${reason}`,
    content: (message.content || "").substring(0, 100),
  }));

  violationObjects.forEach((violation) => {
    spamHandler.recordMemberViolation(message.author.id, message.author, violation);
  });

  const memberHistory = spamHandler.getMemberViolationHistory();
  const memberData = memberHistory.get(message.author.id);

  const reportEmbed =
    memberData && memberData.violations.length > 0
      ? await spamHandler.sendMemberViolationReport(message.author, memberData.violations, false)
      : null;

  const embed =
    reportEmbed ||
    new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("Spam detected by startup history scan")
      .addFields(
        { name: "Member", value: `${message.author}`, inline: true },
        { name: "Channel", value: `${message.channel}`, inline: true },
        { name: "Reasons", value: reasons.join("\n") || "N/A" },
      )
      .setTimestamp();

  embed.addFields({
    name: "Scan",
    value: "Startup history log-only mode",
    inline: true,
  });

  await badwordsHandler.sendModerationLog(message.guild, embed, message.author);
}

async function scanChannel(channel, client, memberCache) {
  if (!channel.viewable) return { scanned: 0, flagged: 0 };
  if (channel.id === MODERATION_LOG_CHANNEL_ID) return { scanned: 0, flagged: 0 };
  if (BUG_REPORTS_CHANNEL_ID && channel.id === BUG_REPORTS_CHANNEL_ID) return { scanned: 0, flagged: 0 };
  if (FILTER_EXEMPT_SET.has(channel.id)) return { scanned: 0, flagged: 0 };
  if (!SCANNABLE_CHANNEL_TYPES.has(channel.type)) {
    return { scanned: 0, flagged: 0 };
  }
  if (!channel.permissionsFor(client.user)?.has(PermissionsBitField.Flags.ReadMessageHistory)) {
    return { scanned: 0, flagged: 0 };
  }

  const messages = await fetchChannelMessages(channel, STARTUP_SCAN_LIMIT);
  let flagged = 0;

  for (const message of messages) {
    if (message.author?.bot) continue;
    if (!message.content) continue;

    const member = await ensureMember(channel.guild, message.author.id, memberCache);
    if (member && hasBypassRole(member)) continue;

    const content = message.content;

    if (badwordsHandler.containsBadWord(content)) {
      const detectedWords = badwordsHandler.findBadWords(content);
      if (detectedWords.length > 0) {
        const aiDecision = await analyzeBadwordContext({
          content,
          detectedWords,
          authorTag: message.author.tag,
          channelName: channel.name,
        });

        if (aiDecision.is_violation && aiDecision.action !== "ignore" && aiDecision.action !== "log_only") {
          flagged += 1;
          await logBadwordFinding(message, detectedWords, aiDecision);
          continue;
        }
      }
    }

    const spamReasons = spamHandler.detectSpamViolations(message);
    if (spamReasons.length > 0) {
      flagged += 1;
      await logSpamFinding(message, spamReasons);
    }
  }

  return { scanned: messages.length, flagged };
}

async function runStartupHistoryScan(client) {
  if (STARTUP_SCAN_LIMIT <= 0) {
    console.log("Startup scan disabled (STARTUP_SCAN_LIMIT <= 0)");
    return;
  }

  console.log(`Startup scan enabled in log-only mode: limit=${STARTUP_SCAN_LIMIT}`);

  const memberCache = new Map();

  for (const [, guild] of client.guilds.cache) {
    const channels = guild.channels.cache
      .filter((c) => SCANNABLE_CHANNEL_TYPES.has(c.type))
      .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

    let processed = 0;
    for (const [, channel] of channels) {
      if (STARTUP_SCAN_CHANNEL_LIMIT > 0 && processed >= STARTUP_SCAN_CHANNEL_LIMIT) break;
      processed += 1;

      const { scanned, flagged } = await scanChannel(channel, client, memberCache);
      if (scanned > 0) {
        console.log(
          `Startup scan: #${channel.name} (${channel.id}) -> ${flagged} issue(s) in ${scanned} messages`,
        );
      }
    }
  }
}

module.exports = { runStartupHistoryScan };
