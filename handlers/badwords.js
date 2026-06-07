const fs = require("fs");
const path = require("path");
const { Events, EmbedBuilder } = require("discord.js");
const {
  MODERATION_LOG_CHANNEL_ID,
  MOD_ROLE_NAME,
  BUG_REPORTS_CHANNEL_ID,
  FILTER_EXEMPT_CHANNEL_IDS,
  FILTER_ENFORCED_CHANNEL_IDS,
  FILTER_ENFORCED_CATEGORY_IDS,
} = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");
const { increment: incViolations, getCount: getViolationCount, hasReachedThreshold } = require("../utils/violationStore");
const { assignReadOnlyRole } = require("../utils/readOnlyRole");
const { READ_ONLY_THRESHOLD } = require("../config/channels");
const { analyzeBadwordContext } = require("../utils/openaiModeration");
const {
  ZERO_WIDTH_REGEX,
  stripDiacritics,
  normalizeSymbols,
  normalizeContentForBadwords,
} = require("../utils/moderationUtils");

const FILTER_EXEMPT_SET = new Set(FILTER_EXEMPT_CHANNEL_IDS || []);
const FILTER_ENFORCED_CHANNEL_SET = new Set(FILTER_ENFORCED_CHANNEL_IDS || []);
const FILTER_ENFORCED_CATEGORY_SET = new Set(FILTER_ENFORCED_CATEGORY_IDS || []);

const badwordsJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "utils", "badwords.json"), "utf8"),
).words;

function loadTxtBadwords() {
  const txtPath = path.join(__dirname, "..", "utils", "badwords-list.txt");
  try {
    const raw = fs.readFileSync(txtPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter((w) => w && !w.startsWith("#"));
  } catch (err) {
    console.warn("?? badwords-list.txt not found or unreadable:", err.message);
    return [];
  }
}

const badwordsTxt = loadTxtBadwords();
const badwords = Array.from(new Set([...badwordsJson, ...badwordsTxt]));

// Split into single-word vs multi-word phrases
const singleWordList = [];
const phraseList = [];
badwords.forEach((entry) => {
  const trimmed = entry.trim();
  if (!trimmed) return;
  if (/\s+/.test(trimmed)) {
    phraseList.push(trimmed);
  } else {
    singleWordList.push(trimmed);
  }
});

// Helper to escape regex special characters
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Normalize a single word/token for badword lookup.
 * This ensures consistent normalization between the lookup table and detection.
 * @param {string} word - The word to normalize
 * @returns {string} Normalized word (lowercase, no diacritics, alphanumeric only)
 */
function normalizeToken(word) {
  return stripDiacritics(word.toLowerCase())
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(/[^a-z0-9]/g, "");
}

// Exact lookup table (word -> original from file) after simple normalization
const normalizedBadwords = new Set();
const badwordLookup = new Map();
singleWordList.forEach((word) => {
  const normalized = normalizeToken(word);
  if (!normalized) return;
  normalizedBadwords.add(normalized);
  badwordLookup.set(normalized, word);
});

const normalizedPhrases = [];
const phraseLookup = new Map();
const phraseRegexes = [];
phraseList.forEach((phrase) => {
  const normalized = normalizeSymbols(stripDiacritics(phrase.toLowerCase()));
  if (!normalized) return;
  normalizedPhrases.push(normalized);
  phraseLookup.set(normalized, phrase);
  phraseRegexes.push({ regex: new RegExp(`(^|\\s)${escapeRegex(normalized)}(\\s|$)`), original: phrase });
});

const memberBadwordStats = new Map(); // Track bad word violations per member
const memberBadwordHistory = new Map(); // Track all bad word violations per member
const memberBadwordReports = new Map(); // Store report message IDs for updating in DMs
const memberModLogMessages = new Map(); // Store moderation log message IDs for updating
const memberBadwordLastUpdated = new Map(); // Track last violation timestamp per member

// Prevent unbounded memory usage for long-running processes.
// Defaults mirror spam.js retention unless overridden via env.
const BADWORD_HISTORY_RETENTION_MS = Number(
  process.env.BADWORD_HISTORY_RETENTION_MS ?? 6 * 60 * 60 * 1000,
);
const BADWORD_HISTORY_MAX_ENTRIES = Number(process.env.BADWORD_HISTORY_MAX_ENTRIES ?? 50);
const BADWORD_CLEANUP_INTERVAL_MS = Number(
  process.env.BADWORD_CLEANUP_INTERVAL_MS ?? 5 * 60 * 1000,
);

let badwordsCleanupInterval = null;

function purgeExpiredBadwordEntries(now = Date.now()) {
  let purged = 0;

  for (const [userId, lastUpdated] of memberBadwordLastUpdated.entries()) {
    if (now - lastUpdated <= BADWORD_HISTORY_RETENTION_MS) continue;

    memberBadwordLastUpdated.delete(userId);
    memberBadwordStats.delete(userId);
    memberBadwordHistory.delete(userId);
    memberBadwordReports.delete(userId);
    memberModLogMessages.delete(userId);
    purged += 1;
  }

  return purged;
}

function getBadwordCacheStats() {
  return {
    retentionMs: BADWORD_HISTORY_RETENTION_MS,
    stats: memberBadwordStats.size,
    history: memberBadwordHistory.size,
    reports: memberBadwordReports.size,
    modLogs: memberModLogMessages.size,
    lastUpdated: memberBadwordLastUpdated.size,
  };
}

// Use the shared normalizeContentForBadwords function
const normalizeContent = normalizeContentForBadwords;

// Remove URLs from text to avoid false positives
function removeUrls(text) {
  // Remove common URL patterns (http, https, discord links, etc.)
  return text.replace(/https?:\/\/[^\s]+/gi, " ")
             .replace(/discord\.gg\/[^\s]+/gi, " ")
             .replace(/www\.[^\s]+/gi, " ");
}

/**
 * Tokenize text into normalized words for badword detection.
 * Uses the same normalizeToken function as the lookup table for consistency.
 * @param {string} text - The text to tokenize
 * @returns {string[]} Array of normalized tokens
 */
function tokenizeNormalizedWords(text) {
  const withoutUrls = removeUrls(text);
  const normalized = normalizeContent(withoutUrls);
  // Extract alphanumeric tokens - this matches normalizeToken's output
  return normalized.match(/[a-z0-9]+/g) || [];
}

function containsBadWord(text) {
  if (!text) return false;
  const words = tokenizeNormalizedWords(text);

  for (const word of words) {
    if (normalizedBadwords.has(word)) {
      return true; // match must be on the entire token, not a substring
    }
  }

  // Detect multi-word phrases with boundary-aware matching on normalized text
  const normalizedPhraseText = normalizeSymbols(stripDiacritics(removeUrls(text).toLowerCase()));
  for (const { regex } of phraseRegexes) {
    if (regex.test(normalizedPhraseText)) {
      return true;
    }
  }
  return false;
}

function findBadWords(text) {
  if (!text) return [];
  const matched = new Set();

  const words = tokenizeNormalizedWords(text);

  for (const word of words) {
    const exactMatch = badwordLookup.get(word);
    if (exactMatch) matched.add(exactMatch);
  }

  const normalizedPhraseText = normalizeSymbols(stripDiacritics(removeUrls(text).toLowerCase()));
  for (const { regex, original } of phraseRegexes) {
    if (regex.test(normalizedPhraseText)) {
      matched.add(original);
    }
  }
  
  return Array.from(matched);
}

async function sendModerationLog(guild, embed, user) {
  console.log(`📋 Sending moderation log to channel ID: ${MODERATION_LOG_CHANNEL_ID}`);
  const channel = guild.channels.cache.get(MODERATION_LOG_CHANNEL_ID);
  if (!channel) {
    console.log(`❌ Channel ${MODERATION_LOG_CHANNEL_ID} not found in cache`);
    return;
  }
  console.log(`✅ Found channel: ${channel.name} (${channel.id})`);
  
  const userId = user.id;
  const oldMessageId = memberModLogMessages.get(userId);
  
  const staffRole = guild.roles.cache.find((r) => r.name === MOD_ROLE_NAME);
  
  try {
    // Try to update existing message
    if (oldMessageId) {
      try {
        const oldMessage = await channel.messages.fetch(oldMessageId).catch(() => null);
        if (oldMessage) {
          await oldMessage.edit({
            content: staffRole ? `${staffRole}` : "",
            embeds: [embed],
          }).catch(() => null);
          console.log(`✅ Updated existing mod log message for ${user.tag}`);
          return;
        }
      } catch (err) {
        console.error(`Failed to update old message:`, err.message);
      }
    }
    
    // If update failed or no old message, send new one
    const newMessage = await channel.send({
      content: staffRole ? `${staffRole}` : "",
      embeds: [embed],
    }).catch((err) => {
      console.log(`❌ Error sending to channel: ${err.message}`);
      return null;
    });
    
    if (newMessage) {
      memberModLogMessages.set(userId, newMessage.id);
      console.log(`✅ Sent new mod log message for ${user.tag}`);
    }
  } catch (err) {
    console.error(`Error in sendModerationLog:`, err.message);
  }
}

async function sendMemberBadwordReport(user, detectedWords, messageContent, aiDecision = null) {
  try {
    const userId = user.id;
    
    // Initialize or get stats
    if (!memberBadwordStats.has(userId)) {
      memberBadwordStats.set(userId, {});
      memberBadwordHistory.set(userId, []);
    }
    
    const stats = memberBadwordStats.get(userId);
    const history = memberBadwordHistory.get(userId);
    
    // Count each bad word
    let totalViolations = 0;
    detectedWords.forEach(word => {
      stats[word] = (stats[word] || 0) + 1;
      totalViolations++;
    });
    
    // Add to history
    history.push({
      type: "🔴 Bad Words/Insults",
      words: detectedWords,
      content: messageContent.substring(0, 100),
      aiDecision,
      timestamp: new Date()
    });

    // Keep only the most recent entries to avoid unbounded growth.
    if (history.length > BADWORD_HISTORY_MAX_ENTRIES) {
      history.splice(0, history.length - BADWORD_HISTORY_MAX_ENTRIES);
    }

    memberBadwordLastUpdated.set(userId, Date.now());
    
    // Get total violations across all instances
    const totalViolationCount = Object.values(stats).reduce((a, b) => a + b, 0);
    
    const report = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("🔴 Bad Language Confirmed")
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { 
          name: "👤 Member", 
          value: `${user}`, 
          inline: true 
        },
        { 
          name: "🔢 Total Violations", 
          value: `**${totalViolationCount}**`, 
          inline: true 
        },
        { 
          name: "📅 Last Updated", 
          value: new Date().toLocaleTimeString(), 
          inline: true 
        }
      );

    if (aiDecision) {
      report.addFields({
        name: "🧠 Context Analysis",
        value: `**Severity:** ${aiDecision.severity}\n**Action:** ${aiDecision.action}\n**Confidence:** ${Math.round((aiDecision.confidence || 0) * 100)}%\n**Reason:** ${aiDecision.reason}`.slice(0, 1024),
        inline: false,
      });
    }

    // Add breakdown by word
    if (Object.keys(stats).length > 0) {
      const wordBreakdown = Object.entries(stats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([word, count]) => `• **${word}**: ${count} time${count !== 1 ? 's' : ''}`)
        .join("\n");
      
      report.addFields({
        name: "📊 Bad Words Breakdown",
        value: wordBreakdown || "None",
        inline: false
      });
    }

    // Add recent violations
    if (history.length > 0) {
      const recentViolations = history
        .slice(-5)
        .reverse()
        .map((v, i) => `**${i + 1}.** ${v.words.join(", ")}\n└─ *\"${v.content.substring(0, 60)}${v.content.length > 60 ? '...' : ''}\"*`)
        .join("\n\n");
      
      report.addFields({
        name: "🚨 Recent Violations",
        value: recentViolations || "None",
        inline: false
      });
    }

    report
      .setFooter({ text: "Automated Moderation System • Context Checked" })
      .setTimestamp();

    return report;
  } catch (err) {
    console.error(`Failed to create bad word report for ${user.tag}:`, err.message);
    return null;
  }
}

async function sendFalsePositiveLog(message, detectedWords, aiDecision) {
  const channel = message.guild.channels.cache.get(MODERATION_LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x35c759)
    .setTitle("✅ Badword false positive ignored")
    .addFields(
      { name: "👤 Member", value: `${message.author} (${message.author.id})`, inline: false },
      { name: "📍 Channel", value: `${message.channel}`, inline: true },
      { name: "🔎 Suspicious words", value: detectedWords.join(", ").slice(0, 1024) || "None", inline: false },
      { name: "🧠 Context reason", value: String(aiDecision.reason || "No reason").slice(0, 1024), inline: false },
      { name: "💬 Message", value: String(message.content || "").slice(0, 1024) || "Empty", inline: false },
    )
    .setFooter({ text: "Automated Moderation System • No action taken" })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => null);
}

module.exports = (client) => {
  if (!badwordsCleanupInterval && BADWORD_CLEANUP_INTERVAL_MS > 0) {
    badwordsCleanupInterval = setInterval(() => {
      const purged = purgeExpiredBadwordEntries();
      if (purged > 0) {
        console.log(
          `🔁 badwords cleanup purged ${purged} inactive entr${purged === 1 ? "y" : "ies"}`,
        );
      }
    }, BADWORD_CLEANUP_INTERVAL_MS);

    badwordsCleanupInterval.unref?.();
  }

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    if (BUG_REPORTS_CHANNEL_ID && message.channel.id === BUG_REPORTS_CHANNEL_ID) return;
    const isInEnforcedChannel = FILTER_ENFORCED_CHANNEL_SET.has(message.channel.id);
    const isInEnforcedCategory =
      FILTER_ENFORCED_CATEGORY_SET.has(message.channel.parentId) ||
      FILTER_ENFORCED_CATEGORY_SET.has(message.channel.parent?.parentId);
    if (!isInEnforcedChannel && !isInEnforcedCategory && FILTER_EXEMPT_SET.has(message.channel.id)) return;
    if (hasBypassRole(message.member) && !isInEnforcedChannel) return;

    const content = message.content || "";
    const detectedWords = findBadWords(content);
    if (!detectedWords.length) return;

    const aiDecision = await analyzeBadwordContext({
      content,
      detectedWords,
      authorTag: message.author.tag,
      channelName: message.channel.name,
    });

    if (!aiDecision.is_violation || aiDecision.action === "ignore" || aiDecision.action === "log_only") {
      console.log(
        `✅ Badword false positive ignored for ${message.author.tag} in #${message.channel.name}: ${detectedWords.join(", ")} | ${aiDecision.reason}`,
      );
      await sendFalsePositiveLog(message, detectedWords, aiDecision);
      return;
    }

    await message.delete().catch(() => {});
    
    // Build professional violation report for the moderation channel
    const reportEmbed = await sendMemberBadwordReport(message.author, detectedWords, content, aiDecision);

    // Send to moderation channel instead of DM
    if (reportEmbed) {
      await sendModerationLog(message.guild, reportEmbed, message.author);
    }

    // Persist violation count and check threshold
    try {
      incViolations(message.author.id, detectedWords.length);
      const total = getViolationCount(message.author.id);
      if (hasReachedThreshold(message.author.id, READ_ONLY_THRESHOLD)) {
        await assignReadOnlyRole(message.member, total);
      }
    } catch (err) {
      console.warn("⚠️ Read-only assignment after badword failed:", err.message);
    }

    console.log(
      `🚨 Bad word(s) confirmed by context for ${message.author.tag} in #${message.channel.name}: ${detectedWords.join(", ")} | ${aiDecision.reason}`
    );
  });
};

module.exports.sendModerationLog = sendModerationLog;
module.exports.containsBadWord = containsBadWord;
module.exports.findBadWords = findBadWords;
module.exports.sendMemberBadwordReport = sendMemberBadwordReport;
module.exports.purgeExpiredBadwordEntries = purgeExpiredBadwordEntries;
module.exports.getBadwordCacheStats = getBadwordCacheStats;
