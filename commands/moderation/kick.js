const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulser un membre du serveur.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre à expulser.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("raison")
        .setDescription("Raison du kick.")
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("membre");
    const reason = interaction.options.getString("raison") || "Aucune raison fournie.";
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: "❌ Je ne trouve pas ce membre sur le serveur.", ephemeral: true });
    }

    if (!member.kickable) {
      return interaction.reply({ content: "❌ Je ne peux pas expulser ce membre (rôle trop élevé ou permissions insuffisantes).", ephemeral: true });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({ content: "❌ Tu ne peux pas te kicker toi-même.", ephemeral: true });
    }

    await member.kick(`${reason} (par ${interaction.user.tag})`);

    await interaction.reply(`👢 **${target.tag}** a été expulsé.\n📝 Raison : ${reason}`);
  }
};
