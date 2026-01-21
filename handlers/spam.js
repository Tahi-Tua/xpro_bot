const { Events, EmbedBuilder } = require("discord.js");
const { GENERAL_CHAT_ID, BUG_REPORTS_CHANNEL_ID, FILTER_EXEMPT_CHANNEL_IDS, FILTER_ENFORCED_CATEGORY_IDS, ALLOWED_GLOBAL_MENTION_IDS } = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");
const { sendModerationLog } = require("./badwords");
const { increment: incViolations, getCount: getViolationCount, hasReachedThreshold, reset: resetViolations } = require("../utils/violationStore");
const { assignReadOnlyRole } = require("../utils/readOnlyRole");
const { READ_ONLY_THRESHOLD } = require("../config/channels");
const { sendToTelegram } = require("../utils/telegram");
const {
  ZERO_WIDTH_REGEX,
  stripDiacritics,
  normalizeSymbols,
  normalizeLeetspeak,
  compressRepeats,
  normalizeContentForSpam,
  buildTelegramMessage,
} = require("../utils/moderationUtils");
const muteStore = require("../utils/muteStore");

const FILTER_EXEMPT_SET = new Set(FILTER_EXEMPT_CHANNEL_IDS || []);
const FILTER_ENFORCED_CATEGORY_SET = new Set(FILTER_ENFORCED_CATEGORY_IDS || []);

// Convert config array to Set for O(1) lookups
const ALLOWED_GLOBAL_MENTION_SET = new Set(ALLOWED_GLOBAL_MENTION_IDS || []);

// Use the shared normalizeContent function for spam detection
const normalizeContent = normalizeContentForSpam;

const spamData = new Map();
const warningHistory = new Map();
const mutedUsers = new Set();
// Track violations per member along with the last time they violated.  The
// `lastUpdated` field will be used to purge inactive entries and avoid
// unbounded memory growth.
const memberViolationHistory = new Map();
const memberViolationStats = new Map(); // Track violation counts by type per member
const memberReportMessages = new Map(); // Store message IDs for updating reports

// All values can be overridden via environment variables prefixed with SPAM_
const CONFIG = {
  rateLimit: {
    windowMs: Number(process.env.SPAM_RATE_WINDOW_MS || 8000),
    maxMessages: Number(process.env.SPAM_RATE_MAX_MESSAGES || 5),
  },
  duplicateDetection: {
    windowMs: Number(process.env.SPAM_DUP_WINDOW_MS || 30000),
    maxDuplicates: Number(process.env.SPAM_DUP_MAX || 3),
  },
  mentionSpam: {
    maxMentions: Number(process.env.SPAM_MAX_MENTIONS || 5),
    maxRoleMentions: Number(process.env.SPAM_MAX_ROLE_MENTIONS || 2),
    maxEveryoneMentions: 1, // default cap; overridden by allowlist below
  },
  linkSpam: {
    maxLinks: Number(process.env.SPAM_MAX_LINKS || 3),
    windowMs: Number(process.env.SPAM_LINK_WINDOW_MS || 60000),
  },
  emojiSpam: {
    maxEmojis: Number(process.env.SPAM_MAX_EMOJIS || 15),
  },
  capsSpam: {
    enabled: process.env.SPAM_CAPS_ENABLED === "true",
    minLength: Number(process.env.SPAM_CAPS_MIN_LENGTH || 10),
    capsPercentage: Number(process.env.SPAM_CAPS_PERCENTAGE || 70),
  },
  inviteDetection: {
    enabled: process.env.SPAM_INVITE_ENABLED !== "false",
    allowedInvites: process.env.SPAM_ALLOWED_INVITES?.split(",").filter(Boolean) || [],
  },
  punishment: {
    warningsBeforeMute: Number(process.env.SPAM_WARNINGS_BEFORE_MUTE || 3),
    muteDurationMs: Number(process.env.SPAM_MUTE_DURATION_MS || 5 * 60 * 1000),
    warningResetMs: Number(process.env.SPAM_WARNING_RESET_MS || 60 * 60 * 1000),
  },
};

// Threshold for automatic 1-day mute based on total spam violations
const SPAM_MUTE_THRESHOLD = 10;
const SPAM_MUTE_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

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
      value: "This report is **actively being updated** as new violations are detected. Each time you violate rules, this report is updated to reflect your violation count. **Reaching 10+ violations triggers a 1-day mute.**",
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
  const isAllowedGlobalMention = ALLOWED_GLOBAL_MENTION_SET.has(message.author.id);
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
    const expiresAt = Date.now() + duration;
    
    if (mutedRole) {
      await member.roles.add(mutedRole);
      mutedUsers.add(member.id);
      
      // Persist mute state to survive bot restarts
      muteStore.recordMute(guild.id, member.id, expiresAt, reason);
      
      setTimeout(async () => {
        if (mutedUsers.has(member.id)) {
          await member.roles.remove(mutedRole).catch(() => {});
          mutedUsers.delete(member.id);
          muteStore.removeMute(guild.id, member.id);
        }
      }, duration);
      
      return true;
    } else {
      // Discord's native timeout - no need to persist as Discord handles it
      await member.timeout(duration, reason);
      return true;
    }
  } catch (error) {
    console.error(`Failed to mute ${member.user.tag}:`, error.message);
    return false;
  }
}

/**
 * Restore mutes from persisted state after bot restart.
 * Called once when the bot starts up.
 * @param {Client} client - Discord client
 */
async function restoreMutesFromState(client) {
  const allMutes = muteStore.getAllMutes();
  const now = Date.now();
  let restored = 0;
  let expired = 0;

  for (const [guildId, guildMutes] of Object.entries(allMutes)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const mutedRole = guild.roles.cache.find((r) => r.name.toLowerCase() === "muted");
    if (!mutedRole) continue;

    for (const [userId, muteData] of Object.entries(guildMutes)) {
      const { expiresAt } = muteData;
      const member = await guild.members.fetch(userId).catch(() => null);
      
      if (!member) {
        // User left the server, clean up
        muteStore.removeMute(guildId, userId);
        continue;
      }

      if (now >= expiresAt) {
        // Mute has expired, remove it
        await member.roles.remove(mutedRole).catch(() => {});
        muteStore.removeMute(guildId, userId);
        mutedUsers.delete(userId);
        expired++;
        console.log(`🔓 Expired mute lifted for ${member.user.tag} in ${guild.name}`);
      } else {
        // Mute still active, reschedule the timeout
        mutedUsers.add(userId);
        const remainingTime = expiresAt - now;
        
        setTimeout(async () => {
          if (mutedUsers.has(userId)) {
            const currentMember = await guild.members.fetch(userId).catch(() => null);
            if (currentMember) {
              await currentMember.roles.remove(mutedRole).catch(() => {});
            }
            mutedUsers.delete(userId);
            muteStore.removeMute(guildId, userId);
            console.log(`🔓 Scheduled mute lifted for ${userId} in ${guild.name}`);
          }
        }, remainingTime);
        
        restored++;
      }
    }
  }

  if (restored > 0 || expired > 0) {
    console.log(`🔇 Mute state restored: ${restored} active, ${expired} expired`);
  }
}

/**
 * Check if user has reached spam violation threshold and apply auto-mute
 * Sends notification to user and logs to moderation channel
 */
async function checkAndApplySpamThresholdMute(member, guild, totalViolations) {
  try {
    if (totalViolations >= SPAM_MUTE_THRESHOLD && !mutedUsers.has(member.id)) {
      // Apply 1-day mute
      const muted = await applyMute(
        member,
        guild,
        `Automatic mute: ${SPAM_MUTE_THRESHOLD}+ spam violations`,
        SPAM_MUTE_DURATION_MS
      );
      
      if (muted) {
        // Send DM to the member
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("🔇 Vous avez été muté automatiquement")
            .setDescription(`Vous avez atteint **${totalViolations} violations de spam** et avez été muté pour **1 jour**.\n\n⚠️ **Votre compteur sera réinitialisé à 0 après le délai.**`)
            .addFields(
              { name: "Raison", value: "Dépassement du seuil de violations de spam (10+)", inline: false },
              { name: "Durée", value: "24 heures", inline: true },
              { name: "Violations totales", value: `${totalViolations}`, inline: true }
            )
            .setFooter({ text: "Veuillez respecter les règles du serveur" })
            .setTimestamp();
          
          await member.send({ embeds: [dmEmbed] }).catch(() => {
            console.log(`Could not DM ${member.user.tag} about spam threshold mute`);
          });
        } catch (dmError) {
          console.error(`Failed to send DM to ${member.user.tag}:`, dmError.message);
        }
        
        // Log to moderation channel
        const logEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🔇 Mute Automatique - Seuil de Spam Atteint")
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: "Membre", value: `${member.user.tag} (${member.id})`, inline: true },
            { name: "Violations Totales", value: `**${totalViolations}**`, inline: true },
            { name: "Seuil", value: `${SPAM_MUTE_THRESHOLD}`, inline: true },
            { name: "Durée du Mute", value: "1 jour (24 heures)", inline: false },
            { name: "Raison", value: "Dépassement automatique du seuil de violations de spam (10+)", inline: false },
            { name: "Note", value: "⚠️ Le compteur sera réinitialisé après le délai", inline: false }
          )
          .setFooter({ text: "Système de Modération Automatique" })
          .setTimestamp();
        
        await sendModerationLog(guild, logEmbed, member.user);
        
        // Reset violation counter after mute duration
        setTimeout(() => {
          resetViolations(member.id);
          console.log(`✅ Compteur de spam réinitialisé pour ${member.user.tag} (${member.id}) après le délai de mute`);
          
          // Send notification to user about reset
          const resetEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("✅ Compteur de violations réinitialisé")
            .setDescription("Votre période de mute est terminée et votre compteur de violations de spam a été réinitialisé à **0**.")
            .addFields(
              { name: "Message", value: "Vous pouvez maintenant recommencer avec un compteur propre. Veuillez respecter les règles du serveur.", inline: false }
            )
            .setFooter({ text: "Système de Modération Automatique" })
            .setTimestamp();
          
          member.send({ embeds: [resetEmbed] }).catch(() => {
            console.log(`Could not DM ${member.user.tag} about violation reset`);
          });
          
          // Clear violation history
          memberViolationHistory.delete(member.id);
          memberViolationStats.delete(member.id);
        }, SPAM_MUTE_DURATION_MS);
        
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error(`Failed to apply spam threshold mute for ${member.user.tag}:`, error.message);
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
    const totalViolations = incViolations(message.author.id, violationObjects.length);
    
    // Check if user should be auto-muted for reaching spam threshold (20+ violations)
    const spamThresholdMuted = await checkAndApplySpamThresholdMute(
      message.member,
      message.guild,
      totalViolations
    );
    
    // Update punishment message if threshold mute was applied
    if (spamThresholdMuted) {
      punishment = `Auto-Muted for 1 day (${totalViolations} total spam violations)`;
    }
    
    // Build unified violation report for the moderation channel
    const memberData = memberViolationHistory.get(message.author.id);
    const reportEmbed = memberData && memberData.violations.length > 0 
      ? await sendMemberViolationReport(message.author, memberData.violations, true)
      : null;
    
    const logEmbed = reportEmbed || new EmbedBuilder()
      .setColor(shouldMute || spamThresholdMuted ? 0xff0000 : 0xffa500)
      .setTitle(spamThresholdMuted ? "🔇 Auto-Mute - Spam Threshold" : (shouldMute ? "🔇 Auto-Mute Applied" : "🚨 Spam Detected"))
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: "Channel", value: `${message.channel}`, inline: true },
        { name: "Warnings", value: `${warningCount}/${CONFIG.punishment.warningsBeforeMute}`, inline: true },
        { name: "Total Spam Violations", value: `**${totalViolations}**`, inline: true },
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

    // Safety cleanup: clear mutedUsers entries that have no corresponding violation history
    // This handles edge cases where the bot restarted or data got out of sync
    for (const mutedUserId of mutedUsers) {
      if (!memberViolationHistory.has(mutedUserId)) {
        mutedUsers.delete(mutedUserId);
      }
    }
  }, 5 * 60 * 1000);
  
  // Restore mutes from persisted state on startup
  client.once(Events.ClientReady, async () => {
    try {
      await restoreMutesFromState(client);
    } catch (err) {
      console.error("❌ Error restoring mute state:", err.message);
    }
  });
};

module.exports.detectSpamViolations = detectSpamViolations;
module.exports.recordMemberViolation = recordMemberViolation;
module.exports.getMemberViolationHistory = () => memberViolationHistory;
module.exports.sendMemberViolationReport = sendMemberViolationReport;
module.exports.restoreMutesFromState = restoreMutesFromState;
