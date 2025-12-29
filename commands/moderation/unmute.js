const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

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
    const member = interaction.guild.members.cache.get(target.id);

    if (!member)
      return interaction.reply({ content: "Member not found.", flags: MessageFlags.Ephemeral });

    try {
      await member.timeout(null);
    } catch (err) {
      console.log(err);
      return interaction.reply({ content: "Unable to unmute this member.", flags: MessageFlags.Ephemeral });
    }

    await interaction.reply(`**${target.tag}** has been unmuted.`);
  }
};
