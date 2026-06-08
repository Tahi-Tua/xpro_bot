const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
  LEADER_ROLE_ID,
  MEMBER_RANKINGS_CHANNEL_ID,
  MODERATION_LOG_CHANNEL_ID,
  STAFF_ROLE_ID,
} = require("../../config/channels");
const {
  getAllRankings,
  getPublishedMessageId,
  getTopRankings,
  removeMemberRanking,
  resetRankings,
  setPublishedMessageId,
  upsertMemberRanking,
} = require("../../utils/memberRankingStore");
const { buildMemberRankingEmbed, formatNumber } = require("../../utils/memberRankingEmbed");

function canManageRankings(interaction) {
  const roles = interaction.member?.roles?.cache;
  return Boolean(
    roles?.has(LEADER_ROLE_ID) ||
      roles?.has(STAFF_ROLE_ID) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

async function sendRankingAuditLog(interaction, action, details = "") {
  const channel = interaction.guild.channels.cache.get(MODERATION_LOG_CHANNEL_ID) ||
    await interaction.guild.channels.fetch(MODERATION_LOG_CHANNEL_ID).catch(() => null);

  if (!channel?.isTextBased?.()) return;

  await channel.send({
    content:
      `🏆 **Ranking audit**\n` +
      `Action: **${action}**\n` +
      `By: ${interaction.user.tag} (${interaction.user.id})\n` +
      `${details}`,
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

function rankingSummary(rankings) {
  if (!rankings.length) return "No rankings saved.";
  return rankings
    .slice(0, 10)
    .map((entry, index) => {
      return `${index + 1}. <@${entry.userId}> — score **${formatNumber(entry.score)}** | weekly ${formatNumber(entry.weekly)} | season ${formatNumber(entry.season)} | daily XP ${formatNumber(entry.dailyXp)}`;
    })
    .join("\n");
}

async function publishRanking(interaction) {
  const channel = interaction.guild.channels.cache.get(MEMBER_RANKINGS_CHANNEL_ID) ||
    await interaction.guild.channels.fetch(MEMBER_RANKINGS_CHANNEL_ID).catch(() => null);

  if (!channel?.isTextBased?.()) {
    return { ok: false, error: `Ranking channel not found or not text-based: ${MEMBER_RANKINGS_CHANNEL_ID}` };
  }

  const top = getTopRankings(5);
  const embed = buildMemberRankingEmbed(top, { updatedBy: `${interaction.user.tag}` });
  const publishedMessageId = getPublishedMessageId();

  if (publishedMessageId) {
    const oldMessage = await channel.messages.fetch(publishedMessageId).catch(() => null);
    if (oldMessage) {
      await oldMessage.edit({ embeds: [embed] });
      return { ok: true, updated: true, messageId: oldMessage.id, channel };
    }
  }

  const message = await channel.send({ embeds: [embed] });
  await setPublishedMessageId(message.id);
  return { ok: true, updated: false, messageId: message.id, channel };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Manage Bullet Echo member rankings.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set or update a member ranking score.")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Discord member to rank.")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("weekly")
            .setDescription("Weekly contribution score.")
            .setMinValue(0)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("season")
            .setDescription("Season contribution score.")
            .setMinValue(0)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("daily_xp")
            .setDescription("Daily XP contribution score.")
            .setMinValue(0)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show the current Top 5 ranking."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("publish")
        .setDescription("Publish or update the ranking embed in the rankings channel."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a member from rankings.")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Discord member to remove.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset all rankings.")
        .addStringOption((option) =>
          option
            .setName("confirm")
            .setDescription('Type "RESET RANKINGS" to confirm.')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      const embed = buildMemberRankingEmbed(getTopRankings(5));
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!canManageRankings(interaction)) {
      return interaction.reply({
        content: "❌ You do not have permission to manage member rankings.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "set") {
      const member = interaction.options.getUser("member");
      const weekly = interaction.options.getInteger("weekly");
      const season = interaction.options.getInteger("season");
      const dailyXp = interaction.options.getInteger("daily_xp") || 0;

      await upsertMemberRanking({
        userId: member.id,
        tag: member.tag,
        weekly,
        season,
        dailyXp,
        updatedBy: interaction.user.id,
      });

      await sendRankingAuditLog(
        interaction,
        "set",
        `Member: ${member.tag} (${member.id})\nWeekly: ${weekly}\nSeason: ${season}\nDaily XP: ${dailyXp}\n`,
      );

      return interaction.reply({
        content: `✅ Ranking updated for **${member.tag}**.\nScore total: **${formatNumber(weekly + season + dailyXp)}**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "publish") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await publishRanking(interaction);
      if (!result.ok) {
        return interaction.editReply(`❌ ${result.error}`);
      }

      await sendRankingAuditLog(interaction, result.updated ? "publish_update" : "publish_new", `Message ID: ${result.messageId}\n`);
      return interaction.editReply(
        result.updated
          ? `✅ Ranking message updated in ${result.channel}.`
          : `✅ Ranking message published in ${result.channel}.`,
      );
    }

    if (subcommand === "remove") {
      const member = interaction.options.getUser("member");
      const removed = await removeMemberRanking(member.id);
      await sendRankingAuditLog(interaction, "remove", `Member: ${member.tag} (${member.id})\nRemoved: ${removed ? "yes" : "no"}\n`);

      return interaction.reply({
        content: removed
          ? `✅ **${member.tag}** removed from rankings.`
          : `ℹ️ **${member.tag}** was not present in rankings.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "reset") {
      const confirm = interaction.options.getString("confirm");
      if (confirm !== "RESET RANKINGS") {
        return interaction.reply({
          content: '❌ Reset cancelled. Type exactly `RESET RANKINGS`.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await resetRankings();
      await sendRankingAuditLog(interaction, "reset", "All ranking data cleared.\n");

      return interaction.reply({
        content: "✅ All member rankings have been reset.",
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: rankingSummary(getAllRankings()),
      flags: MessageFlags.Ephemeral,
    });
  },
};
