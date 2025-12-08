const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannir un membre du serveur.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre à bannir.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("raison")
        .setDescription("Raison du ban.")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("membre");
    const reason = interaction.options.getString("raison") || "Aucune raison fournie.";
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: "❌ Je ne trouve pas ce membre sur le serveur.", ephemeral: true });
    }

    if (!member.bannable) {
      return interaction.reply({ content: "❌ Je ne peux pas bannir ce membre (rôle trop élevé ou permissions insuffisantes).", ephemeral: true });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({ content: "❌ Tu ne peux pas te bannir toi-même.", ephemeral: true });
    }

    await member.ban({ reason: `${reason} (par ${interaction.user.tag})` });

    await interaction.reply(`🔨 **${target.tag}** a été banni.\n📝 Raison : ${reason}`);
  }
};
