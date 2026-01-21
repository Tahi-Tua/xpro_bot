const {
  Events,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { TACTICS_SUBMISSIONS_CHANNEL_ID, BOT_LOGS_CHANNEL_ID, MOD_ROLE_NAME } = require("../config/channels");

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
    if (message.channel.id !== TACTICS_SUBMISSIONS_CHANNEL_ID) return;

    const logChannel = await message.guild.channels.fetch(BOT_LOGS_CHANNEL_ID).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const me = message.guild.members.me;
    const canSend = me?.permissionsIn(logChannel).has(PermissionsBitField.Flags.SendMessages);
    if (!canSend) return;

    const staffRole = message.guild.roles.cache.find((r) => r.name === MOD_ROLE_NAME);
    const content = message.content?.trim() || "(no text)";
    const attachments = buildAttachmentList(message);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6) // Purple for tactics
      .setTitle("📑 New Tactic Submission")
      .addFields(
        { name: "Author", value: `${message.author} (${message.author.tag})`, inline: true },
        { name: "Channel", value: `${message.channel}`, inline: true },
        { name: "Post", value: `[Link](${message.url})`, inline: true },
        { name: "Content", value: content.slice(0, 1000), inline: false },
      )
      .setTimestamp();

    if (attachments) {
      embed.addFields({ name: "Attachments", value: attachments.slice(0, 1000), inline: false });
    }

    const approveId = `tacticapprove:${message.id}:${message.author.id}`;
    const contactId = `tacticcontact:${message.id}:${message.author.id}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(approveId).setLabel("Approve").setStyle(ButtonStyle.Success),
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

    // Acknowledge submitter via DM (best-effort)
    await message.author
      .send(
        "✅ Thanks for your tactic submission! It has been received and will be reviewed by the team.",
      )
      .catch(() => {});
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    const isApprove = interaction.customId.startsWith("tacticapprove:");
    const isContact = interaction.customId.startsWith("tacticcontact:");
    if (!isApprove && !isContact) return;
    if (interaction.channelId !== BOT_LOGS_CHANNEL_ID) return;

    const parts = interaction.customId.split(":");
    if (parts.length < 3) return;
    const [, , userId] = parts;

    const submitter = await interaction.client.users.fetch(userId).catch(() => null);

    if (isContact) {
      if (!submitter) {
        await interaction.reply({ content: "Submitter not reachable.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      await submitter
        .send(`🔔 A moderator (${interaction.user.tag}) wants to contact you about your tactic submission.`)
        .catch(() => {});
      await interaction.reply({
        content: `🔔 Contact request sent${submitter ? ` to ${submitter.tag}` : ""}.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { users: [] },
      });
      return;
    }

    // isApprove
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true),
        ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true),
      );
      await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
    } catch {}

    if (submitter) {
      await submitter
        .send(
          `✅ Your tactic submission was approved by ${interaction.user.tag}.\n` +
            `Thanks for contributing to the community!`,
        )
        .catch(() => {});
    }

    await interaction.message.delete().catch(() => {});

    await interaction.reply({
      content: `✅ Tactic approved${submitter ? ` and notified ${submitter.tag}` : ""}.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { users: [] },
    });
  });
};
