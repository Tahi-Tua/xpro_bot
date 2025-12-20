const { Events } = require("discord.js");
const { GENERAL_CHAT_ID } = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    if (message.channel.id !== GENERAL_CHAT_ID) return;
    if (hasBypassRole(message.member)) return;

    const hasAttachment = message.attachments.size > 0;
    const hasMediaEmbed =
      message.embeds.length > 0 &&
      message.embeds.some((e) => e.type === "image" || e.video || e.thumbnail);

    if (!hasAttachment && !hasMediaEmbed) return;

    await message.delete().catch(() => {});

    message.author
      .send(
        "⚠ In **general-chat**, only text discussions are allowed.\n" +
          "Please use the appropriate channels for images, screenshots or videos.",
      )
      .catch(() => {});
  });
};
