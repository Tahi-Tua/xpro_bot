const { EmbedBuilder } = require("discord.js");
const {
  RULES_CHANNEL_ID,
  HELLO_CHANNEL_ID,
  GENERAL_CHAT_ID,
  SCREENSHOTS_CHANNEL_ID,
  DIVINE_TIPS_CHANNEL_ID,
  JOIN_US_CHANNEL_ID,
} = require("../config/channels");

function getWelcomePayload(member) {
  const joinUs = member.guild.channels.cache.get(JOIN_US_CHANNEL_ID);
  const joinUsMention = joinUs ? `${joinUs}` : `<#${JOIN_US_CHANNEL_ID}>`;

  const embed1 = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🌟 Welcome to Xavier Pro 🌟")
    .setDescription(
      `Hello ${member} 👋\nWe're glad you're here! Here's how to get started:`,
    )
    .addFields(
      {
        name: "🚪 Start here",
        value: [
          `• Read the rules: <#${RULES_CHANNEL_ID}>`,
        ].join("\n"),
      },
      {
        name: "🎮 Explore & share",
        value: [
          `• Chat with everyone: <#${GENERAL_CHAT_ID}>`,
          `• Post your highlights: <#${SCREENSHOTS_CHANNEL_ID}>`,
          `• Discover tips: <#${DIVINE_TIPS_CHANNEL_ID}>`,
        ].join("\n"),
      },
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  const embed2 = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(
      `Want to **apply to join the syndicate**? Post your **Player ID** and **screenshots** (stats/heroes), or a **valid official stats link** in ${joinUsMention}.\n\n`
    );

  return {
    content: `🎉 Welcome ${member}! Make yourself at home.`,
    embeds: [embed1, embed2],
  };
}

module.exports = { getWelcomePayload };
