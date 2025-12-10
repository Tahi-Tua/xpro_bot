const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Voir les avertissements d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre à consulter")
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("membre");
    const { getWarnings } = require("../../index-helpers");
    
    const warnings = getWarnings(target.id);

    if (warnings.length === 0) {
      return interaction.reply({
        content: `âœ… **${target.tag}** n'a aucun avertissement.`,
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xff6b00)
      .setTitle(`âš ï¸ Avertissements de ${target.tag}`)
      .setDescription(`Total : **${warnings.length}** avertissement(s)`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    warnings.forEach((warn, index) => {
      const date = new Date(warn.timestamp).toLocaleString("fr-FR");
      embed.addFields({
        name: `#${index + 1} - ${date}`,
        value: `ðŸ"Œ Raison : ${warn.reason}\nðŸ'® Modérateur : ${warn.moderator}`,
        inline: false
      });
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
