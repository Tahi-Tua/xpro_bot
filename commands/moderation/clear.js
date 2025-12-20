const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        .setDescription("Delete ALL messages in this channel (use with care)."),
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
      await interaction.reply({ content: "🧹 Starting full-channel purge…", flags: MessageFlags.Ephemeral });
      const count = await purgeAllMessages(interaction.channel);
      return interaction.followUp({ content: `✅ Purge complete. Deleted ~**${count}** messages.` });
    }
  }
};
