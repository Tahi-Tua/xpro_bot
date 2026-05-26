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

    // =========================================================
    // Attachments
    // =========================================================

    const hasVideo =
      message.attachments.size > 0 &&
      message.attachments.some((a) => isVideoAttachment(a));

    // allowGif: false
    // => Les GIFs ne sont PAS considérés comme images
    const hasImage =
      message.attachments.size > 0 &&
      message.attachments.some((a) =>
        isImageAttachment(a, { allowGif: false }),
      );

    // =========================================================
    // Embeds
    // =========================================================

    const hasMediaEmbed =
      message.embeds.length > 0 &&
      message.embeds.some((e) => {
        const type = (e.type || "").toLowerCase();

        const urls = [
          e.url,
          e.image?.url,
          e.thumbnail?.url,
          e.video?.url,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        // =====================================================
        // Autoriser les GIFs :
        // - Tenor
        // - Giphy
        // - Discord GIF embeds
        // - Mobile Discord embeds
        // =====================================================

        const isGifEmbed =
          type === "gifv" ||
          urls.includes("tenor.com") ||
          urls.includes("giphy.com") ||
          urls.includes(".gif");

        if (isGifEmbed) {
          return false;
        }

        // =====================================================
        // Bloquer les autres médias
        // =====================================================

        return (
          type === "image" ||
          type === "video" ||
          Boolean(e.image) ||
          Boolean(e.thumbnail) ||
          Boolean(e.video)
        );
      });

    // =========================================================
    // Aucun média interdit
    // =========================================================

    if (!hasVideo && !hasImage && !hasMediaEmbed) {
      return;
    }

    // =========================================================
    // Delete message
    // =========================================================

    const deleted = await message
      .delete()
      .then(() => true)
      .catch((err) => {
        console.log(
          "Delete failed in general-chat:",
          err?.message || err,
        );
        return false;
      });

    if (!deleted) return;

    // =========================================================
    // DM warning
    // =========================================================

    message.author
      .send(
        "⚠️ In **general-chat**, images and videos are not allowed.\n" +
          "**GIFs are permitted!** Use Tenor or Giphy to share GIFs.\n" +
          "For other media, please use the appropriate channels.",
      )
      .catch(() => {});
  });
};