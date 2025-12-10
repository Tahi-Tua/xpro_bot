const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Effacer tous les avertissements d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre dont les avertissements seront effacés")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("membre");
    const { clearWarnings, getWarnings } = require("../../index-helpers");
    
    const warnings = getWarnings(target.id);

    if (warnings.length === 0) {
      return interaction.reply({
        content: `âœ… **${target.tag}** n'a aucun avertissement à effacer.`,
        ephemeral: true
      });
    }

    const count = warnings.length;
    clearWarnings(target.id);

    await interaction.reply(
      `âœ… **${count}** avertissement(s) de **${target.tag}** ont été effacés.`
    );
  }
};
