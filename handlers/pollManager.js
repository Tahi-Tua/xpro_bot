const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const pollStateFile = path.join(__dirname, "../data/pollState.json");

// Queue to serialize async writes and prevent race conditions
let pollSaveQueue = Promise.resolve();
const pollLocks = new Map();

// Default poll expiration: 24 hours in milliseconds
const DEFAULT_POLL_DURATION = 24 * 60 * 60 * 1000;

// Duration presets (fallback)
const DURATION_PRESETS = {
  "1h": 1 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

// Parse custom duration format: "10h25", "1h15m", "30m", "2h", etc.
function parseDuration(durationChoice) {
  if (!durationChoice) return DEFAULT_POLL_DURATION;

  // Try preset first
  if (DURATION_PRESETS[durationChoice]) {
    return DURATION_PRESETS[durationChoice];
  }

  // Parse custom format: "XhYm" or "Xh" or "Ym"
  const regex = /^(\d+)h?(?:(\d+)m?)?$/i;
  const match = durationChoice.toLowerCase().match(/(\d+)\s*h(?:\s*(\d+)\s*m)?|(\d+)\s*m/i);

  if (!match) {
    console.warn(`Invalid duration format: ${durationChoice}, using default 24h`);
    return DEFAULT_POLL_DURATION;
  }

  let ms = 0;

  // Format: "10h25" or "10h 25m"
  if (durationChoice.toLowerCase().includes("h")) {
    const hourMatch = durationChoice.match(/(\d+)\s*h/i);
    if (hourMatch) {
      ms += parseInt(hourMatch[1]) * 60 * 60 * 1000;
    }

    const minMatch = durationChoice.match(/(\d+)\s*m/i);
    if (minMatch) {
      ms += parseInt(minMatch[1]) * 60 * 1000;
    }
  } else if (durationChoice.toLowerCase().includes("m")) {
    const minMatch = durationChoice.match(/(\d+)\s*m/i);
    if (minMatch) {
      ms += parseInt(minMatch[1]) * 60 * 1000;
    }
  }

  // Validate (max 30 days, min 1 minute)
  const MAX_DURATION = 30 * 24 * 60 * 60 * 1000;
  const MIN_DURATION = 60 * 1000;

  if (ms > MAX_DURATION) {
    console.warn(`Duration too long (${durationChoice}), capped at 30 days`);
    return MAX_DURATION;
  }
  if (ms < MIN_DURATION) {
    console.warn(`Duration too short (${durationChoice}), set to 1 minute`);
    return MIN_DURATION;
  }

  return ms || DEFAULT_POLL_DURATION;
}

// Button IDs for options
const BUTTON_IDS = ["poll_opt_0", "poll_opt_1", "poll_opt_2", "poll_opt_3"];

// ============================================================================
// State management
// ============================================================================

function loadPollState() {
  try {
    if (!fs.existsSync(pollStateFile)) return {};

    const data = fs.readFileSync(pollStateFile, "utf8");
    if (!data.trim()) return {};

    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Failed to load poll state:", err.message);
    return {};
  }
}

/**
 * Save poll state to disk asynchronously.
 * Uses a queue to serialize writes and prevent race conditions.
 */
function savePollState(state) {
  pollSaveQueue = pollSaveQueue
    .then(async () => {
      try {
        const tempFile = `${pollStateFile}.tmp`;
        await fsPromises.writeFile(tempFile, JSON.stringify(state, null, 2), "utf8");
        await fsPromises.rename(tempFile, pollStateFile);
      } catch (err) {
        console.warn("⚠️ Could not save poll state:", err.message);
      }
    })
    .catch((err) => {
      console.warn("⚠️ Unexpected error in poll save queue:", err.message);
    });
  return pollSaveQueue;
}

function withPollLock(messageId, task) {
  const previous = pollLocks.get(messageId) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  const tracked = next.finally(() => {
    if (pollLocks.get(messageId) === tracked) {
      pollLocks.delete(messageId);
    }
  }).catch(() => {});

  pollLocks.set(messageId, tracked);

  return next;
}

// ============================================================================
// Create and send poll
// ============================================================================

async function createPoll(interaction, title, options, durationChoice = "24h") {
  try {
    // Parse the duration
    const pollDuration = parseDuration(durationChoice);
    const durationText = getDurationText(durationChoice);

    // Create basic embed (no voters yet since no one has voted)
    const embed = createPollEmbed(title, options, options.map(() => []), durationText);

    // Create buttons (only vote buttons)
    const buttons = createPollButtons(options.length);

    // Send the poll message FIRST (no defer needed)
    const message = await interaction.channel.send({
      embeds: [embed],
      components: [buttons],
    });

    // Store poll state
    const pollState = loadPollState();
    pollState[message.id] = {
      messageId: message.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      title,
      options,
      votes: options.map(() => []), // Array of user IDs per option
      createdAt: Date.now(),
      createdBy: interaction.user.id,
      duration: pollDuration,
      durationChoice,
    };
    await savePollState(pollState);

    // Schedule poll closure
    schedulePollClosure(interaction.client, message.id, pollDuration);

    // Reply to the interaction (ephemeral confirmation)
    await interaction.reply({
      content: `✅ Poll created! ⏱️ Closes in ${durationText}\n[Jump to poll](${message.url})`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error("Error creating poll:", error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while creating the poll.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (e) {
      console.error("Failed to send error reply:", e);
    }
  }
}

// Helper to get human-readable duration text
function getDurationText(durationChoice) {
  if (!durationChoice) return "24 hours";

  const texts = {
    "1h": "1 hour",
    "6h": "6 hours",
    "24h": "24 hours",
    "7d": "7 days",
  };

  if (texts[durationChoice]) return texts[durationChoice];

  // Return the custom format as-is (e.g., "10h25" → "10h25")
  return durationChoice.toLowerCase();
}

// ============================================================================
// Embed builder
// ============================================================================

function createPollEmbed(title, options, votes, durationText = "24 hours") {
  const totalVotes = options.reduce(
    (sum, _, idx) => sum + (votes[idx] || []).length,
    0
  );

  const fields = options.map((option, idx) => {
    const voteCount = votes[idx] ? votes[idx].length : 0;
    const percentage =
      totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    const bar = createProgressBar(percentage);

    return {
      name: `${idx + 1}️⃣ ${option}`,
      value: `${bar} **${voteCount}** votes (${percentage}%)`,
      inline: false,
    };
  });

  return new EmbedBuilder()
    .setTitle(`📊 ${title}`)
    .setDescription(`Total votes: **${totalVotes}**`)
    .addFields(...fields)
    .setColor("#5865F2")
    .setFooter({ text: `Click the buttons below to vote • Closes in ${durationText}` })
    .setTimestamp();
}

// Async version with voter names
async function createPollEmbedWithVoters(title, options, votes, guild, durationText = "24 hours") {
  const totalVotes = options.reduce(
    (sum, _, idx) => sum + (votes[idx] || []).length,
    0
  );

  const fields = [];

  for (let idx = 0; idx < options.length; idx++) {
    const option = options[idx];
    const voteCount = votes[idx] ? votes[idx].length : 0;
    const percentage =
      totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    const bar = createProgressBar(percentage);

    let voterList = "";
    if (voteCount > 0 && votes[idx] && votes[idx].length > 0) {
      const voterIds = votes[idx];
      const voterNames = [];

      for (const userId of voterIds) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            voterNames.push(member.displayName || member.user.username);
          } else {
            // Try to get user directly from client
            const user = await guild.client.users.fetch(userId).catch(() => null);
            voterNames.push(user ? user.username : `User ${userId.slice(-4)}`);
          }
        } catch (err) {
          console.log(`[Poll] Could not fetch voter ${userId}:`, err.message);
          voterNames.push(`User ${userId.slice(-4)}`);
        }
      }

      if (voterNames.length > 0) {
        voterList = `\n👥 ${voterNames.join(", ")}`;
      }
    }

    fields.push({
      name: `${idx + 1}️⃣ ${option}`,
      value: `${bar} **${voteCount}** votes (${percentage}%)${voterList}`,
      inline: false,
    });
  }

  return new EmbedBuilder()
    .setTitle(`📊 ${title}`)
    .setDescription(`Total votes: **${totalVotes}**`)
    .addFields(...fields)
    .setColor("#5865F2")
    .setFooter({ text: `Click the buttons below to vote • Closes in ${durationText}` })
    .setTimestamp();
}

function createProgressBar(percentage) {
  const filled = Math.round(percentage / 10); // 10 segments
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

// ============================================================================
// Button builder
// ============================================================================

function createPollButtons(optionCount) {
  const buttons = [];
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

  for (let i = 0; i < optionCount; i++) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(BUTTON_IDS[i])
        .setLabel(`Vote ${i + 1}`)
        .setEmoji(emojis[i])
        .setStyle(ButtonStyle.Primary)
    );
  }

  return new ActionRowBuilder().addComponents(buttons);
}

// ============================================================================
// Handle vote button clicks
// ============================================================================

async function handlePollVote(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("poll_opt_")) return;

  try {
    await interaction.deferUpdate();

    // Get the option index from button ID
    const optionIdx = parseInt(interaction.customId.split("_")[2]);
    const result = await withPollLock(interaction.message.id, async () => {
      const pollState = loadPollState();
      const poll = pollState[interaction.message.id];

      if (!poll) {
        return { error: "❌ Poll not found." };
      }

      if (Date.now() - poll.createdAt > poll.duration) {
        return { error: "⏰ This poll has expired." };
      }

      if (!Number.isInteger(optionIdx) || !poll.votes[optionIdx]) {
        return { error: "❌ Invalid poll option." };
      }

      // Remove user's vote from all options
      poll.votes.forEach((voters) => {
        const userIndex = voters.indexOf(interaction.user.id);
        if (userIndex !== -1) {
          voters.splice(userIndex, 1);
        }
      });

      // Add user's vote to the selected option
      poll.votes[optionIdx].push(interaction.user.id);

      await savePollState(pollState);

      // Update the embed with new vote counts while the poll lock is held.
      const embed = await createPollEmbedWithVoters(poll.title, poll.options, poll.votes, interaction.guild, getDurationText(poll.durationChoice));
      const buttons = createPollButtons(poll.options.length);

      await interaction.message.edit({
        embeds: [embed],
        components: [buttons],
      });

      return { option: poll.options[optionIdx] };
    });

    if (result.error) {
      return await interaction.followUp({
        content: result.error,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Notify user (using followUp since we deferred)
    await interaction.followUp({
      content: `✅ Your vote for **${result.option}** has been registered!`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error("Error handling poll vote:", error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while processing your vote.",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: "❌ An error occurred while processing your vote.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (e) {
      console.error("Failed to send error reply:", e);
    }
  }
}

// ============================================================================
// Auto-close polls
// ============================================================================

function schedulePollClosure(client, messageId, pollDuration = DEFAULT_POLL_DURATION) {
  setTimeout(() => {
    closePoll(client, messageId);
  }, pollDuration);
}

async function closePoll(client, messageId) {
  return withPollLock(messageId, async () => {
    try {
      const pollState = loadPollState();
      const poll = pollState[messageId];

      if (!poll) {
        console.log(`[Poll] No poll found for messageId ${messageId}`);
        return;
      }

      console.log(`[Poll] Closing poll "${poll.title}" with votes:`, JSON.stringify(poll.votes));

      // Fetch the message
      const channel = await client.channels.fetch(poll.channelId);
      const message = await channel.messages.fetch(messageId);

      if (!message) {
        console.log(`[Poll] Message ${messageId} not found`);
        return;
      }

      // Fetch guild for voter names
      const guild = await client.guilds.fetch(poll.guildId);
      console.log(`[Poll] Guild fetched: ${guild.name}`);

      // Create final embed WITH voter names preserved
      const embed = await createPollEmbedWithVoters(poll.title, poll.options, poll.votes, guild, getDurationText(poll.durationChoice));

      // Format close time in French locale
      const closeTime = new Date().toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      embed.setFooter({ text: `⏰ Poll has closed • Aujourd'hui à ${closeTime.split(" ").slice(-1)[0]}` });

      // Remove buttons
      await message.edit({
        embeds: [embed],
        components: [],
      });

      // Remove from state
      delete pollState[messageId];
      await savePollState(pollState);

      console.log(`✅ Poll ${messageId} closed with voter names preserved.`);
    } catch (error) {
      console.error("Error closing poll:", error);
    }
  });
}

// ============================================================================
// Check and close expired polls on startup
// ============================================================================

function checkExpiredPolls(client) {
  const pollState = loadPollState();
  const now = Date.now();

  Object.entries(pollState).forEach(([messageId, poll]) => {
    if (now - poll.createdAt > poll.duration) {
      closePoll(client, messageId);
    } else {
      // Reschedule closure for remaining polls
      const remainingTime = poll.duration - (now - poll.createdAt);
      setTimeout(() => {
        closePoll(client, messageId);
      }, remainingTime);
    }
  });
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  createPoll,
  handlePollVote,
  checkExpiredPolls,
  loadPollState,
  savePollState,
};
