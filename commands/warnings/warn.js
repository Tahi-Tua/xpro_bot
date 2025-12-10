const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Avertir un membre (système de renforcement automatique)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre à avertir")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("raison")
        .setDescription("Raison de l'avertissement")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("membre");
    const reason = interaction.options.getString("raison");
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        content: "âŒ Je ne trouve pas ce membre sur le serveur.",
        ephemeral: true
      });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({
        content: "âŒ Tu ne peux pas t'avertir toi-même.",
        ephemeral: true
      });
    }

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "âŒ Tu ne peux pas avertir un administrateur.",
        ephemeral: true
      });
    }

    // Access the warning system from the client
    const { addWarning, enforceWarning } = require("../../index-helpers");
    
    const warningCount = addWarning(target.id, reason, interaction.user.tag);
    
    await interaction.reply(
      `âš ï¸ **${target.tag}** a reçu un avertissement (#${warningCount}).\n` +
      `ðŸ"Œ Raison : ${reason}\n` +
      `ðŸ"Š Total : ${warningCount} avertissement(s)`
    );

    await enforceWarning(interaction.guild, member, warningCount, reason, interaction.user.tag);
  }
};
