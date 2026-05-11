const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { liftModerationMute } = require("../../utils/muteActions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a muted member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("member").setDescription("Member to unmute").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("member");

    try {
      const result = await liftModerationMute(
        interaction.guild,
        target.id,
        `Manual unmute by ${interaction.user.tag}`,
      );
      if (!result.memberFound && !result.clearedStore) {
        return interaction.reply({ content: "Member not found.", flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      console.log(err);
      return interaction.reply({ content: "Unable to unmute this member.", flags: MessageFlags.Ephemeral });
    }

    await interaction.reply(`**${target.tag}** has been unmuted.`);
  }
};
