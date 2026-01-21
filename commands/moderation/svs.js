const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { sendReminder } = require("../../handlers/svsReminder");
const { SVS_REMINDER_CHANNEL_ID } = require("../../config/channels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("svs")
    .setDescription("Manually trigger an SVS reminder")
    .addBooleanOption(option =>
      option
        .setName("test")
        .setDescription("Test mode - teams form after 1 minute instead of 20")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const channel = interaction.client.channels.cache.get(SVS_REMINDER_CHANNEL_ID);
      const isTest = interaction.options.getBoolean("test") || false;
      
      if (!channel) {
        await interaction.editReply({
          content: "❌ SVS reminder channel not found.",
        });
        return;
      }

      const timeoutMs = isTest ? 60 * 1000 : 20 * 60 * 1000;
      await sendReminder(channel, timeoutMs);

      const timeMsg = isTest ? "1 minute (TEST MODE)" : "20 minutes";
      await interaction.editReply({
        content: `✅ SVS reminder sent to ${channel}! Teams will be formed in ${timeMsg}.`,
      });

    } catch (error) {
      console.error("SVS command error:", error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`,
      });
    }
  },
};
