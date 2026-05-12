const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const {
  createTournament,
  closeTournament,
  listOpenTournaments,
} = require("../../handlers/tournamentManager");
const { LEADER_ROLE_ID, STAFF_ROLE_ID } = require("../../config/channels");

function canManageTournaments(interaction) {
  const roles = interaction.member?.roles?.cache;
  return Boolean(
    roles?.has(LEADER_ROLE_ID) ||
      roles?.has(STAFF_ROLE_ID) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tournament")
    .setDescription("Create and manage tournament registrations.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Open a tournament registration.")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Tournament name.")
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Short tournament description or rules.")
            .setRequired(false)
            .setMaxLength(1000),
        )
        .addIntegerOption((option) =>
          option
            .setName("max_players")
            .setDescription("Maximum registered players. Leave empty for no limit.")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(500),
        )
        .addStringOption((option) =>
          option
            .setName("date")
            .setDescription("Tournament date/time text.")
            .setRequired(false)
            .setMaxLength(100),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("close")
        .setDescription("Close a tournament registration.")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Tournament registration message ID.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List open tournament registrations."),
    ),

  async execute(interaction) {
    if (!canManageTournaments(interaction)) {
      return interaction.reply({
        content: "❌ You do not have permission to manage tournament registrations.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const tournament = await createTournament(interaction, {
        name: interaction.options.getString("name"),
        description: interaction.options.getString("description") || "Tournament registration is open.",
        maxPlayers: interaction.options.getInteger("max_players") || 0,
        dateText: interaction.options.getString("date") || "",
      });

      return interaction.editReply({
        content: `✅ Tournament registration created.\nMessage ID: \`${tournament.messageId}\``,
      });
    }

    if (subcommand === "close") {
      const messageId = interaction.options.getString("message_id");
      const tournament = await closeTournament(interaction.client, messageId);
      return interaction.reply({
        content: tournament
          ? `✅ Tournament registration **${tournament.name}** closed.`
          : "❌ Tournament registration not found.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const openTournaments = listOpenTournaments();
    const content = openTournaments.length
      ? openTournaments
          .map((tournament) => `• **${tournament.name}** — ${Object.keys(tournament.participants || {}).length} registered — \`${tournament.messageId}\``)
          .join("\n")
      : "No open tournament registrations.";

    return interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  },
};
