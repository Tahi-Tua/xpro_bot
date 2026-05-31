const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { startBlackjackPlay } = require("../../handlers/blackjackManager");
const { getBlackjackService, BLACKJACK_CONFIG } = require("../../services/blackjackService");
const {
  buildBalanceEmbed,
  buildStatsEmbed,
  buildLeaderboardEmbed,
  buildDailyEmbed,
  buildHelpEmbed,
} = require("../../components/blackjackView");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play Blackjack 21 with virtual chips.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("play")
        .setDescription("Start a Blackjack game.")
        .addIntegerOption((option) =>
          option
            .setName("bet")
            .setDescription(`Bet amount (${BLACKJACK_CONFIG.minBet}-${BLACKJACK_CONFIG.maxBet}, multiple of ${BLACKJACK_CONFIG.betStep}).`)
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000000),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("balance")
        .setDescription("View a Blackjack balance.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to inspect. Defaults to you.")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("View Blackjack stats.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to inspect. Defaults to you.")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show the Blackjack leaderboard."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("daily")
        .setDescription("Claim your daily Blackjack chips."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("help")
        .setDescription("Show Blackjack rules and commands."),
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "❌ Blackjack is available only inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const service = getBlackjackService();

    if (subcommand === "play") {
      return startBlackjackPlay(interaction, interaction.options.getInteger("bet"));
    }

    if (subcommand === "balance") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const profile = service.getProfile(interaction.guild.id, targetUser.id);
      return interaction.reply({
        embeds: [buildBalanceEmbed({ targetUser, profile })],
      });
    }

    if (subcommand === "stats") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const profile = service.getProfile(interaction.guild.id, targetUser.id);
      return interaction.reply({
        embeds: [buildStatsEmbed({ targetUser, profile })],
      });
    }

    if (subcommand === "leaderboard") {
      return interaction.reply({
        embeds: [buildLeaderboardEmbed(service.getLeaderboard(interaction.guild.id, 10))],
      });
    }

    if (subcommand === "daily") {
      return interaction.reply({
        embeds: [buildDailyEmbed(service.claimDaily(interaction.guild.id, interaction.user.id))],
      });
    }

    return interaction.reply({
      embeds: [buildHelpEmbed()],
    });
  },
};
