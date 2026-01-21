const {
  Events,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { runJoinUsTicketDecision } = require("../utils/joinUsDecision");

/**
 * Validate that a string is a valid Discord snowflake ID (17-19 digits).
 * Discord IDs are 64-bit integers represented as strings.
 * @param {string} id - The ID to validate
 * @returns {boolean} True if valid Discord snowflake format
 */
function isValidDiscordId(id) {
  return typeof id === 'string' && /^\d{17,19}$/.test(id);
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    // Handle ACCEPT/DECLINE buttons
    if (interaction.isButton() && ["accept_app", "deny_app"].includes(interaction.customId)) {
      try {
        const moderator = interaction.user;
        const guild = interaction.guild;
        const channel = interaction.channel;
        const userId = channel?.topic;

        if (!guild || !channel) {
          await interaction
            .reply({ content: "❌ Ticket context missing.", flags: MessageFlags.Ephemeral })
            .catch(() => {});
          return;
        }

        // Validate Discord snowflake format to prevent malformed IDs
        if (!userId || !isValidDiscordId(userId)) {
          await interaction
            .reply({ 
              content: "❌ Invalid ticket: user ID missing or malformed. Please create a new ticket.", 
              flags: MessageFlags.Ephemeral 
            })
            .catch(() => {});
          return;
        }

        if (interaction.customId === "deny_app") {
          // Present quick-pick reasons + custom input option (ephemeral)
          const messageId = interaction.message?.id;

          const select = new StringSelectMenuBuilder()
            .setCustomId(`deny_reasons_select:${messageId}`)
            .setPlaceholder("Select a reason for rejection")
            .addOptions([
              { label: "Insufficient stats", value: "Insufficient stats" },
              { label: "Incomplete screenshots", value: "Incomplete screenshots" },
              { label: "Invalid/No stats link", value: "Invalid or missing stats link" },
              { label: "Not meeting requirements", value: "Not meeting requirements" },
              { label: "Behavior concerns", value: "Behavior concerns" },
              { label: "Syndicate is full", value: "Syndicate is currently full" },
              { label: "Wrong server/region", value: "Wrong server or region" },
            ]);

          const selectRow = new ActionRowBuilder().addComponents(select);
          const customBtnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`deny_custom_reason:${messageId}`)
              .setLabel("Type custom reason")
              .setStyle(ButtonStyle.Secondary),
          );

          await interaction
            .reply({
              content: "Choose a predefined reason or type a custom one:",
              components: [selectRow, customBtnRow],
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        // ACCEPT flow
        await interaction.deferUpdate();

        const result = await runJoinUsTicketDecision({
          guild,
          ticketChannel: channel,
          decisionMessage: interaction.message,
          userId,
          decision: "accept",
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
            content: `Application **ACCEPTED** by ${moderator}.`,
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
    }

    // Handle reason selection from dropdown
    if (interaction.isStringSelectMenu()) {
      const cid = interaction.customId || "";
      if (!cid.startsWith("deny_reasons_select:")) return;

      try {
        const [, messageId] = cid.split(":");
        const selected = interaction.values?.[0] || null;
        const moderator = interaction.user;
        const guild = interaction.guild;
        const channel = interaction.channel;
        const userId = channel?.topic;

        // Validate all required context including Discord ID format
        if (!guild || !channel || !selected) {
          await interaction
            .reply({ content: "❌ Missing context or reason.", ephemeral: true })
            .catch(() => {});
          return;
        }

        if (!userId || !isValidDiscordId(userId)) {
          await interaction
            .reply({ 
              content: "❌ Invalid ticket: user ID missing or malformed.", 
              ephemeral: true 
            })
            .catch(() => {});
          return;
        }

        let decisionMessage = null;
        if (messageId) {
          decisionMessage = await channel.messages.fetch(messageId).catch(() => null);
        }

        const result = await runJoinUsTicketDecision({
          guild,
          ticketChannel: channel,
          decisionMessage,
          userId,
          decision: "deny",
          moderatorLabel: `${moderator}`,
          reason: selected,
        });

        if (!result.ok) {
          await interaction
            .reply({ content: `? ${result.error || "Action failed."}`, ephemeral: true })
            .catch(() => {});
          return;
        }

        await interaction
          .reply({
            content: `Application **DECLINED** by ${moderator}.`,
            ephemeral: true,
            allowedMentions: { users: [] },
          })
          .catch(() => {});
      } catch (error) {
        console.error("Error handling decline select:", error);
        await interaction
          .reply({ content: "? An error occurred.", ephemeral: true })
          .catch(() => {});
      }
    }

    // Handle the button to trigger custom reason modal
    if (interaction.isButton()) {
      const cid = interaction.customId || "";
      if (!cid.startsWith("deny_custom_reason:")) return;

      try {
        const [, messageId] = cid.split(":");
        const modal = new ModalBuilder()
          .setCustomId(`deny_reason_modal:${messageId}`)
          .setTitle("Decline Application");

        const reasonInput = new TextInputBuilder()
          .setCustomId("deny_reason")
          .setLabel("Reason for rejection")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500);

        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);
        await interaction.showModal(modal).catch(() => {});
      } catch (error) {
        console.error("Error opening custom reason modal:", error);
        await interaction
          .reply({ content: "? Unable to open modal.", ephemeral: true })
          .catch(() => {});
      }
    }

    // Handle the rejection reason modal submit
    if (interaction.isModalSubmit()) {
      const cid = interaction.customId || "";
      if (!cid.startsWith("deny_reason_modal:")) return;

      try {
        const [, messageId] = cid.split(":");
        const reason = interaction.fields.getTextInputValue("deny_reason")?.trim() || null;

        const moderator = interaction.user;
        const guild = interaction.guild;
        const channel = interaction.channel;
        const userId = channel?.topic;

        if (!guild || !channel) {
          await interaction
            .reply({ content: "❌ Missing ticket context.", flags: MessageFlags.Ephemeral })
            .catch(() => {});
          return;
        }

        // Validate Discord ID format
        if (!userId || !isValidDiscordId(userId)) {
          await interaction
            .reply({ 
              content: "❌ Invalid ticket: user ID missing or malformed.", 
              flags: MessageFlags.Ephemeral 
            })
            .catch(() => {});
          return;
        }

        let decisionMessage = null;
        if (messageId) {
          decisionMessage = await channel.messages.fetch(messageId).catch(() => null);
        }

        const result = await runJoinUsTicketDecision({
          guild,
          ticketChannel: channel,
          decisionMessage,
          userId,
          decision: "deny",
          moderatorLabel: `${moderator}`,
          reason,
        });

        if (!result.ok) {
          await interaction
            .reply({ content: `? ${result.error || "Action failed."}`, ephemeral: true })
            .catch(() => {});
          return;
        }

        await interaction
          .reply({
            content: `Application **DECLINED** by ${moderator}.`,
            ephemeral: true,
            allowedMentions: { users: [] },
          })
          .catch(() => {});
      } catch (error) {
        console.error("Error handling decline modal:", error);
        await interaction
          .reply({ content: "? An error occurred.", ephemeral: true })
          .catch(() => {});
      }
    }
  });
};
