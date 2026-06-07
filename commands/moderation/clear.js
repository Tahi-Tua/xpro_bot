const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const {
  CLEAR_ALL_ALLOWED_ROLE_IDS,
  CLEAR_ALL_ENABLED,
  MODERATION_LOG_CHANNEL_ID,
} = require("../../config/channels");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPurgeAuditLog(interaction, status, extra = "") {
  const logChannel = interaction.guild.channels.cache.get(MODERATION_LOG_CHANNEL_ID) ||
    await interaction.guild.channels.fetch(MODERATION_LOG_CHANNEL_ID).catch(() => null);

  if (!logChannel?.isTextBased?.()) return;

  await logChannel.send({
    content:
      `🧹 **Clear all audit**\n` +
      `Status: **${status}**\n` +
      `Executor: ${interaction.user.tag} (${interaction.user.id})\n` +
      `Channel: ${interaction.channel} (${interaction.channelId})\n` +
      `${extra}`,
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

async function purgeAllMessages(channel) {
  let totalDeleted = 0;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!batch || batch.size === 0) break;

    // Try bulk delete first (works only for < 14 days)
    let deletedCollection = null;
    try {
      deletedCollection = await channel.bulkDelete(batch, true);
      totalDeleted += deletedCollection.size;
    } catch {
      // ignore; fall back to per-message
    }

    // Delete anything left (older than 14 days or failed in bulk)
    const remaining = batch.filter((m) => !deletedCollection?.has(m.id));
    for (const [, msg] of remaining) {
      await msg.delete().catch(() => {});
      totalDeleted += 1;
      await sleep(50); // be gentle with rate limits
    }

    // Small pause between pages to avoid hammering the API
    await sleep(250);
  }
  return totalDeleted;
}

function hasAllowedFullPurgeRole(interaction) {
  if (interaction.guild.ownerId === interaction.user.id) return true;
  const roles = interaction.member?.roles?.cache;
  return CLEAR_ALL_ALLOWED_ROLE_IDS.some((roleId) => roles?.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Delete messages in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName("amount")
        .setDescription("Delete a specific number of recent messages (1-100).")
        .addIntegerOption((option) =>
          option
            .setName("number")
            .setDescription("Number of messages to delete.")
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("all")
        .setDescription("Delete ALL messages in this channel (disabled unless explicitly enabled).")
        .addStringOption((option) =>
          option
            .setName("confirm")
            .setDescription('Type "DELETE ALL" to confirm the full purge.')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "amount") {
      const amount = interaction.options.getInteger("number");
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({
          content: `🧹 **${deleted.size} message(s) deleted successfully!**`,
        });
      } catch (err) {
        console.error("❌ Failed to bulk delete messages:", err.message);
        return interaction.reply({
          content:
            "❌ Unable to delete some or all messages. Messages older than 14 days cannot be bulk deleted.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (sub === "all") {
      if (!CLEAR_ALL_ENABLED) {
        await sendPurgeAuditLog(interaction, "blocked", "Reason: `CLEAR_ALL_ENABLED` is not true.\n");
        return interaction.reply({
          content: "❌ Full-channel purge is disabled. Set `CLEAR_ALL_ENABLED=true` only when you really need it.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const hasFullPurgePermission =
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);

      if (!hasFullPurgePermission || !hasAllowedFullPurgeRole(interaction)) {
        await sendPurgeAuditLog(interaction, "blocked", "Reason: missing full-purge permission or allowed role.\n");
        return interaction.reply({
          content: "❌ Full-channel purge requires Administrator/Manage Channels and an allowed leader role.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const confirmation = interaction.options.getString("confirm");
      const expectedConfirmation = `DELETE ALL ${interaction.channelId}`;
      if (confirmation !== expectedConfirmation) {
        return interaction.reply({
          content: `❌ Full-channel purge cancelled. Type exactly \`${expectedConfirmation}\` in the confirm option.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await sendPurgeAuditLog(interaction, "started");
      await interaction.reply({ content: "🧹 Starting full-channel purge…", flags: MessageFlags.Ephemeral });
      console.warn(
        `[clear all] ${interaction.user.tag} (${interaction.user.id}) started full purge in #${interaction.channel?.name} (${interaction.channelId})`,
      );
      const count = await purgeAllMessages(interaction.channel);
      await sendPurgeAuditLog(interaction, "completed", `Deleted approx: **${count}** message(s).\n`);
      return interaction.followUp({ content: `✅ Purge complete. Deleted ~**${count}** messages.` });
    }
  }
};
