const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require("discord.js");
const { scanChannel, logScanResults } = require("../../utils/historyScanner");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("scan")
    .setDescription("Scan channel history for spam and bad words")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to scan (default: current channel)")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Maximum messages to scan (default: 500)")
        .setMinValue(10)
        .setMaxValue(1000)
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("delete")
        .setDescription("Delete violations automatically (default: false)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const maxMessages = interaction.options.getInteger("limit") || 500;
    const deleteViolations = interaction.options.getBoolean("delete") || false;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await interaction.editReply({
        content: `🔍 Scanning ${channel}... This may take a moment.`,
      });

      const results = await scanChannel(channel, {
        maxMessages,
        deleteViolations,
        guild: interaction.guild,
      });

      await logScanResults(interaction.guild, channel, results);

      let summary = `✅ Scan complete for ${channel}\n\n`;
      summary += `📊 **Results:**\n`;
      summary += `• Messages scanned: ${results.scanned}\n`;
      summary += `• Bad words found: ${results.badwords.length}\n`;
      summary += `• Spam detected: ${results.spam.length}\n`;

      if (deleteViolations && (results.badwords.length > 0 || results.spam.length > 0)) {
        summary += `\n🗑️ Violations have been deleted.`;
      }

      if (results.badwords.length > 0 || results.spam.length > 0) {
        summary += `\n\n📋 Full report sent to moderation log.`;
      }

      if (results.errors.length > 0) {
        summary += `\n\n⚠️ Errors: ${results.errors.join(", ")}`;
      }

      await interaction.editReply({ content: summary });

    } catch (error) {
      console.error("Scan error:", error);
      await interaction.editReply({
        content: `❌ Error scanning channel: ${error.message}`,
      });
    }
  },
};
