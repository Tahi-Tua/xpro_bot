const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Supprime un nombre de messages dans le salon.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Nombre de messages à supprimer (1–100).")
        .setRequired(true)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount");

    if (amount < 1 || amount > 100) {
      return interaction.reply({
        content: "❌ Tu dois choisir un nombre entre **1 et 100**.",
        ephemeral: true
      });
    }

    await interaction.channel.bulkDelete(amount, true);

    await interaction.reply({
      content: `🧹 **${amount} messages supprimés avec succès !**`,
      ephemeral: false
    });
  }
};
