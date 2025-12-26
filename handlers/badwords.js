const fs = require("fs");
const path = require("path");
const { Events, EmbedBuilder } = require("discord.js");
const { MODERATION_LOG_CHANNEL_ID, MOD_ROLE_NAME, GENERAL_CHAT_ID, BUG_REPORTS_CHANNEL_ID, FILTER_EXEMPT_CHANNEL_IDS, FILTER_ENFORCED_CATEGORY_IDS } = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");
const { sendToTelegram } = require("../utils/telegram");
const { increment: incViolations, getCount: getViolationCount, hasReachedThreshold } = require("../utils/violationStore");
const { assignReadOnlyRole } = require("../utils/readOnlyRole");
const { READ_ONLY_THRESHOLD } = require("../config/channels");

const FILTER_EXEMPT_SET = new Set(FILTER_EXEMPT_CHANNEL_IDS || []);
const FILTER_ENFORCED_CATEGORY_SET = new Set(FILTER_ENFORCED_CATEGORY_IDS || []);

// Telegram message length limit (4096 chars). Use 4000 for safety margin.
const TELEGRAM_MAX_LENGTH = 4000;

/**
 * Build a Telegram message respecting the 4096 character limit.
 * @param {Object} parts - Message parts
 * @returns {string} Message under TELEGRAM_MAX_LENGTH
 */
function buildTelegramMessage(parts) {
  const { prefix = '', author = '', authorId = '', channel = '', words = '', content = '' } = parts;
  
  const metadata = `${prefix}\n👤 ${author.slice(0, 50)} (${authorId})\n#️⃣ #${channel.slice(0, 50)}${words ? `\n🔴 Words: ${words.slice(0, 150)}` : ''}\n📄 `;
  
  const remainingSpace = TELEGRAM_MAX_LENGTH - metadata.length - 10;
  const truncatedContent = remainingSpace > 50 
    ? content.slice(0, remainingSpace) + (content.length > remainingSpace ? '…' : '')
    : '(message too long)';
  
  return metadata + (truncatedContent || '(empty)');
}

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

// Helpers to match only exact words present in the lists
const stripDiacritics = (str) => str.normalize("NFD").replace(/\p{Diacritic}+/gu, "");
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;
// Keep spaces but strip obfuscation symbols like "***" so "p**n" stays "pn"
const normalizeSymbols = (str) =>
  str
    .replace(/[\u00A0]/g, " ") // non-breaking space
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(/\*/g, "") // remove stars instead of spacing them to avoid splitting the word
    .replace(/[\-_. ,/\\+~=`'"()\[\]{}<>^%$#@!?;:|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Exact lookup table (word -> original from file) after simple normalization
const normalizedBadwords = new Set();
const badwordLookup = new Map();
singleWordList.forEach((word) => {
  const normalized = stripDiacritics(word.toLowerCase())
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(/[^a-z0-9]/g, "");
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

function normalizeContent(text) {
  const lowered = text.toLowerCase();
  const withoutDiacritics = stripDiacritics(lowered);
  const withoutSymbols = normalizeSymbols(withoutDiacritics);
  return withoutSymbols;
}

// Remove URLs from text to avoid false positives
function removeUrls(text) {
  // Remove common URL patterns (http, https, discord links, etc.)
  return text.replace(/https?:\/\/[^\s]+/gi, " ")
             .replace(/discord\.gg\/[^\s]+/gi, " ")
             .replace(/www\.[^\s]+/gi, " ");
}

// Tokenize the text into normalized, alphanumeric-only words to guarantee whole-word checks
function tokenizeNormalizedWords(text) {
  const withoutUrls = removeUrls(text);
  const normalized = normalizeContent(withoutUrls);
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

async function sendMemberBadwordReport(user, detectedWords, messageContent) {
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
      .setTitle("🔴 Bad Language Detected")
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
        .map((v, i) => `**${i + 1}.** ${v.words.join(", ")}\n└─ *"${v.content.substring(0, 60)}${v.content.length > 60 ? '...' : ''}"*`)
        .join("\n\n");
      
      report.addFields({
        name: "🚨 Recent Violations",
        value: recentViolations || "None",
        inline: false
      });
    }

    report
      .setFooter({ text: "Automated Moderation System • Member-Spam Channel" })
      .setTimestamp();

    return report;
  } catch (err) {
    console.error(`Failed to create bad word report for ${user.tag}:`, err.message);
    return null;
  }
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
    const isInEnforcedCategory =
      FILTER_ENFORCED_CATEGORY_SET.has(message.channel.parentId) ||
      FILTER_ENFORCED_CATEGORY_SET.has(message.channel.parent?.parentId);
    if (!isInEnforcedCategory && FILTER_EXEMPT_SET.has(message.channel.id)) return;
    if (hasBypassRole(message.member)) return;

    const content = message.content || "";
    if (!containsBadWord(content)) return;

    await message.delete().catch(() => {});

    // Find which bad words were used
    const detectedWords = findBadWords(content);
    
    // Build professional violation report for the moderation channel
    const reportEmbed = await sendMemberBadwordReport(message.author, detectedWords, content);

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
      `🚨 Bad word(s) by ${message.author.tag} in #${message.channel.name}: ${detectedWords.join(", ")}`
    );

    if (typeof sendToTelegram === 'function') {
      const telegramMessage = buildTelegramMessage({
        prefix: '🔴 Insult detected',
        author: message.author.tag,
        authorId: message.author.id,
        channel: message.channel.name,
        words: detectedWords.slice(0, 3).join(", "),
        content: content
      });
      sendToTelegram(telegramMessage, { parse_mode: 'Markdown' });
    }
  });
};

module.exports.sendModerationLog = sendModerationLog;
module.exports.containsBadWord = containsBadWord;
module.exports.findBadWords = findBadWords;
module.exports.sendMemberBadwordReport = sendMemberBadwordReport;
module.exports.purgeExpiredBadwordEntries = purgeExpiredBadwordEntries;
module.exports.getBadwordCacheStats = getBadwordCacheStats;

// noop touch to trigger Telegram file notifier
