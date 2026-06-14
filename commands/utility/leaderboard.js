const {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");
const {
  addScore,
  getEntries,
  removeEntry,
  resetLeaderboard,
  setScore,
} = require("../../utils/leaderboardStore");
const { renderLeaderboardPng } = require("../../utils/leaderboardImage");
const {
  getMemberHubSheetsStatus,
  syncLeaderboardToGoogleSheets,
} = require("../../utils/memberHubSheets");
const { LEADER_ROLE_ID, STAFF_ROLE_ID } = require("../../config/channels");

function canManageLeaderboard(interaction) {
  const roles = interaction.member?.roles?.cache;
  return Boolean(
    roles?.has(LEADER_ROLE_ID) ||
      roles?.has(STAFF_ROLE_ID) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

async function sendLeaderboard(interaction) {
  await interaction.deferReply();

  const png = renderLeaderboardPng(getEntries());
  const attachment = new AttachmentBuilder(png, {
    name: "xpro-leaderboard.png",
  });

  return interaction.editReply({
    files: [attachment],
  });
}

function requireManager(interaction) {
  if (canManageLeaderboard(interaction)) return null;

  return interaction.reply({
    content: "❌ You do not have permission to manage the leaderboard.",
    flags: MessageFlags.Ephemeral,
  });
}

async function syncLeaderboardIfConfigured() {
  const status = getMemberHubSheetsStatus();
  if (!status.configured) return "";

  try {
    await syncLeaderboardToGoogleSheets();
    return "\n📄 Synced to Google Sheets.";
  } catch (error) {
    console.warn("[Leaderboard] Google Sheets sync failed:", error.message);
    return `\n⚠️ Score saved, but Google Sheets sync failed: ${error.message}`;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show and manage the XPRO member leaderboard.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show the XPRO top 5 leaderboard."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set a member score.")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Member display name.")
            .setRequired(true)
            .setMaxLength(50),
        )
        .addIntegerOption((option) =>
          option
            .setName("score")
            .setDescription("New total score.")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(100000000),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add or subtract points from a member score.")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Member display name.")
            .setRequired(true)
            .setMaxLength(50),
        )
        .addIntegerOption((option) =>
          option
            .setName("points")
            .setDescription("Points to add. Use a negative value to subtract.")
            .setRequired(true)
            .setMinValue(-100000000)
            .setMaxValue(100000000),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a member from the leaderboard.")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Member display name.")
            .setRequired(true)
            .setMaxLength(50),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Clear all leaderboard scores.")
        .addStringOption((option) =>
          option
            .setName("confirm")
            .setDescription("Type RESET to confirm.")
            .setRequired(true)
            .setMaxLength(10),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sync")
        .setDescription("Sync the current leaderboard to the XPRO Member Hub Google Sheet."),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      return sendLeaderboard(interaction);
    }

    const permissionReply = requireManager(interaction);
    if (permissionReply) return permissionReply;

    if (subcommand === "set") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const name = interaction.options.getString("name");
      const score = interaction.options.getInteger("score");
      const result = await setScore(name, score);
      const syncNote = result.error ? "" : await syncLeaderboardIfConfigured();

      return interaction.editReply({
        content: result.error
          ? `❌ ${result.error}`
          : `✅ **${result.entry.name}** score set to **${result.entry.score}**.${syncNote}`,
      });
    }

    if (subcommand === "add") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const name = interaction.options.getString("name");
      const points = interaction.options.getInteger("points");
      const result = await addScore(name, points);
      const syncNote = result.error ? "" : await syncLeaderboardIfConfigured();

      return interaction.editReply({
        content: result.error
          ? `❌ ${result.error}`
          : `✅ **${result.entry.name}** now has **${result.entry.score}** points.${syncNote}`,
      });
    }

    if (subcommand === "remove") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const name = interaction.options.getString("name");
      const removed = await removeEntry(name);
      const syncNote = removed ? await syncLeaderboardIfConfigured() : "";

      return interaction.editReply({
        content: removed
          ? `✅ **${name}** removed from the leaderboard.${syncNote}`
          : "❌ This member was not found in the leaderboard.",
      });
    }

    if (subcommand === "reset") {
      const confirm = interaction.options.getString("confirm");
      if (confirm !== "RESET") {
        return interaction.reply({
          content: "❌ Reset cancelled. Type `RESET` exactly to confirm.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await resetLeaderboard();
      const syncNote = await syncLeaderboardIfConfigured();
      return interaction.editReply({
        content: `✅ Leaderboard reset.${syncNote}`,
      });
    }

    if (subcommand === "sync") {
      const status = getMemberHubSheetsStatus();
      if (!status.configured) {
        return interaction.reply({
          content: `❌ Google Sheets sync is not configured. Missing: ${status.missing.join(", ")}.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await syncLeaderboardToGoogleSheets();
      return interaction.editReply({
        content: `✅ Leaderboard synced to Google Sheets (${result.updatedRows || 0} row(s)).`,
      });
    }
  },
};
