const crypto = require("crypto");
const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
  LEADER_ROLE_ID,
  STAFF_ROLE_ID,
} = require("../../config/channels");
const {
  getAllRankings,
  getTopRankings,
  removeMemberRanking,
  resetRankings,
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

function normalizePlayerName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function playerKeyFromName(name) {
  const normalized = normalizePlayerName(name).toLowerCase();
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 16);
  return `player:${hash}`;
}

function displayNameFromEntry(entry) {
  return entry.displayName || entry.tag || entry.userId;
}

async function enrichRankingsWithGuildMembers(guild, rankings) {
  return Promise.all(
    rankings.map(async (entry) => {
      if (!/^\d{15,25}$/.test(String(entry.userId || ""))) return entry;

      const member = await guild.members.fetch(entry.userId).catch(() => null);
      if (!member) return entry;

      return {
        ...entry,
        displayName: member.displayName || entry.displayName || entry.tag,
      };
    }),
  );
}

function rankingSummary(rankings) {
  if (!rankings.length) return "No rankings saved.";
  return rankings
    .slice(0, 10)
    .map((entry, index) => {
      return `${index + 1}. **${displayNameFromEntry(entry)}** — season **${formatNumber(entry.season)}**`;
    })
    .join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Manage Bullet Echo member rankings.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set or update a player ranking score.")
        .addStringOption((option) =>
          option
            .setName("member")
            .setDescription("Player display name, even if they are not on Discord.")
            .setMinLength(1)
            .setMaxLength(40)
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
        .setDescription("Show the current Top 5 ranking privately."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("publish")
        .setDescription("Generate a private ranking preview for manual reposting."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a player from rankings.")
        .addStringOption((option) =>
          option
            .setName("member")
            .setDescription("Player display name to remove.")
            .setMinLength(1)
            .setMaxLength(40)
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
      const top = await enrichRankingsWithGuildMembers(interaction.guild, getTopRankings(5));
      const embed = buildMemberRankingEmbed(top, { updatedBy: interaction.user.tag });
      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }

    if (!canManageRankings(interaction)) {
      return interaction.reply({
        content: "❌ You do not have permission to manage member rankings.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "set") {
      const displayName = normalizePlayerName(interaction.options.getString("member"));
      const weekly = interaction.options.getInteger("weekly");
      const season = interaction.options.getInteger("season");
      const dailyXp = interaction.options.getInteger("daily_xp") || 0;
      const playerId = playerKeyFromName(displayName);

      await upsertMemberRanking({
        userId: playerId,
        tag: displayName,
        displayName,
        weekly,
        season,
        dailyXp,
        updatedBy: interaction.user.id,
      });

      return interaction.reply({
        content: `✅ Ranking updated for **${displayName}**.\nSeason score: **${formatNumber(season)}**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "publish") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const top = await enrichRankingsWithGuildMembers(interaction.guild, getTopRankings(5));
      const embed = buildMemberRankingEmbed(top, { updatedBy: interaction.user.tag });
      return interaction.editReply({
        content:
          "🏆 **Private Season Leaderboard Preview**\n" +
          "Copy or screenshot this preview, then repost it manually wherever you want.",
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    }

    if (subcommand === "remove") {
      const displayName = normalizePlayerName(interaction.options.getString("member"));
      const playerId = playerKeyFromName(displayName);
      const removed = await removeMemberRanking(playerId);

      return interaction.reply({
        content: removed
          ? `✅ **${displayName}** removed from rankings.`
          : `ℹ️ **${displayName}** was not present in rankings.`,
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

      return interaction.reply({
        content: "✅ All member rankings have been reset.",
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: rankingSummary(getAllRankings()),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};