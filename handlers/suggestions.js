const { Events } = require("discord.js");
const { SUGGESTION_CHANNEL_ID } = require("../config/channels");

const SUGGESTION_ACK_MESSAGE =
  "Thanks for your suggestion! Our administrators will review it as soon as possible.";

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author?.bot || !message.inGuild()) return;
    if (message.channelId !== SUGGESTION_CHANNEL_ID) return;

    // Best-effort DM first (avoids cluttering the suggestions channel).
    const dmSent = await message.author
      .send(SUGGESTION_ACK_MESSAGE)
      .then(() => true)
      .catch(() => false);

    // If DMs are closed, fall back to a reply (keeps the "notification" behavior).
    if (dmSent) return;

    const reply = await message
      .reply({ content: SUGGESTION_ACK_MESSAGE, allowedMentions: { repliedUser: true } })
      .catch(() => null);

    if (!reply) return;

    // Keep channel clean: auto-delete the acknowledgement after a short delay.
    setTimeout(() => reply.delete().catch(() => {}), 30_000);
  });
};
