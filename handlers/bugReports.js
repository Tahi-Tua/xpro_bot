const {
  Events,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { BUG_REPORTS_CHANNEL_ID, BOT_LOGS_CHANNEL_ID, MOD_ROLE_NAME } = require("../config/channels");

function buildAttachmentList(message) {
  if (!message.attachments || message.attachments.size === 0) return null;
  const items = Array.from(message.attachments.values())
    .slice(0, 10)
    .map((a) => `- ${a.name || "file"}: ${a.url}`);
  return items.join("\n");
}

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author?.bot || !message.inGuild()) return;
    if (message.channel.id !== BUG_REPORTS_CHANNEL_ID) return;

    const logChannel = await message.guild.channels.fetch(BOT_LOGS_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const me = message.guild.members.me;
    const canSend = me?.permissionsIn(logChannel).has(PermissionsBitField.Flags.SendMessages);
    if (!canSend) return;

    const staffRole = message.guild.roles.cache.find((r) => r.name === MOD_ROLE_NAME);
    const content = message.content?.trim() || "(no text)";
    const attachments = buildAttachmentList(message);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🐞 Bug report")
      .addFields(
        { name: "Author", value: `${message.author} (${message.author.tag})`, inline: true },
        { name: "Channel", value: `${message.channel}`, inline: true },
        { name: "Message", value: `[Link](${message.url})`, inline: true },
        { name: "Content", value: content.slice(0, 1000), inline: false },
      )
      .setTimestamp();

    if (attachments) {
      embed.addFields({ name: "Attachments", value: attachments.slice(0, 1000), inline: false });
    }

    const fixId = `bugfix:${message.id}:${message.author.id}`;
    const contactId = `bugcontact:${message.id}:${message.author.id}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(fixId).setLabel("Fix").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(contactId).setLabel("Contact").setStyle(ButtonStyle.Primary),
    );

    await logChannel
      .send({
        content: staffRole ? `${staffRole}` : "",
        embeds: [embed],
        components: [row],
        allowedMentions: { roles: staffRole ? [staffRole.id] : [] },
      })
      .catch(() => {});

    // Acknowledge reporter via DM (best-effort)
    await message.author
      .send(
        "✅ Thanks for your report! It has been received and will be reviewed by the moderators.",
      )
      .catch(() => {});
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    const isFix = interaction.customId.startsWith("bugfix:");
    const isContact = interaction.customId.startsWith("bugcontact:");
    if (!isFix && !isContact) return;
    if (interaction.channelId !== BOT_LOGS_CHANNEL_ID) return;

    const parts = interaction.customId.split(":");
    if (parts.length < 3) return;
    const [, , userId] = parts;

    const reporter = await interaction.client.users.fetch(userId).catch(() => null);

    if (isContact) {
      if (!reporter) {
        await interaction.reply({ content: "Reporter not reachable.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      await reporter
        .send(`🔔 A moderator (${interaction.user.tag}) wants to contact you about your bug report.`)
        .catch(() => {});
      await interaction.reply({
        content: `🔔 Contact request sent${reporter ? ` to ${reporter.tag}` : ""}.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { users: [] },
      });
      return;
    }

    // isFix
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true),
        ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true),
      );
      await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
    } catch {}

    if (reporter) {
      await reporter
        .send(
          `✅ Your bug report was marked as resolved by ${interaction.user.tag}.\n` +
            `Thanks for your help!`,
        )
        .catch(() => {});
    }

    await interaction.message.delete().catch(() => {});

    await interaction.reply({
      content: `✅ Marked as resolved${reporter ? ` and notified ${reporter.tag}` : ""}.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { users: [] },
    });
  });
};
