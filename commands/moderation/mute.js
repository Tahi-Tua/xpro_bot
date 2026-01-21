const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a member for a specified duration.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName("member").setDescription("Member to mute").setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("duration")
        .setDescription("Ex: 1m, 5m, 10m, 1h, 1d")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("reason").setDescription("Reason for the mute").setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("member");
    const member = interaction.guild.members.cache.get(target.id);
    const durationInput = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") || "No reason provided";

    if (!member) return interaction.reply({ content: "User not found.", flags: MessageFlags.Ephemeral });

    if (member.id === interaction.user.id)
      return interaction.reply({ content: "You cannot mute yourself.", flags: MessageFlags.Ephemeral });

    // Check if the target is an administrator using the proper permission flag
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "You cannot mute an administrator.", flags: MessageFlags.Ephemeral });
    }

    const timeMap = {
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000
    };

    const match = durationInput.match(/^(\d+)(m|h|d)$/);

    if (!match) {
      return interaction.reply({
        content: "Invalid format. Use: `1m`, `5m`, `10m`, `1h`, `1d`",
        flags: MessageFlags.Ephemeral
      });
    }

    const amount = parseInt(match[1]);
    const unit = match[2];
    const durationMs = amount * timeMap[unit];

    // Define a maximum mute duration to prevent accidentally muting users for
    // extremely long periods.  Here we cap the duration at 7 days (604800000 ms).
    const MAX_MUTE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
    if (durationMs > MAX_MUTE_DURATION_MS) {
      return interaction.reply({
        content: `⏱️ The specified duration is too long. The maximum allowed mute is 7 days.`,
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await member.timeout(durationMs, reason);
    } catch (err) {
      console.log(err);
      return interaction.reply({ content: "Unable to mute this member.", flags: MessageFlags.Ephemeral });
    }

    await interaction.reply(`**${target.tag}** has been muted for **${durationInput}**.\nReason: ${reason}`);
  }
};
