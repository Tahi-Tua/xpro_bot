const { Events } = require("discord.js");
const { GENERAL_CHAT_ID } = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    if (message.channel.id !== GENERAL_CHAT_ID) return;
    if (hasBypassRole(message.member)) return;

    const hasVideo = message.attachments.some((a) => {
      const contentType = a.contentType || "";
      return contentType.startsWith("video/");
    });
    const hasImage = message.attachments.some((a) => {
      const contentType = a.contentType || "";
      return contentType.startsWith("image/") && !contentType.includes("gif");
    });
    const hasMediaEmbed =
      message.embeds.length > 0 &&
      message.embeds.some((e) => e.type === "image" || e.type === "video");

    if (!hasVideo && !hasImage && !hasMediaEmbed) return;

    await message.delete().catch(() => {});

    message.author
      .send(
        "⚠ In **general-chat**, only text discussions are allowed.\n" +
          "Please use the appropriate channels for images, screenshots or videos.",
      )
      .catch(() => {});
  });
};
