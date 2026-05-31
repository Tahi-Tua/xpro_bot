const { ComponentType, Events, MessageFlags } = require("discord.js");
const { getBlackjackService, BLACKJACK_CONFIG } = require("../services/blackjackService");
const {
  buildGameEmbed,
  buildGameButtons,
} = require("../components/blackjackView");

async function startBlackjackPlay(interaction, bet) {
  const service = getBlackjackService();

  await interaction.deferReply();

  const startResult = service.startGame({
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    user: interaction.user,
    member: interaction.member,
    bet,
  });

  if (!startResult.ok) {
    return interaction.editReply({
      content: `❌ ${startResult.message}`,
      embeds: [],
      components: [],
    });
  }

  const session = startResult.session;
  let message;

  try {
    message = await interaction.editReply({
      embeds: [buildGameEmbed(session)],
      components: [buildGameButtons(session)],
    });
  } catch (err) {
    if (session.status === "active") {
      service.cancelStartFailure(session.id);
    }
    throw err;
  }

  if (session.status === "active") {
    service.attachMessage(session.id, {
      messageId: message.id,
      messageUrl: message.url,
      channelId: message.channelId,
    });
    attachGameCollector(message, service, session.id);
  }

  return session;
}

function attachGameCollector(message, service, sessionId) {
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    idle: BLACKJACK_CONFIG.sessionIdleMs,
    filter: (buttonInteraction) => {
      const parsed = parseBlackjackCustomId(buttonInteraction.customId);
      if (!parsed || parsed.sessionId !== sessionId) return false;

      const session = service.getSession(sessionId);
      if (!session) {
        safeEphemeralReply(buttonInteraction, "Partie terminee / Game already ended.");
        return false;
      }

      if (buttonInteraction.user.id !== session.userId) {
        safeEphemeralReply(
          buttonInteraction,
          "Cette partie ne t'appartient pas / This is not your game.",
        );
        return false;
      }

      return true;
    },
  });

  collector.on("collect", async (buttonInteraction) => {
    const parsed = parseBlackjackCustomId(buttonInteraction.customId);
    if (!parsed) return;

    try {
      await buttonInteraction.deferUpdate();

      const result = await service.withSessionLock(sessionId, () =>
        service.performAction(sessionId, buttonInteraction.user.id, parsed.action),
      );

      if (!result.ok) {
        return buttonInteraction.followUp({
          content: `❌ ${result.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await buttonInteraction.message.edit({
        embeds: [buildGameEmbed(result.session)],
        components: [buildGameButtons(result.session)],
      });

      if (result.completed) {
        collector.stop("completed");
      }
    } catch (err) {
      console.error("[Blackjack] Button handling failed:", err);
      await sendComponentError(buttonInteraction);
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason === "completed") return;

    try {
      const result = await service.withSessionLock(sessionId, () => service.timeoutSession(sessionId));
      if (!result?.session) return;

      await message.edit({
        embeds: [buildGameEmbed(result.session)],
        components: [buildGameButtons(result.session)],
      });
    } catch (err) {
      console.warn("[Blackjack] Failed to resolve timed out game:", err.message);
    }
  });

  return collector;
}

function parseBlackjackCustomId(customId) {
  if (!customId || !customId.startsWith("bj:")) return null;
  const [, action, sessionId] = customId.split(":");
  if (!["hit", "stand", "double", "surrender"].includes(action) || !sessionId) return null;
  return { action, sessionId };
}

async function safeEphemeralReply(interaction, content) {
  try {
    if (interaction.replied || interaction.deferred) return;
    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.warn("[Blackjack] Could not send ephemeral reply:", err.message);
  }
}

async function sendComponentError(interaction) {
  const payload = {
    content: "❌ Erreur Blackjack / Blackjack error.",
    flags: MessageFlags.Ephemeral,
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (err) {
    console.warn("[Blackjack] Could not send component error:", err.message);
  }
}

function registerBlackjackManager(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const parsed = parseBlackjackCustomId(interaction.customId);
    if (!parsed) return;

    const service = getBlackjackService();
    if (service.hasSession(parsed.sessionId)) return;

    await safeEphemeralReply(
      interaction,
      "Partie terminee ou expiree / Game ended or expired.",
    );
  });
}

module.exports = registerBlackjackManager;
module.exports.startBlackjackPlay = startBlackjackPlay;
module.exports.attachGameCollector = attachGameCollector;
module.exports.parseBlackjackCustomId = parseBlackjackCustomId;
