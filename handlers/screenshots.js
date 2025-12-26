const { Events, PermissionsBitField } = require("discord.js");
const { SCREENSHOTS_CHANNEL_ID, CLAN_MEDIA_CHANNEL_ID } = require("../config/channels");

const MEDIA_ONLY_CHANNELS = [SCREENSHOTS_CHANNEL_ID, CLAN_MEDIA_CHANNEL_ID];

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    if (!MEDIA_ONLY_CHANNELS.includes(message.channel.id)) return;

    const me = message.guild.members.me;
    const canDelete = me
      ?.permissionsIn(message.channel)
      .has(PermissionsBitField.Flags.ManageMessages);

    if (!canDelete) {
      console.log(
        "Cannot enforce media-only rule: missing ManageMessages permission.",
      );
      return;
    }

    const hasAttachment =
      message.attachments.size > 0 &&
      message.attachments.some((att) => {
        const type = (att.contentType || "").toLowerCase();
        if (type.startsWith("image/") || type.startsWith("video/")) return true;

        const name = (att.name || "").toLowerCase();
        const url = (att.url || "").toLowerCase();
        return /\.(png|jpe?g|gif|webp|bmp|tiff|mp4|mov|webm|mkv)$/.test(
          name || url,
        );
      });
    const hasMediaEmbed =
      message.embeds.length > 0 &&
      message.embeds.some(
        (e) =>
          e.image || e.video || e.type === "image" || e.type === "video",
      );
    const hasSticker = message.stickers?.size > 0;

    if (hasAttachment || hasMediaEmbed || hasSticker) return;

    await message
      .delete()
      .catch((err) => console.log("Delete failed in media channel:", err));

    message.author
      .send(
        "⚠ In this channel, you must include at least one screenshot, image or video.\n" +
          "Please repost your message with the appropriate media attached.",
      )
      .catch(() => {});
  });
};
