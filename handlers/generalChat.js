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

    const hasVideo =
      message.attachments.size > 0 &&
      message.attachments.some((a) => isVideoAttachment(a));
    const hasImage =
      message.attachments.size > 0 &&
      message.attachments.some((a) => isImageAttachment(a, { allowGif: true }));
    const hasMediaEmbed =
      message.embeds.length > 0 &&
      message.embeds.some((e) => {
        const type = (e.type || "").toLowerCase();
        return (
          type === "image" ||
          type === "video" ||
          type === "gifv" ||
          e.image ||
          e.thumbnail ||
          e.video
        );
      });

    if (!hasVideo && !hasImage && !hasMediaEmbed) return;

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
        "? In **general-chat**, images, GIFs, and videos are not allowed.\n" +
          "Please use the appropriate channels for media.",
      )
      .catch(() => {});
  });
};
