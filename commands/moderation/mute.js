const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute un membre pour une durée déterminée.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("membre").setDescription("Membre à mute").setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("durée")
        .setDescription("Ex: 1m, 5m, 10m, 1h, 1d")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("raison").setDescription("Raison du mute").setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("membre");
    const member = interaction.guild.members.cache.get(target.id);
    const durationInput = interaction.options.getString("durée");
    const reason = interaction.options.getString("raison") || "Aucune raison fournie";

    // Vérifications
    if (!member) return interaction.reply({ content: "❌ Utilisateur introuvable.", ephemeral: true });

    if (member.id === interaction.user.id)
      return interaction.reply({ content: "❌ Tu ne peux pas te mute toi-même.", ephemeral: true });

    if (member.permissions.has("Administrator"))
      return interaction.reply({ content: "❌ Tu ne peux pas mute un administrateur.", ephemeral: true });

    // Convertir la durée
    const timeMap = {
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000
    };

    const match = durationInput.match(/^(\d+)(m|h|d)$/);

    if (!match) {
      return interaction.reply({
        content: "❌ Format invalide. Utilise : `1m`, `5m`, `10m`, `1h`, `1d`",
        ephemeral: true
      });
    }

    const amount = parseInt(match[1]);
    const unit = match[2];
    const durationMs = amount * timeMap[unit];

    // Application du mute
    try {
      await member.timeout(durationMs, reason);
    } catch (err) {
      console.log(err);
      return interaction.reply({ content: "❌ Impossible de mute ce membre.", ephemeral: true });
    }

    await interaction.reply(`🔇 **${target.tag}** a été mute pendant **${durationInput}**.\n📌 Raison : ${reason}`);

    // Logs modération
    if (global.sendModLog) {
      global.sendModLog(interaction, "Mute", target, reason);
    }
  }
};
