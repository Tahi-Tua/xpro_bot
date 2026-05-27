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

let pollSaveQueue = Promise.resolve();
const pollLocks = new Map();

const DEFAULT_POLL_DURATION = 24 * 60 * 60 * 1000;

const DURATION_PRESETS = {
  "1h": 1 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function parseDuration(durationChoice) {
  if (!durationChoice) return DEFAULT_POLL_DURATION;

  if (DURATION_PRESETS[durationChoice]) {
    return DURATION_PRESETS[durationChoice];
  }

  const match = durationChoice
    .toLowerCase()
    .match(/(\d+)\s*h(?:\s*(\d+)\s*m)?|(\d+)\s*m/i);

  if (!match) {
    console.warn(`Invalid duration format: ${durationChoice}, using default 24h`);
    return DEFAULT_POLL_DURATION;
  }

  let ms = 0;

  if (durationChoice.toLowerCase().includes("h")) {
    const hourMatch = durationChoice.match(/(\d+)\s*h/i);
    if (hourMatch) {
      ms += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    }

    const minMatch = durationChoice.match(/(\d+)\s*m/i);
    if (minMatch) {
      ms += parseInt(minMatch[1], 10) * 60 * 1000;
    }
  } else if (durationChoice.toLowerCase().includes("m")) {
    const minMatch = durationChoice.match(/(\d+)\s*m/i);
    if (minMatch) {
      ms += parseInt(minMatch[1], 10) * 60 * 1000;
    }
  }

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

const BUTTON_IDS = ["poll_opt_0", "poll_opt_1", "poll_opt_2", "poll_opt_3"];

function loadPollState() {
  try {
    const data = fs.readFileSync(pollStateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function savePollState(state) {
  pollSaveQueue = pollSaveQueue
    .then(async () => {
      try {
        await fsPromises.mkdir(path.dirname(pollStateFile), { recursive: true });
        await fsPromises.writeFile(
          pollStateFile,
          JSON.stringify(state, null, 2),
          "utf8",
        );
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

  const tracked = next
    .finally(() => {
      if (pollLocks.get(messageId) === tracked) {
        pollLocks.delete(messageId);
      }
    })
    .catch(() => {});

  pollLocks.set(messageId, tracked);

  return next;
}

async function createPoll(interaction, title, options, durationChoice = "24h") {
  try {
    const pollDuration = parseDuration(durationChoice);
    const durationText = getDurationText(durationChoice);
    const createdAt = Date.now();
    const expiresAt = createdAt + pollDuration;

    const embed = createPollEmbed(
      title,
      options,
      options.map(() => []),
      durationText,
    );

    const buttons = createPollButtons(options.length);

    const message = await interaction.channel.send({
      embeds: [embed],
      components: [buttons],
    });

    const pollState = loadPollState();

    pollState[message.id] = {
      messageId: message.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      title,
      options,
      votes: options.map(() => []),
      createdAt,
      expiresAt,
      createdBy: interaction.user.id,
      duration: pollDuration,
      durationChoice,
    };

    await savePollState(pollState);

    schedulePollClosure(interaction.client, message.id, pollDuration);

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

function getDurationText(durationChoice) {
  if (!durationChoice) return "24 hours";

  const texts = {
    "1h": "1 hour",
    "6h": "6 hours",
    "24h": "24 hours",
    "7d": "7 days",
  };

  if (texts[durationChoice]) return texts[durationChoice];

  return durationChoice.toLowerCase();
}

function getPollExpiresAt(poll) {
  return poll.expiresAt || poll.createdAt + poll.duration;
}

function createPollEmbed(title, options, votes, durationText = "24 hours") {
  const totalVotes = options.reduce(
    (sum, _, idx) => sum + (votes[idx] || []).length,
    0,
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
    .setFooter({
      text: `Click the buttons below to vote • Closes in ${durationText}`,
    })
    .setTimestamp();
}

async function createPollEmbedWithVoters(
  title,
  options,
  votes,
  guild,
  durationText = "24 hours",
) {
  const totalVotes = options.reduce(
    (sum, _, idx) => sum + (votes[idx] || []).length,
    0,
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
    .setFooter({
      text: `Click the buttons below to vote • Closes in ${durationText}`,
    })
    .setTimestamp();
}

function createProgressBar(percentage) {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

function createPollButtons(optionCount) {
  const buttons = [];
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

  for (let i = 0; i < optionCount; i++) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(BUTTON_IDS[i])
        .setLabel(`Vote ${i + 1}`)
        .setEmoji(emojis[i])
        .setStyle(ButtonStyle.Primary),
    );
  }

  return new ActionRowBuilder().addComponents(buttons);
}

async function handlePollVote(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("poll_opt_")) return;

  try {
    await interaction.deferUpdate();

    const optionIdx = parseInt(interaction.customId.split("_")[2], 10);

    const result = await withPollLock(interaction.message.id, async () => {
      const pollState = loadPollState();
      const poll = pollState[interaction.message.id];

      if (!poll) {
        return {
          error:
            "❌ Poll not found or expired. The bot may have restarted without persistent storage.",
        };
      }

      const expiresAt = getPollExpiresAt(poll);

      if (Date.now() >= expiresAt) {
        return { error: "⏰ This poll has expired." };
      }

      if (!Number.isInteger(optionIdx) || !poll.votes[optionIdx]) {
        return { error: "❌ Invalid poll option." };
      }

      poll.votes.forEach((voters) => {
        const userIndex = voters.indexOf(interaction.user.id);

        if (userIndex !== -1) {
          voters.splice(userIndex, 1);
        }
      });

      poll.votes[optionIdx].push(interaction.user.id);

      if (!poll.expiresAt) {
        poll.expiresAt = poll.createdAt + poll.duration;
      }

      await savePollState(pollState);

      const embed = await createPollEmbedWithVoters(
        poll.title,
        poll.options,
        poll.votes,
        interaction.guild,
        getDurationText(poll.durationChoice),
      );

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

      console.log(
        `[Poll] Closing poll "${poll.title}" with votes:`,
        JSON.stringify(poll.votes),
      );

      const channel = await client.channels.fetch(poll.channelId);
      const message = await channel.messages.fetch(messageId);

      if (!message) {
        console.log(`[Poll] Message ${messageId} not found`);
        return;
      }

      const guild = await client.guilds.fetch(poll.guildId);

      const embed = await createPollEmbedWithVoters(
        poll.title,
        poll.options,
        poll.votes,
        guild,
        getDurationText(poll.durationChoice),
      );

      const closeTime = new Date().toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      embed.setFooter({
        text: `⏰ Poll has closed • ${closeTime}`,
      });

      await message.edit({
        embeds: [embed],
        components: [],
      });

      delete pollState[messageId];
      await savePollState(pollState);

      console.log(`✅ Poll ${messageId} closed with voter names preserved.`);
    } catch (error) {
      console.error("Error closing poll:", error);
    }
  });
}

function checkExpiredPolls(client) {
  const pollState = loadPollState();
  const now = Date.now();

  Object.entries(pollState).forEach(([messageId, poll]) => {
    const expiresAt = getPollExpiresAt(poll);

    if (!poll.expiresAt) {
      poll.expiresAt = expiresAt;
      savePollState(pollState);
    }

    if (now >= expiresAt) {
      console.log(`[Poll] Expired poll detected: ${messageId}`);
      closePoll(client, messageId);
      return;
    }

    const remainingTime = expiresAt - now;

    console.log(
      `[Poll] Rescheduled "${poll.title}" (${messageId}) -> ${Math.round(
        remainingTime / 1000,
      )}s remaining`,
    );

    setTimeout(() => {
      closePoll(client, messageId);
    }, remainingTime);
  });
}

module.exports = {
  createPoll,
  handlePollVote,
  checkExpiredPolls,
  loadPollState,
  savePollState,
};