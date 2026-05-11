/**
 * surveyManager.js — Open-answer survey system
 *
 * Features:
 *  - Mod creates a survey with /survey → embed + "📝 Respond" button
 *  - Members click button → Discord Modal with a text field opens
 *  - Responses are sent to a private staff channel (SURVEY_RESULTS_CHANNEL_ID)
 *  - Members can update their answer (modal pre-fills previous answer)
 *  - Auto-close after duration, with summary posted in results channel
 *  - Persistent state survives bot restarts
 *  - Optional anonymous mode (hides respondent identity in results channel)
 */

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");

const { SURVEY_RESULTS_CHANNEL_ID, STAFF_ROLE_ID, LEADER_ROLE_ID } = require("../config/channels");

// ============================================================================
// Constants
// ============================================================================

const surveyStateFile = path.join(__dirname, "../data/surveyState.json");
let surveySaveQueue = Promise.resolve();
const surveyLocks = new Map();
const DEFAULT_SURVEY_DURATION = 24 * 60 * 60 * 1000; // 24h

const DURATION_PRESETS = {
  "1h":  1 * 60 * 60 * 1000,
  "6h":  6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "7d":  7 * 24 * 60 * 60 * 1000,
};

// ============================================================================
// Duration parsing (reuses the same logic as pollManager)
// ============================================================================

function parseDuration(durationChoice) {
  if (!durationChoice) return DEFAULT_SURVEY_DURATION;
  if (DURATION_PRESETS[durationChoice]) return DURATION_PRESETS[durationChoice];

  const match = durationChoice.toLowerCase().match(/(\d+)\s*h(?:\s*(\d+)\s*m)?|(\d+)\s*m/i);
  if (!match) {
    console.warn(`[Survey] Invalid duration format: ${durationChoice}, using default 24h`);
    return DEFAULT_SURVEY_DURATION;
  }

  let ms = 0;
  if (durationChoice.toLowerCase().includes("h")) {
    const hourMatch = durationChoice.match(/(\d+)\s*h/i);
    if (hourMatch) ms += parseInt(hourMatch[1]) * 60 * 60 * 1000;
    const minMatch = durationChoice.match(/(\d+)\s*m/i);
    if (minMatch) ms += parseInt(minMatch[1]) * 60 * 1000;
  } else if (durationChoice.toLowerCase().includes("m")) {
    const minMatch = durationChoice.match(/(\d+)\s*m/i);
    if (minMatch) ms += parseInt(minMatch[1]) * 60 * 1000;
  }

  const MAX = 30 * 24 * 60 * 60 * 1000;
  const MIN = 60 * 1000;
  if (ms > MAX) return MAX;
  if (ms < MIN) return MIN;
  return ms || DEFAULT_SURVEY_DURATION;
}

function getDurationText(durationChoice) {
  if (!durationChoice) return "24 hours";
  const texts = {
    "1h": "1 hour", "6h": "6 hours", "12h": "12 hours",
    "24h": "24 hours", "48h": "48 hours", "7d": "7 days",
  };
  return texts[durationChoice] || durationChoice.toLowerCase();
}

// ============================================================================
// State management
// ============================================================================

function loadSurveyState() {
  try {
    const data = fs.readFileSync(surveyStateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveSurveyState(state) {
  surveySaveQueue = surveySaveQueue
    .then(async () => {
      try {
        await fsPromises.writeFile(surveyStateFile, JSON.stringify(state, null, 2), "utf8");
      } catch (err) {
        console.warn("⚠️ Could not save survey state:", err.message);
      }
    })
    .catch((err) => {
      console.warn("⚠️ Unexpected error in survey save queue:", err.message);
    });
  return surveySaveQueue;
}

function withSurveyLock(messageId, task) {
  const previous = surveyLocks.get(messageId) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  const tracked = next.finally(() => {
    if (surveyLocks.get(messageId) === tracked) {
      surveyLocks.delete(messageId);
    }
  }).catch(() => {});

  surveyLocks.set(messageId, tracked);
  return next;
}

// ============================================================================
// Survey creation
// ============================================================================

/**
 * Create and post a new survey in the current channel.
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {string} question       The survey question
 * @param {string} durationChoice Duration string ("24h", "1h30m", …)
 * @param {boolean} anonymous     Whether responses are anonymous in results
 * @param {import("discord.js").Attachment|null} imageAttachment  Optional image
 */
async function createSurvey(interaction, question, durationChoice = "24h", anonymous = false, imageAttachment = null) {
  try {
    // ── Validate results channel ──────────────────────────────────────
    if (!SURVEY_RESULTS_CHANNEL_ID) {
      return interaction.reply({
        content: "❌ **Survey results channel is not configured.**\nSet `SURVEY_RESULTS_CHANNEL_ID` in your `.env` or in `config/channels.js`.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const resultsChannel = await interaction.client.channels.fetch(SURVEY_RESULTS_CHANNEL_ID).catch(() => null);
    if (!resultsChannel) {
      return interaction.reply({
        content: "❌ **Cannot find the survey results channel.** Verify the ID in config.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const surveyDuration = parseDuration(durationChoice);
    const durationText = getDurationText(durationChoice);
    const closesAt = Date.now() + surveyDuration;
    const closesTimestamp = Math.floor(closesAt / 1000);
    const imageUrl = imageAttachment ? imageAttachment.url : null;

    // ── Build the public embed ────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setTitle("📋 Survey")
      .setDescription(question)
      .setColor("#2B82D1")
      .addFields(
        { name: "📊 Responses", value: "0", inline: true },
        { name: "⏰ Closes", value: `<t:${closesTimestamp}:R>`, inline: true },
        { name: "📝 Mode", value: anonymous ? "Anonymous" : "Public", inline: true },
      )
      .setFooter({ text: `Created by ${interaction.user.displayName} • Click below to respond` })
      .setTimestamp();

    // Add image if provided
    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    // ── Build the button ──────────────────────────────────────────────
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("survey_respond") // real custom ID is updated after message is sent
        .setLabel("📝 Respond")
        .setStyle(ButtonStyle.Primary),
    );

    // ── Send the survey message ───────────────────────────────────────
    const message = await interaction.channel.send({
      embeds: [embed],
      components: [row],
    });

    // Update button customId with the actual message ID for uniqueness
    const updatedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`survey_respond_${message.id}`)
        .setLabel("📝 Respond")
        .setStyle(ButtonStyle.Primary),
    );
    await message.edit({ components: [updatedRow] });

    // ── Persist state ─────────────────────────────────────────────────
    const state = loadSurveyState();
    state[message.id] = {
      messageId: message.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      question,
      anonymous,
      imageUrl: imageUrl || null,
      responses: {},        // { userId: { text, displayName, updatedAt } }
      createdAt: Date.now(),
      createdBy: interaction.user.id,
      duration: surveyDuration,
      durationChoice,
    };
    await saveSurveyState(state);

    // ── Schedule closure ──────────────────────────────────────────────
    scheduleSurveyClosure(interaction.client, message.id, surveyDuration);

    // ── Announce in results channel ───────────────────────────────────
    const announceEmbed = new EmbedBuilder()
      .setTitle("📋 New survey started")
      .setDescription(question)
      .setColor("#2B82D1")
      .addFields(
        { name: "Created by", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Channel", value: `<#${interaction.channel.id}>`, inline: true },
        { name: "Closes", value: `<t:${closesTimestamp}:R>`, inline: true },
        { name: "Mode", value: anonymous ? "🔒 Anonymous" : "👁️ Public", inline: true },
      )
      .setTimestamp();

    await resultsChannel.send({ embeds: [announceEmbed] }).catch((e) =>
      console.warn("[Survey] Failed to post announcement in results channel:", e.message)
    );

    // ── Confirm to the creator ────────────────────────────────────────
    await interaction.reply({
      content: `✅ Survey created! ⏱️ Closes in **${durationText}**\n[Jump to survey](${message.url})`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error("[Survey] Error creating survey:", error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while creating the survey.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (e) {
      console.error("[Survey] Failed to send error reply:", e);
    }
  }
}

// ============================================================================
// Handle "Respond" button click → open Modal
// ============================================================================

async function handleSurveyButton(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("survey_respond_")) return;

  const surveyMessageId = interaction.customId.replace("survey_respond_", "");
  const state = loadSurveyState();
  const survey = state[surveyMessageId];

  if (!survey) {
    return interaction.reply({
      content: "❌ This survey has ended or no longer exists.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check expiry
  if (Date.now() - survey.createdAt > survey.duration) {
    return interaction.reply({
      content: "⏰ This survey has closed. You can no longer respond.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Build the modal
  const previousAnswer = survey.responses[interaction.user.id]?.text || "";

  const modal = new ModalBuilder()
    .setCustomId(`survey_modal_${surveyMessageId}`)
    .setTitle("📋 Survey Response");

  // Truncate question to 45 chars for the label (Discord limit)
  const labelText = survey.question.length > 45
    ? survey.question.substring(0, 42) + "..."
    : survey.question;

  const textInput = new TextInputBuilder()
    .setCustomId("survey_answer")
    .setLabel(labelText)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Type your answer here…")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2000);

  // Pre-fill with previous answer if updating
  if (previousAnswer) {
    textInput.setValue(previousAnswer);
  }

  modal.addComponents(new ActionRowBuilder().addComponents(textInput));

  await interaction.showModal(modal);
}

// ============================================================================
// Handle Modal submission
// ============================================================================

async function handleSurveyModalSubmit(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("survey_modal_")) return;

  const surveyMessageId = interaction.customId.replace("survey_modal_", "");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const answer = interaction.fields.getTextInputValue("survey_answer").trim();
  if (!answer) {
    return interaction.editReply({
      content: "❌ Your response cannot be empty.",
    });
  }

  const result = await withSurveyLock(surveyMessageId, async () => {
    const state = loadSurveyState();
    const survey = state[surveyMessageId];

    if (!survey) {
      return { error: "❌ This survey no longer exists." };
    }

    if (Date.now() - survey.createdAt > survey.duration) {
      return { error: "⏰ This survey has closed. You can no longer respond." };
    }

    const isUpdate = !!survey.responses[interaction.user.id];
    const userId = interaction.user.id;
    const displayName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;

    // Save the response
    survey.responses[userId] = {
      text: answer,
      displayName,
      username: interaction.user.username,
      updatedAt: Date.now(),
    };
    await saveSurveyState(state);

    // ── Post / update in results channel ────────────────────────────────
    try {
      const resultsChannel = await interaction.client.channels.fetch(SURVEY_RESULTS_CHANNEL_ID).catch(() => null);
      if (resultsChannel) {
        const responseEmbed = new EmbedBuilder()
          .setColor(isUpdate ? "#FFA500" : "#57F287")
          .setTitle(isUpdate ? "✏️ Survey response updated" : "📩 New survey response")
          .setDescription(`**Question:** ${survey.question}`)
          .addFields({ name: "Response", value: answer.length > 1024 ? answer.substring(0, 1021) + "…" : answer })
          .setTimestamp();

        if (survey.anonymous) {
          responseEmbed.setFooter({ text: `Anonymous respondent • ${isUpdate ? "Updated" : "New"} response` });
        } else {
          responseEmbed
            .setAuthor({
              name: displayName,
              iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 64 }),
            })
            .setFooter({ text: `User: ${interaction.user.username} (${userId})` });
        }

        await resultsChannel.send({ embeds: [responseEmbed] });
      }
    } catch (err) {
      console.error("[Survey] Failed to post response in results channel:", err);
    }

    // ── Update the original survey embed (response count) ──────────────
    try {
      const channel = await interaction.client.channels.fetch(survey.channelId);
      const message = await channel.messages.fetch(surveyMessageId);
      if (message) {
        const responseCount = Object.keys(survey.responses).length;
        const closesTimestamp = Math.floor((survey.createdAt + survey.duration) / 1000);
        const updatedEmbed = new EmbedBuilder()
          .setTitle("📋 Survey")
          .setDescription(survey.question)
          .setColor("#2B82D1")
          .addFields(
            { name: "📊 Responses", value: `${responseCount}`, inline: true },
            { name: "⏰ Closes", value: `<t:${closesTimestamp}:R>`, inline: true },
            { name: "📝 Mode", value: survey.anonymous ? "Anonymous" : "Public", inline: true },
          )
          .setFooter({ text: `Click below to respond • ${responseCount} response${responseCount !== 1 ? "s" : ""} so far` })
          .setTimestamp(new Date(survey.createdAt));

        // Preserve image if one was attached
        if (survey.imageUrl) {
          updatedEmbed.setImage(survey.imageUrl);
        }

        await message.edit({ embeds: [updatedEmbed] });
      }
    } catch (err) {
      console.warn("[Survey] Failed to update survey embed:", err.message);
    }

    return { isUpdate };
  });

  if (result.error) {
    return interaction.editReply({ content: result.error });
  }

  // ── Confirm to the respondent ───────────────────────────────────────
  await interaction.editReply({
    content: result.isUpdate
      ? "✅ Your survey response has been **updated** successfully!"
      : "✅ Your survey response has been **submitted** successfully! Thank you.",
  });
}

// ============================================================================
// Auto-close
// ============================================================================

function scheduleSurveyClosure(client, messageId, duration = DEFAULT_SURVEY_DURATION) {
  // Cap the timeout to 2^31-1 ms (~24.8 days) to avoid Node.js overflow
  const MAX_TIMEOUT = 2147483647;
  const timeout = Math.min(duration, MAX_TIMEOUT);

  setTimeout(() => {
    closeSurvey(client, messageId);
  }, timeout);
}

async function closeSurvey(client, messageId) {
  return withSurveyLock(messageId, async () => {
    try {
      const state = loadSurveyState();
      const survey = state[messageId];
      if (!survey) return;

      console.log(`[Survey] Closing survey "${survey.question}" with ${Object.keys(survey.responses).length} responses`);

      // ── Disable the button on original message ──────────────────────
      try {
        const channel = await client.channels.fetch(survey.channelId);
        const message = await channel.messages.fetch(messageId);
        if (message) {
          const responseCount = Object.keys(survey.responses).length;
          const closedEmbed = new EmbedBuilder()
            .setTitle("📋 Survey — Closed")
            .setDescription(survey.question)
            .setColor("#95A5A6") // grey
            .addFields(
              { name: "📊 Total responses", value: `${responseCount}`, inline: true },
              { name: "📝 Mode", value: survey.anonymous ? "Anonymous" : "Public", inline: true },
            )
            .setFooter({ text: `Survey closed • ${responseCount} response${responseCount !== 1 ? "s" : ""} received` })
            .setTimestamp();

          // Preserve image if one was attached
          if (survey.imageUrl) {
            closedEmbed.setImage(survey.imageUrl);
          }

          // Disabled button
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`survey_respond_${messageId}`)
              .setLabel("📝 Survey Closed")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );

          await message.edit({ embeds: [closedEmbed], components: [disabledRow] });
        }
      } catch (err) {
        console.warn("[Survey] Could not update original message on close:", err.message);
      }

      // ── Post summary in results channel ─────────────────────────────
      try {
        const resultsChannel = await client.channels.fetch(SURVEY_RESULTS_CHANNEL_ID).catch(() => null);
        if (resultsChannel) {
          const responses = Object.values(survey.responses);
          const responseCount = responses.length;

          const summaryEmbed = new EmbedBuilder()
            .setTitle("📋 Survey closed — Summary")
            .setDescription(`**Question:** ${survey.question}`)
            .setColor("#95A5A6")
            .addFields(
              { name: "Total responses", value: `${responseCount}`, inline: true },
              { name: "Mode", value: survey.anonymous ? "🔒 Anonymous" : "👁️ Public", inline: true },
              { name: "Duration", value: getDurationText(survey.durationChoice), inline: true },
            )
            .setTimestamp();

          await resultsChannel.send({ embeds: [summaryEmbed] });

          // Post all responses as a recap (max 10 per embed batch to stay under limits)
          if (responseCount > 0) {
            const chunks = chunkArray(responses, 10);
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              const recapEmbed = new EmbedBuilder()
                .setTitle(`📋 All responses (${i * 10 + 1}–${i * 10 + chunk.length} of ${responseCount})`)
                .setColor("#2B82D1");

              for (const resp of chunk) {
                const fieldName = survey.anonymous
                  ? "Anonymous"
                  : `${resp.displayName} (${resp.username})`;
                const fieldValue = resp.text.length > 1024
                  ? resp.text.substring(0, 1021) + "…"
                  : resp.text;
                recapEmbed.addFields({ name: fieldName, value: fieldValue });
              }

              await resultsChannel.send({ embeds: [recapEmbed] });
            }
          }
        }
      } catch (err) {
        console.error("[Survey] Failed to post closing summary:", err);
      }

      // ── Remove from state ────────────────────────────────────────────
      delete state[messageId];
      await saveSurveyState(state);

      console.log(`✅ Survey ${messageId} closed.`);
    } catch (error) {
      console.error("[Survey] Error closing survey:", error);
    }
  });
}

// ============================================================================
// Startup: check & reschedule active surveys
// ============================================================================

function checkExpiredSurveys(client) {
  const state = loadSurveyState();
  const now = Date.now();

  Object.entries(state).forEach(([messageId, survey]) => {
    const elapsed = now - survey.createdAt;
    if (elapsed >= survey.duration) {
      closeSurvey(client, messageId);
    } else {
      const remaining = survey.duration - elapsed;
      scheduleSurveyClosure(client, messageId, remaining);
      console.log(`[Survey] Rescheduled "${survey.question}" — closes in ${Math.round(remaining / 60000)}min`);
    }
  });
}

// ============================================================================
// Helpers
// ============================================================================

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  createSurvey,
  handleSurveyButton,
  handleSurveyModalSubmit,
  checkExpiredSurveys,
  loadSurveyState,
  saveSurveyState,
};
