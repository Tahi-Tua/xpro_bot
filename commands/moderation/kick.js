const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("Member to kick.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the kick.")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("member");
    const reason = interaction.options.getString("reason") || "No reason provided.";
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: "I cannot find this member on the server.", flags: MessageFlags.Ephemeral });
    }

    if (!member.kickable) {
      return interaction.reply({ content: "I cannot kick this member (role too high or insufficient permissions).", flags: MessageFlags.Ephemeral });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({ content: "You cannot kick yourself.", flags: MessageFlags.Ephemeral });
    }

    await member.kick(`${reason} (by ${interaction.user.tag})`);

    await interaction.reply(`**${target.tag}** has been kicked.\nReason: ${reason}`);
  }
};
