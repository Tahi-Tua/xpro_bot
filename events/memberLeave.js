const { Events, EmbedBuilder } = require("discord.js");
const { HELLO_CHANNEL_ID, MOD_ROLE_NAME } = require("../config/channels");
const { sendToTelegram } = require("../utils/telegram");

const escapeTelegramMarkdown = (text) => (text || "").replace(/([_*\[\]()`])/g, "\\$1");

module.exports = (client) => {
  client.on(Events.GuildMemberRemove, async (member) => {
    const helloChannel = member.guild.channels.cache.get(HELLO_CHANNEL_ID);
    if (!helloChannel) return;

    const staffRole = member.guild.roles.cache.find(
      (r) => r.name === MOD_ROLE_NAME,
    );

    const joinedAt = member.joinedTimestamp;
    const now = Date.now();
    const diffDays = Math.floor((now - joinedAt) / (1000 * 60 * 60 * 24));

    const roles =
      member.roles.cache
        .filter((r) => r.id !== member.guild.id)
        .map((r) => r.name)
        .join(", ") || "No roles";

    const embed = new EmbedBuilder()
      .setColor(0xff3b3b)
      .setTitle("❌ Member Left the Server")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "👤 User", value: `${member.user.tag}`, inline: true },
        { name: "🕒 Time in server", value: `${diffDays} days`, inline: true },
        { name: "🎭 Previous roles", value: roles },
      )
      .setFooter({ text: "Xavier Pro • Departure Log" })
      .setTimestamp();

    await helloChannel.send({
      content: `${staffRole}`,
      embeds: [embed],
    });

    // Send notification to Telegram
    if (typeof sendToTelegram === 'function') {
      const safeName = escapeTelegramMarkdown(member.user.username);
      const safeRoles = escapeTelegramMarkdown(roles);
      const safeGuild = escapeTelegramMarkdown(member.guild.name);
      const telegramMessage =
        `? *Member left the Discord!*\n\n` +
        `?? *Name:* ${safeName}\n` +
        `?? *ID:* \`${member.user.id}\`\n` +
        `?? *Time on server:* ${diffDays} days\n` +
        `?? *Previous roles:* ${safeRoles}\n` +
        `?? *Server:* ${safeGuild}\n` +
        `?? *Members remaining:* ${member.guild.memberCount}`;

      // Explicitly specify Markdown parse mode to preserve formatting
      sendToTelegram(telegramMessage, { parse_mode: 'Markdown' });
    }
  });
};
