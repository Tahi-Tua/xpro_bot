const { Events } = require("discord.js");
const { GENERAL_CHAT_ID } = require("../config/channels");
const { hasBypassRole } = require("../utils/bypass");

// List of video file extensions to check
const VIDEO_EXTENSIONS = [
  ".mp4", ".mov", ".avi", ".mkv", ".flv", ".wmv", 
  ".webm", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"
];

// Video platform domains to check in embeds
const VIDEO_PLATFORMS = [
  "youtube.com", "youtu.be", "tiktok.com", 
  "vimeo.com", "twitch.tv", "streamable.com"
];

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    if (message.channel.id !== GENERAL_CHAT_ID) return;
    if (hasBypassRole(message.member)) return;

    // Check for videos by contentType OR file extension
    const hasVideo = message.attachments.some((a) => {
      const contentType = a.contentType || "";
      const url = (a.url || "").toLowerCase();
      
      // Check contentType
      if (contentType.startsWith("video/")) return true;
      
      // Check file extension as fallback
      return VIDEO_EXTENSIONS.some(ext => url.endsWith(ext));
    });
    
    const hasImage = message.attachments.some((a) => {
      const contentType = a.contentType || "";
      return contentType.startsWith("image/") && !contentType.includes("gif");
    });
    
    // Enhanced embed detection for videos
    const hasMediaEmbed =
      message.embeds.length > 0 &&
      message.embeds.some((e) => {
        // Check for image type embeds
        if (e.type === "image" || e.type === "video") return true;
        
        // Check if embed has a video property
        if (e.video) return true;
        
        // Check for video platform URLs
        const embedUrl = (e.url || "").toLowerCase();
        return VIDEO_PLATFORMS.some(platform => embedUrl.includes(platform));
      });

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
