const { Events, PermissionsBitField } = require("discord.js");
const { GENERAL_CHAT_ID } = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");
const { isImageAttachment, isVideoAttachment } = require("../utils/media");

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    if (message.channel.id !== GENERAL_CHAT_ID) return;
    if (hasBypassRole(message.member)) return;

    const me = message.guild.members.me;
    const canDelete = me
      ?.permissionsIn(message.channel)
      .has(PermissionsBitField.Flags.ManageMessages);

    if (!canDelete) {
      console.log(
        "Cannot enforce text-only rule in general-chat: missing ManageMessages permission.",
      );
      return;
    }

    const hasAttachment = message.attachments.size > 0;
    const hasVideo =
      hasAttachment && message.attachments.some((a) => isVideoAttachment(a));
    const hasImage =
      hasAttachment &&
      message.attachments.some((a) => isImageAttachment(a, { allowGif: false }));
    const hasMediaEmbed =
      message.embeds.length > 0 &&
      message.embeds.some(
        (e) =>
          e.type === "image" ||
          e.type === "video" ||
          e.image ||
          e.thumbnail ||
          e.video,
      );
    const hasSticker = message.stickers?.size > 0;

    if (!hasAttachment && !hasMediaEmbed && !hasSticker) return;

    const deleted = await message
      .delete()
      .then(() => true)
      .catch((err) => {
        console.log("Delete failed in general-chat:", err?.message || err);
        return false;
      });
    if (!deleted) return;

    message.author
      .send(
        "? In **general-chat**, only text discussions are allowed.\n" +
          "Please use the appropriate channels for images, screenshots or videos.",
      )
      .catch(() => {});
  });
};
