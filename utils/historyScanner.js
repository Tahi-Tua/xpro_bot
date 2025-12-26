const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { MODERATION_LOG_CHANNEL_ID, MOD_ROLE_NAME, FILTER_EXEMPT_CHANNEL_IDS } = require("../config/channels");
const { containsBadWord, findBadWords } = require("../handlers/badwords");
const { detectSpamViolations } = require("../handlers/spam");
const { hasBypassRole } = require("../utils/bypass");

const scanStateFile = path.join(__dirname, "../data/scanState.json");

const FILTER_EXEMPT_SET = new Set(FILTER_EXEMPT_CHANNEL_IDS || []);

// A simple promise-based queue to serialize updates to the scan state file.
// Without this, concurrent scans may overwrite each other's progress.  Each
// call to `updateScanState` is enqueued and executed sequentially.
let scanStateQueue = Promise.resolve();

/**
 * Update the saved scan state for a specific channel.  This helper
 * serializes updates to avoid race conditions where concurrent scans
 * overwrite each other's progress.  It reads the latest state from disk,
 * applies the update, and writes it back to disk in a queued manner.
 *
 * @param {string} channelId The ID of the channel that was scanned.
 * @param {string} newestMessageId The ID of the newest message that was scanned.
 * @returns {Promise<void>} A promise that resolves once the update is complete.
 */
function updateScanState(channelId, newestMessageId) {
  scanStateQueue = scanStateQueue
    .then(() => {
      const state = loadScanState();
      state[channelId] = newestMessageId;
      saveScanState(state);
    })
    .catch((err) => {
      console.error("Failed to update scan state:", err.message);
    });
  return scanStateQueue;
}

function loadScanState() {
  try {
    const data = fs.readFileSync(scanStateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveScanState(state) {
  fs.writeFileSync(scanStateFile, JSON.stringify(state, null, 2));
}

function detectSpamPatterns(message) {
  return detectSpamViolations(message) || [];
}

async function sendViolationDM(user, violations) {
  try {
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("⚠️ Message Violation Notice")
      .setDescription("Your message was found to violate server rules during a history scan.")
      .addFields(
        { name: "Violations", value: violations.join("\n") || "Unknown" },
        { name: "Action", value: "Your message has been deleted" },
        { name: "Note", value: "Please review the server rules and avoid this behavior in the future." }
      )
      .setTimestamp();

    await user.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error(`Failed to send DM to ${user.tag}:`, err.message);
  }
}

async function sendMemberScanReport(guild, user, violations) {
  try {
    const totalViolations = violations.length;
    
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
    
    const report = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("📋 Your Violation Report")
      .setDescription("Report Type: **🔵 History Scan**\nStatus: **ACTIVE MONITORING**")
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
          name: "📅 Scan Date", 
          value: new Date().toLocaleDateString(), 
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
      value: "This report is **actively being monitored**. Each future violation will be tracked and added to your record.",
      inline: false
    });

    report
      .setFooter({ text: "Automated Moderation System • History Scan Report" })
      .setTimestamp();

    await user.send({ embeds: [report] }).catch(() => {});
  } catch (err) {
    console.error(`Failed to send report to ${user.tag}:`, err.message);
  }
}

async function scanChannel(channel, options = {}) {
  const { maxMessages = 500, deleteViolations = false, logChannel = null, guild = null } = options;

  if (FILTER_EXEMPT_SET.has(channel.id)) {
    return {
      scanned: 0,
      badwords: [],
      spam: [],
      errors: [],
    };
  }
  
  const state = loadScanState();
  const lastScannedId = state[channel.id];
  
  const results = {
    scanned: 0,
    badwords: [],
    spam: [],
    errors: [],
  };

  let lastMessageId = null;
  let messagesProcessed = 0;
  let reachedLastScanned = false;
  const memberViolations = new Map(); // Store violations per member

  try {
    fetchLoop: while (messagesProcessed < maxMessages) {
      const fetchOptions = { limit: 100 };
      if (lastMessageId) {
        fetchOptions.before = lastMessageId;
      }

      const messages = await channel.messages.fetch(fetchOptions);
      if (messages.size === 0) break;

      for (const [id, message] of messages) {
        if (lastScannedId && BigInt(id) <= BigInt(lastScannedId)) {
          reachedLastScanned = true;
          break;
        }

        if (message.author.bot) continue;
        if (hasBypassRole(message.member)) continue;

        messagesProcessed++;
        results.scanned++;

        const content = message.content || "";
        let hasViolation = false;
        const violations = [];

        if (containsBadWord(content)) {
          const matchedWords = findBadWords(content);
          results.badwords.push({
            id: message.id,
            author: message.author.tag,
            authorId: message.author.id,
            content: content.slice(0, 200),
            words: matchedWords,
            url: message.url,
          });
          violations.push({
            type: "🔴 Bad Words",
            words: matchedWords,
            content: content.slice(0, 100)
          });
          hasViolation = true;

          if (deleteViolations) {
            await message.delete().catch(() => {});
          }
        }

        const spamIssues = detectSpamPatterns(message);
        if (spamIssues.length > 0) {
          results.spam.push({
            id: message.id,
            author: message.author.tag,
            authorId: message.author.id,
            content: content.slice(0, 200),
            issues: spamIssues,
            url: message.url,
          });
          
          spamIssues.forEach(issue => {
            violations.push({
              type: `🟠 ${issue}`,
              content: content.slice(0, 100)
            });
          });
          hasViolation = true;

          if (deleteViolations) {
            await message.delete().catch(() => {});
          }
        }

        // Store violations per member
        if (hasViolation) {
          if (!memberViolations.has(message.author.id)) {
            memberViolations.set(message.author.id, {
              author: message.author,
              violations: []
            });
          }
          memberViolations.get(message.author.id).violations.push(...violations);
        }

        if (messagesProcessed >= maxMessages) break;
      }

      lastMessageId = messages.last()?.id;
      if (!lastMessageId || reachedLastScanned) break fetchLoop;

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Send individual reports to members with violations
    for (const [memberId, data] of memberViolations.entries()) {
      await sendMemberScanReport(guild, data.author, data.violations);
      await new Promise((resolve) => setTimeout(resolve, 500)); // Rate limit DMs
    }

    const newestMessageId = (await channel.messages.fetch({ limit: 1 })).first()?.id;
    if (newestMessageId) {
      // Use the queued update function to prevent concurrent writes clobbering each other
      await updateScanState(channel.id, newestMessageId);
    }

  } catch (err) {
    results.errors.push(err.message);
  }

  return results;
}

async function logScanResults(guild, channel, results) {
  const logChannel = guild.channels.cache.get(MODERATION_LOG_CHANNEL_ID);
  if (!logChannel) return;

  const totalViolations = results.badwords.length + results.spam.length;
  const violationRate = results.scanned > 0 ? ((totalViolations / results.scanned) * 100).toFixed(2) : 0;

  // Main embed with statistics
  const mainEmbed = new EmbedBuilder()
    .setColor(totalViolations > 0 ? 0xff6b6b : 0x2ecc71)
    .setTitle("🔍 HISTORY SCAN RESULTS")
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
      { 
        name: "📍 Channel Scanned", 
        value: `${channel}`, 
        inline: true 
      },
      { 
        name: "📊 Messages Analyzed", 
        value: `**${results.scanned}**`, 
        inline: true 
      },
      { 
        name: "📈 Violation Rate", 
        value: `**${violationRate}%**`, 
        inline: true 
      }
    )
    .addFields(
      { 
        name: "🚨 Total Violations Found", 
        value: `**${totalViolations}**`, 
        inline: false 
      }
    );

  // Statistics rows
  const statsValue = 
    `\`\`\`
🔴 Bad Words:     ${results.badwords.length}
🟠 Spam Issues:   ${results.spam.length}
\`\`\``;
  mainEmbed.addFields({
    name: "📋 Violation Breakdown",
    value: statsValue,
    inline: false
  });

  // Bad words violations with details
  if (results.badwords.length > 0) {
    const badwordDetails = results.badwords
      .slice(0, 8)
      .map((v, i) => {
        const snippet = v.content.replace(/\n/g, " ");
        return `**${i + 1}. ${v.author}**\n└─ *"${snippet.substring(0, 80)}${snippet.length > 80 ? '...' : ''}"*`;
      })
      .join("\n\n");
    
    mainEmbed.addFields({
      name: `🔴 Bad Words Violations (${results.badwords.length} total)`,
      value: badwordDetails || "None",
      inline: false
    });
  }

  // Spam violations with details
  if (results.spam.length > 0) {
    const spamDetails = results.spam
      .slice(0, 8)
      .map((v, i) => {
        const snippet = v.content.replace(/\n/g, " ");
        const issues = v.issues.map(issue => `\`${issue}\``).join(", ");
        return `**${i + 1}. ${v.author}**\n└─ ${issues}\n└─ *"${snippet.substring(0, 70)}${snippet.length > 70 ? '...' : ''}"*`;
      })
      .join("\n\n");
    
    mainEmbed.addFields({
      name: `🟠 Spam Violations (${results.spam.length} total)`,
      value: spamDetails || "None",
      inline: false
    });
  }

  // Summary footer
  const summaryText = totalViolations === 0 
    ? "✅ No violations found! Channel is clean." 
    : `⚠️ ${totalViolations} violation${totalViolations !== 1 ? 's' : ''} detected and processed.`;
  
  mainEmbed.addFields({
    name: "📌 Summary",
    value: summaryText,
    inline: false
  });

  if (results.errors.length > 0) {
    mainEmbed.addFields({
      name: "⚠️ Errors During Scan",
      value: results.errors.join("\n").slice(0, 500),
      inline: false
    });
  }

  mainEmbed
    .setFooter({ text: "Automated Security Scan" })
    .setTimestamp();

  const staffRole = guild.roles.cache.find((r) => r.name === MOD_ROLE_NAME);
  await logChannel.send({
    content: staffRole && totalViolations > 0 ? `${staffRole}` : "",
    embeds: [mainEmbed],
  }).catch(() => {});
}

module.exports = {
  scanChannel,
  logScanResults,
  containsBadWord,
  detectSpamPatterns,
  sendViolationDM,
  sendMemberScanReport,
};
