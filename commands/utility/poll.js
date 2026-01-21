const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const { createPoll } = require("../../handlers/pollManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create an interactive poll with up to 4 options.")
    .addStringOption(option =>
      option
        .setName("title")
        .setDescription("The title/question of the poll.")
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption(option =>
      option
        .setName("option1")
        .setDescription("First option.")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName("option2")
        .setDescription("Second option.")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName("option3")
        .setDescription("Third option (optional).")
        .setRequired(false)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName("option4")
        .setDescription("Fourth option (optional).")
        .setRequired(false)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName("duration")
        .setDescription("Duration (e.g., 10h, 1h15, 30m, 2h30m)")
        .setRequired(false)
        .setMaxLength(10)
    ),

  async execute(interaction) {
    // Collect options
    const title = interaction.options.getString("title");
    const option1 = interaction.options.getString("option1");
    const option2 = interaction.options.getString("option2");
    const option3 = interaction.options.getString("option3");
    const option4 = interaction.options.getString("option4");
    const durationChoice = interaction.options.getString("duration") || "24h";

    // Validate duration format
    const durationRegex = /^(\d+\s*h(?:\s*\d+\s*m)?|\d+\s*m)$/i;
    if (!durationRegex.test(durationChoice) && !["1h", "6h", "24h", "7d"].includes(durationChoice)) {
      return interaction.reply({
        content: "❌ Invalid duration format. Use formats like: `10h`, `1h25m`, `30m`, `2h30m`, etc.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Filter out empty options and keep only valid ones
    const options = [option1, option2]
      .concat(option3 ? [option3] : [])
      .concat(option4 ? [option4] : []);

    // Validate options
    if (options.some(opt => !opt || opt.trim() === "")) {
      return interaction.reply({
        content: "❌ All provided options must be non-empty.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Create the poll with custom duration
    await createPoll(interaction, title, options, durationChoice);
  },
};
