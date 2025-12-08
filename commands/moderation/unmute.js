const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Rend la parole à un membre mute.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("membre").setDescription("Membre à unmute").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("membre");
    const member = interaction.guild.members.cache.get(target.id);

    if (!member)
      return interaction.reply({ content: "❌ Membre introuvable.", ephemeral: true });

    try {
      await member.timeout(null); // retire le mute
    } catch (err) {
      console.log(err);
      return interaction.reply({ content: "❌ Impossible d'unmute ce membre.", ephemeral: true });
    }

    await interaction.reply(`🔊 **${target.tag}** a été unmute.`);

    if (global.sendModLog) {
      global.sendModLog(interaction, "Unmute", target, "Fin de mute manuelle");
    }
  }
};
