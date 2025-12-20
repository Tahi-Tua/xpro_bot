const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("Member to ban.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the ban.")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("member");
    const reason = interaction.options.getString("reason") || "No reason provided.";
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: "I cannot find this member on the server.", flags: MessageFlags.Ephemeral });
    }

    if (!member.bannable) {
      return interaction.reply({ content: "I cannot ban this member (role too high or insufficient permissions).", flags: MessageFlags.Ephemeral });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({ content: "You cannot ban yourself.", flags: MessageFlags.Ephemeral });
    }

    await member.ban({ reason: `${reason} (by ${interaction.user.tag})` });

    await interaction.reply(`**${target.tag}** has been banned.\nReason: ${reason}`);
  }
};
