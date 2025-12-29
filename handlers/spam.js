const { Events, EmbedBuilder } = require("discord.js");
const { GENERAL_CHAT_ID, BUG_REPORTS_CHANNEL_ID, FILTER_EXEMPT_CHANNEL_IDS, FILTER_ENFORCED_CATEGORY_IDS } = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");
const { sendModerationLog } = require("./badwords");
const { increment: incViolations, getCount: getViolationCount, hasReachedThreshold } = require("../utils/violationStore");
const { assignReadOnlyRole } = require("../utils/readOnlyRole");
const { READ_ONLY_THRESHOLD } = require("../config/channels");
const { sendToTelegram } = require("../utils/telegram");

const FILTER_EXEMPT_SET = new Set(FILTER_EXEMPT_CHANNEL_IDS || []);
const FILTER_ENFORCED_CATEGORY_SET = new Set(FILTER_ENFORCED_CATEGORY_IDS || []);

// Telegram message length limit (4096 chars). Use 4000 for safety margin.
const TELEGRAM_MAX_LENGTH = 4000;

// IDs allowed to use @everyone/@here without triggering spam
const ALLOWED_GLOBAL_MENTION_IDS = new Set([
  "1380247716596023317", // ҲƤƦƠ ԼЄƛƊЄƦ 🌟
]);

/**
 * Build a Telegram message respecting the 4096 character limit.
 * Truncates content intelligently to fit within bounds.
 * @param {Object} parts - Message parts with metadata and content
 * @returns {string} Message guaranteed to be under TELEGRAM_MAX_LENGTH
 */
function buildTelegramMessage(parts) {
  const { prefix = '', author = '', authorId = '', channel = '', violations = '', action = '', content = '' } = parts;
  
  // Build metadata (fixed parts)
  const metadata = `${prefix}\n👤 ${author.slice(0, 50)} (${authorId})\n#️⃣ #${channel.slice(0, 50)}${violations ? `\n⚠️ ${violations.slice(0, 200)}` : ''}${action ? `\n📝 Action: ${action.slice(0, 100)}` : ''}\n📄 `;
  
  // Calculate remaining space for content
  const remainingSpace = TELEGRAM_MAX_LENGTH - metadata.length - 10; // 10 char safety
  
  // Truncate content to fit
  const truncatedContent = remainingSpace > 50 
    ? content.slice(0, remainingSpace) + (content.length > remainingSpace ? '…' : '')
    : '(message too long)';
  
  return metadata + (truncatedContent || '(empty)');
}

// Lightweight text normalizer to catch obfuscated spam/badwords (zero-width chars, leetspeak, stretched letters)
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;
const stripDiacritics = (str) => str.normalize("NFD").replace(/\p{Diacritic}+/gu, "");
const normalizeLeetspeak = (str) =>
  str
    .replace(/0/g, "o")
    .replace(/[1l!|]/g, "i")
    .replace(/[3?]/g, "e")
    .replace(/4|@/g, "a")
    .replace(/5|\$/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g");
const normalizeSymbols = (str) =>
  str
    .replace(/\s+/g, " ")
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(/[\-_.,/\\\\+*=~`'"()\[\]{}<>^%$#@!?;:|]/g, " ");
const compressRepeats = (str, maxRepeats = 2) => str.replace(/(.)\1{2,}/g, (_, ch) => ch.repeat(maxRepeats));
const normalizeContent = (text) => {
  const lowered = (text || "").toLowerCase();
  const noDiacritics = stripDiacritics(lowered);
  const noSymbols = normalizeSymbols(noDiacritics);
  const leetFixed = normalizeLeetspeak(noSymbols);
  return leetFixed.trim();
};

const spamData = new Map();
const warningHistory = new Map();
const mutedUsers = new Set();
// Track violations per member along with the last time they violated.  The
// `lastUpdated` field will be used to purge inactive entries and avoid
// unbounded memory growth.
const memberViolationHistory = new Map();
const memberViolationStats = new Map(); // Track violation counts by type per member
const memberReportMessages = new Map(); // Store message IDs for updating reports

const CONFIG = {
  rateLimit: {
    windowMs: 8000,
    maxMessages: 5,
  },
  duplicateDetection: {
    windowMs: 30000,
    maxDuplicates: 3,
  },
  mentionSpam: {
    maxMentions: 5,
    maxRoleMentions: 2,
    maxEveryoneMentions: 1, // default cap; overridden by allowlist below
  },
  linkSpam: {
    maxLinks: 3,
    windowMs: 60000,
  },
  emojiSpam: {
    maxEmojis: 15,
  },
  capsSpam: {
    enabled: false,
    minLength: 10,
    capsPercentage: 70,
  },
  inviteDetection: {
    enabled: true,
    allowedInvites: [],
  },
  punishment: {
    warningsBeforeMute: 3,
    muteDurationMs: 5 * 60 * 1000,
    warningResetMs: 60 * 60 * 1000,
  },
};

// Memory management: Reduce retention to 2 hours (down from 6) to limit memory
// usage on active servers. This prevents unbounded memory growth while still
// maintaining sufficient history for moderation tracking.
const VIOLATION_HISTORY_RETENTION_MS = 2 * 60 * 60 * 1000;

// Maximum number of entries allowed in each Map to prevent memory exhaustion.
// When limit is reached, oldest entries are evicted. Set to 5000 users which
// is reasonable for most Discord servers while preventing unbounded growth.
const MAX_MAP_ENTRIES = 5000;

const DISCORD_INVITE_REGEX = /(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/gi;
const URL_REGEX = /https?:\/\/[^\s]+/gi;
const EMOJI_REGEX = /<a?:[a-zA-Z0-9_]+:\d+>|[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;

const GIF_HOSTS = [
  "tenor.com",
  "media.tenor.com",
  "giphy.com",
  "media.giphy.com",
];

function getUserData(userId) {
  if (!spamData.has(userId)) {
    spamData.set(userId, {
      messages: [],
      recentMessages: [],
      linkCount: 0,
      linkWindowStart: Date.now(),
    });
    // Enforce size limit after adding new entry
    enforceMapSizeLimit(spamData);
  }
  return spamData.get(userId);
}

async function sendMemberViolationReport(user, violations, isSpamViolation = false) {
  try {
    const userId = user.id;
    const stats = memberViolationStats.get(userId) || {};
    
    // Count violation types
    let badWordCount = 0;
    let spamCount = 0;
    const typeBreakdown = {};
    
    violations.forEach(v => {
      if (v.type.includes("Bad Words")) {
        badWordCount++;
      } else if (v.type.includes("Insult")) {
        if (!typeBreakdown["Insults"]) typeBreakdown["Insults"] = 0;
        typeBreakdown["Insults"]++;
      } else {
        spamCount++;
        if (!typeBreakdown[v.type]) typeBreakdown[v.type] = 0;
        typeBreakdown[v.type]++;
      }
    });
    
    const totalViolations = violations.length;
    const reportType = isSpamViolation ? "🔴 Real-time Spam Detection" : "🔵 History Scan";
    
    const report = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("📋 Your Violation Report")
      .setDescription(`Report Type: **${reportType}**\nStatus: **ACTIVE MONITORING**`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { 
          name: "👤 Member", 
          value: `${user}`, 
          inline: true 
        },
        { 
          name: "🔢 Total Violations", 
          value: `**${totalViolations}**`, 
          inline: true 
        },
        { 
          name: "📅 Last Updated", 
          value: new Date().toLocaleTimeString(), 
          inline: true 
        }
      );

    // Add violation breakdown
    if (badWordCount > 0) {
      report.addFields({
        name: "🔴 Bad Words/Insults",
        value: `**${badWordCount}** violation${badWordCount !== 1 ? 's' : ''}`,
        inline: true
      });
    }
    if (spamCount > 0) {
      report.addFields({
        name: "🟠 Spam Violations",
        value: `**${spamCount}** violation${spamCount !== 1 ? 's' : ''}`,
        inline: true
      });
    }

    // Add detailed type breakdown
    if (Object.keys(typeBreakdown).length > 0) {
      const breakdownText = Object.entries(typeBreakdown)
        .map(([type, count]) => `• ${type}: **${count}**`)
        .join("\n");
      
      report.addFields({
        name: "📊 Type Breakdown",
        value: breakdownText,
        inline: false
      });
    }

    if (violations.length > 0) {
      const violationsList = violations
        .slice(0, 8)
        .map((v, i) => `**${i + 1}.** ${v.type}\n└─ *${v.content.substring(0, 70)}${v.content.length > 70 ? '...' : ''}*`)
        .join("\n\n");
      
      report.addFields({
        name: "🚨 Recent Violations",
        value: violationsList,
        inline: false
      });
    }

    report.addFields({
      name: "⚠️ Warning",
      value: "This report is **actively being updated** as new violations are detected. Each time you violate rules, this report is updated to reflect your violation count.",
      inline: false
    });

    report
      .setFooter({ text: "Automated Moderation System • Member-Spam Channel" })
      .setTimestamp();

    return report;
  } catch (err) {
    console.error(`Failed to create violation report for ${user.tag}:`, err.message);
    return null;
  }
}

function recordMemberViolation(userId, user, violation) {
  const now = Date.now();
  if (!memberViolationHistory.has(userId)) {
    memberViolationHistory.set(userId, {
      user: user,
      violations: [],
      lastUpdated: now,
    });
  }
  const history = memberViolationHistory.get(userId);
  // Add violation to history
  history.violations.push(violation);
  // Update last activity timestamp to allow cleanup later
  history.lastUpdated = now;
  
  // Track violation stats by type
  if (!memberViolationStats.has(userId)) {
    memberViolationStats.set(userId, {});
  }
  
  const stats = memberViolationStats.get(userId);
  const typeKey = violation.type;
  stats[typeKey] = (stats[typeKey] || 0) + 1;

  // Enforce size limit on Maps to prevent unbounded memory growth
  enforceMapSizeLimit(memberViolationHistory);
  enforceMapSizeLimit(memberViolationStats);
}

/**
 * Enforce maximum size limit on a Map by evicting oldest entries (LRU).
 * This prevents memory exhaustion on high-activity servers.
 * @param {Map} map - The Map to limit
 */
function enforceMapSizeLimit(map) {
  if (map.size <= MAX_MAP_ENTRIES) return;

  // Find oldest entries by lastUpdated timestamp
  const entries = Array.from(map.entries());
  
  // For Maps without lastUpdated field, sort by insertion order (first entries are oldest)
  // For Maps with lastUpdated, sort by that timestamp
  const sortedEntries = entries.sort((a, b) => {
    const aTime = a[1]?.lastUpdated ?? a[1]?.lastWarning ?? 0;
    const bTime = b[1]?.lastUpdated ?? b[1]?.lastWarning ?? 0;
    return aTime - bTime;
  });

  // Remove oldest 10% of entries to create headroom
  const toRemove = Math.floor(MAX_MAP_ENTRIES * 0.1);
  for (let i = 0; i < toRemove; i++) {
    map.delete(sortedEntries[i][0]);
  }
}

function addWarning(userId) {
  const now = Date.now();
  const history = warningHistory.get(userId) || { count: 0, lastWarning: 0 };
  
  if (now - history.lastWarning > CONFIG.punishment.warningResetMs) {
    history.count = 1;
  } else {
    history.count++;
  }
  history.lastWarning = now;
  warningHistory.set(userId, history);
  
  // Enforce size limit to prevent memory exhaustion
  enforceMapSizeLimit(warningHistory);
  
  return history.count;
}

function getWarningCount(userId) {
  const history = warningHistory.get(userId);
  if (!history) return 0;
  
  if (Date.now() - history.lastWarning > CONFIG.punishment.warningResetMs) {
    warningHistory.delete(userId);
    return 0;
  }
  return history.count;
}

function checkRateLimit(userData, now) {
  const validMessages = userData.messages.filter(
    (ts) => now - ts < CONFIG.rateLimit.windowMs
  );
  userData.messages = validMessages;
  userData.messages.push(now);
  
  return userData.messages.length > CONFIG.rateLimit.maxMessages;
}

function checkDuplicateMessages(userData, content, now) {
  const validRecent = userData.recentMessages.filter(
    (msg) => now - msg.timestamp < CONFIG.duplicateDetection.windowMs
  );
  userData.recentMessages = validRecent;
  
  // Normalize to catch "ffuucckk" vs "fuck" duplicates
  const normalized = compressRepeats(normalizeContent(content));
  const duplicates = userData.recentMessages.filter(
    (msg) => msg.content === normalized
  );
  
  userData.recentMessages.push({ content: normalized, timestamp: now });
  
  return duplicates.length >= CONFIG.duplicateDetection.maxDuplicates - 1;
}

function checkMentionSpam(message) {
  const userMentions = message.mentions.users.size;
  const roleMentions = message.mentions.roles.size;
  const everyoneMentions = message.mentions.everyone ? 1 : 0;
  const isAllowedGlobalMention = ALLOWED_GLOBAL_MENTION_IDS.has(message.author.id);
  const totalMentions = userMentions + roleMentions + (isAllowedGlobalMention ? 0 : everyoneMentions);
  
  // Block @everyone/@here unless explicitly allowed
  if (everyoneMentions > 0 && !isAllowedGlobalMention) {
    return { triggered: true, reason: "@everyone/@here mention not allowed" };
  }
  if (!isAllowedGlobalMention && everyoneMentions > CONFIG.mentionSpam.maxEveryoneMentions) {
    return { triggered: true, reason: `@everyone/@here mention (limit ${CONFIG.mentionSpam.maxEveryoneMentions})` };
  }
  if (totalMentions > CONFIG.mentionSpam.maxMentions) {
    return { triggered: true, reason: `${totalMentions} total mentions` };
  }
  if (roleMentions > CONFIG.mentionSpam.maxRoleMentions) {
    return { triggered: true, reason: `${roleMentions} role mentions` };
  }
  
  return { triggered: false };
}

function checkLinkSpam(userData, content, now) {
  const links = content.match(URL_REGEX) || [];
  const nonGifLinks = links.filter((link) => !isGifLink(link));
  
  if (now - userData.linkWindowStart > CONFIG.linkSpam.windowMs) {
    userData.linkCount = 0;
    userData.linkWindowStart = now;
  }
  
  userData.linkCount += nonGifLinks.length;
  
  return userData.linkCount > CONFIG.linkSpam.maxLinks;
}

function checkInviteLinks(content) {
  if (!CONFIG.inviteDetection.enabled) return { triggered: false };
  
  const invites = content.match(DISCORD_INVITE_REGEX);
  if (!invites) return { triggered: false };
  
  const unauthorized = invites.filter(
    (inv) => !CONFIG.inviteDetection.allowedInvites.some((allowed) => inv.includes(allowed))
  );
  
  return {
    triggered: unauthorized.length > 0,
    invites: unauthorized,
  };
}

function checkEmojiSpam(content) {
  const emojis = content.match(EMOJI_REGEX) || [];
  return emojis.length > CONFIG.emojiSpam.maxEmojis;
}

function isGifLink(link) {
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    
    if (path.endsWith(".gif")) return true;
    return GIF_HOSTS.some((gifHost) => host === gifHost || host.endsWith(`.${gifHost}`));
  } catch {
    return false;
  }
}

function checkCapsSpam(content) {
  if (CONFIG.capsSpam.enabled === false) return false;
  const raw = (content || "").replace(ZERO_WIDTH_REGEX, "");
  const letters = stripDiacritics(raw).replace(/[^A-Za-z]/g, "");
  if (letters.length < CONFIG.capsSpam.minLength) return false;
  
  const capsCount = (letters.match(/[A-Z]/g) || []).length;
  const percentage = (capsCount / letters.length) * 100;
  
  return percentage >= CONFIG.capsSpam.capsPercentage;
}

function checkStretchedText(content) {
  const normalized = normalizeContent(content);
  if (normalized.length < 6) return { triggered: false };
  const compressed = compressRepeats(normalized);
  // If compressing reduces length a lot, it's likely stretched spam
  const reductionRatio = compressed.length / Math.max(normalized.length, 1);
  if (reductionRatio <= 0.55) {
    return { triggered: true, reason: "Stretched characters/letters" };
  }
  return { triggered: false };
}

function detectSpamViolations(message) {
  const content = message.content || "";
  const violations = [];

  const mentionCheck = checkMentionSpam(message);
  if (mentionCheck.triggered) {
    violations.push(`Mention spam: ${mentionCheck.reason}`);
  }

  const links = content.match(URL_REGEX) || [];
  const nonGifLinks = links.filter((link) => !isGifLink(link));
  if (nonGifLinks.length > CONFIG.linkSpam.maxLinks) {
    violations.push("Link spam (too many links)");
  }

  const inviteCheck = checkInviteLinks(content);
  if (inviteCheck.triggered) {
    violations.push(`Unauthorized Discord invite: ${inviteCheck.invites.join(", ")}`);
  }

  if (checkEmojiSpam(content)) {
    violations.push("Emoji spam (excessive emojis)");
  }

  if (checkCapsSpam(content)) {
    violations.push("Caps spam (excessive capitals)");
  }

  const stretchedCheck = checkStretchedText(content);
  if (stretchedCheck.triggered) {
    violations.push(stretchedCheck.reason);
  }

  return violations;
}

async function applyMute(member, guild, reason, duration) {
  try {
    const mutedRole = guild.roles.cache.find((r) => r.name.toLowerCase() === "muted");
    
    if (mutedRole) {
      await member.roles.add(mutedRole);
      mutedUsers.add(member.id);
      
      setTimeout(async () => {
        if (mutedUsers.has(member.id)) {
          await member.roles.remove(mutedRole).catch(() => {});
          mutedUsers.delete(member.id);
        }
      }, duration);
      
      return true;
    } else {
      await member.timeout(duration, reason);
      return true;
    }
  } catch (error) {
    console.error(`Failed to mute ${member.user.tag}:`, error.message);
    return false;
  }
}

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    if (BUG_REPORTS_CHANNEL_ID && message.channel.id === BUG_REPORTS_CHANNEL_ID) return;
    const isInEnforcedCategory =
      FILTER_ENFORCED_CATEGORY_SET.has(message.channel.parentId) ||
      FILTER_ENFORCED_CATEGORY_SET.has(message.channel.parent?.parentId);
    if (!isInEnforcedCategory && FILTER_EXEMPT_SET.has(message.channel.id)) return;
    if (hasBypassRole(message.member)) return;
    
    const now = Date.now();
    const userData = getUserData(message.author.id);
    const content = message.content;
    const violations = [];
    
    if (checkRateLimit(userData, now)) {
      violations.push("Rate limit exceeded (too many messages)");
    }
    
    if (content.length > 0 && checkDuplicateMessages(userData, content, now)) {
      violations.push("Duplicate message spam");
    }
    
    const mentionCheck = checkMentionSpam(message);
    if (mentionCheck.triggered) {
      violations.push(`Mention spam: ${mentionCheck.reason}`);
    }
    
    if (checkLinkSpam(userData, content, now)) {
      violations.push("Link spam (too many links)");
    }
    
    const inviteCheck = checkInviteLinks(content);
    if (inviteCheck.triggered) {
      violations.push(`Unauthorized Discord invite: ${inviteCheck.invites.join(", ")}`);
    }
    
    if (checkEmojiSpam(content)) {
      violations.push("Emoji spam (excessive emojis)");
    }
    
    if (checkCapsSpam(content)) {
      violations.push("Caps spam (excessive capitals)");
    }

    const stretchedCheck = checkStretchedText(content);
    if (stretchedCheck.triggered) {
      violations.push(stretchedCheck.reason);
    }
    
    if (violations.length === 0) return;
    
    const shouldDeleteMessage = message.channel.id !== GENERAL_CHAT_ID;
    if (shouldDeleteMessage) {
      await message.delete().catch(() => {});
    }
    
    const warningCount = addWarning(message.author.id);
    const shouldMute = warningCount >= CONFIG.punishment.warningsBeforeMute;
    
    let punishment = "Warning";
    if (shouldMute) {
      const muteDuration = CONFIG.punishment.muteDurationMs;
      const muted = await applyMute(
        message.member,
        message.guild,
        violations.join(", "),
        muteDuration
      );
      
      if (muted) {
        punishment = `Muted for ${muteDuration / 60000} minutes`;
        warningHistory.delete(message.author.id);
      }
    }
    
    // Record violations for the member
    const violationObjects = violations.map(v => ({
      type: `🟠 ${v}`,
      content: content.substring(0, 100)
    }));
    violationObjects.forEach(v => {
      recordMemberViolation(message.author.id, message.author, v);
    });
    // Persist violation count
    incViolations(message.author.id, violationObjects.length);
    
    // Build unified violation report for the moderation channel
    const memberData = memberViolationHistory.get(message.author.id);
    const reportEmbed = memberData && memberData.violations.length > 0 
      ? await sendMemberViolationReport(message.author, memberData.violations, true)
      : null;
    
    const logEmbed = reportEmbed || new EmbedBuilder()
      .setColor(shouldMute ? 0xff0000 : 0xffa500)
      .setTitle(shouldMute ? "🔇 Auto-Mute Applied" : "🚨 Spam Detected")
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: "Channel", value: `${message.channel}`, inline: true },
        { name: "Warnings", value: `${warningCount}/${CONFIG.punishment.warningsBeforeMute}`, inline: true },
        { name: "Violations", value: violations.join("\n") },
        { name: "Action", value: shouldDeleteMessage ? punishment : `${punishment} (message kept)` },
        { name: "Message Preview", value: content.substring(0, 200) || "(empty)" }
      )
      .setTimestamp();
    
    await sendModerationLog(message.guild, logEmbed, message.author);
    // Check for read-only threshold and assign role if needed
    try {
      const total = getViolationCount(message.author.id);
      if (hasReachedThreshold(message.author.id, READ_ONLY_THRESHOLD)) {
        await assignReadOnlyRole(message.member, total);
      }
    } catch (err) {
      console.warn("⚠️ Read-only assignment check failed:", err.message);
    }

    if (typeof sendToTelegram === 'function') {
      const telegramMessage = buildTelegramMessage({
        prefix: '🚨 Spam detected',
        author: message.author.tag,
        authorId: message.author.id,
        channel: message.channel.name,
        violations: violations.join(", "),
        action: punishment,
        content: content
      });
      sendToTelegram(telegramMessage, { parse_mode: 'Markdown' });
    }
  });
  
  setInterval(() => {
    const now = Date.now();
    // Cleanup spamData entries where no activity has occurred recently
    for (const [userId, data] of spamData.entries()) {
      const hasRecentActivity =
        data.messages.some((ts) => now - ts < 60_000) ||
        data.recentMessages.some((msg) => now - msg.timestamp < 60_000);

      if (!hasRecentActivity) {
        spamData.delete(userId);
      }
    }

    // Cleanup violation history and stats if there has been no activity
    for (const [userId, history] of memberViolationHistory.entries()) {
      if (now - history.lastUpdated > VIOLATION_HISTORY_RETENTION_MS) {
        memberViolationHistory.delete(userId);
        memberViolationStats.delete(userId);
        // Also remove any report messages associated with this user
        memberReportMessages.delete(userId);
        // Remove from muted set if present
        mutedUsers.delete(userId);
      }
    }
  }, 5 * 60 * 1000);
};

module.exports.detectSpamViolations = detectSpamViolations;
module.exports.recordMemberViolation = recordMemberViolation;
module.exports.getMemberViolationHistory = () => memberViolationHistory;
module.exports.sendMemberViolationReport = sendMemberViolationReport;
