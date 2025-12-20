const { Events, MessageFlags } = require("discord.js");
const { runJoinUsTicketDecision } = require("../utils/joinUsDecision");

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!["accept_app", "deny_app"].includes(interaction.customId)) return;

    try {
      try {
        await interaction.deferUpdate();
      } catch (err) {
        // If the interaction already expired, there's nothing we can do.
        if (err?.code === 10062) return;
        throw err;
      }

      const moderator = interaction.user;
      const guild = interaction.guild;
      const channel = interaction.channel;
      const userId = channel?.topic;

      if (!guild || !channel) {
        await interaction
          .followUp({ content: "? Ticket context missing.", flags: MessageFlags.Ephemeral })
          .catch(() => {});
        return;
      }

      if (!userId) {
        await interaction
          .followUp({ content: "? No user linked to this ticket.", flags: MessageFlags.Ephemeral })
          .catch(() => {});
        return;
      }

      const decision = interaction.customId === "accept_app" ? "accept" : "deny";
      const result = await runJoinUsTicketDecision({
        guild,
        ticketChannel: channel,
        decisionMessage: interaction.message,
        userId,
        decision,
        moderatorLabel: `${moderator}`,
      });

      if (!result.ok) {
        await interaction
          .followUp({
            content: `? ${result.error || "Action failed."}`,
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }

      await interaction
        .followUp({
          content:
            decision === "accept"
              ? `?? Application **ACCEPTED** by ${moderator}.`
              : `?? Application **DECLINED** by ${moderator}.`,
          allowedMentions: { users: [] },
        })
        .catch(() => {});
    } catch (error) {
      console.error("Error in mod decision handler:", error);
      if (error?.code === 10062) return;

      const payload = {
        content: "? An error occurred. Please try again.",
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });
};
