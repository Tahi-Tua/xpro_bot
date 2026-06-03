const { Events, EmbedBuilder, PermissionsBitField } = require("discord.js");
const { HELLO_CHANNEL_ID, MOD_ROLE_NAME } = require("../config/channels");
const { sendToTelegram } = require("../utils/telegram");

const escapeTelegramMarkdown = (text) =>
  String(text || "").replace(/([_*\[\]()`])/g, "\\$1");

module.exports = (client) => {
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const helloChannel = member.guild.channels.cache.get(HELLO_CHANNEL_ID);

      if (!helloChannel) {
        console.warn(
          `[memberLeave] HELLO_CHANNEL_ID introuvable ou non chargé: ${HELLO_CHANNEL_ID}`,
        );
        return;
      }

      const me = member.guild.members.me;
      const canSend = me
        ?.permissionsIn(helloChannel)
        .has(PermissionsBitField.Flags.SendMessages);
      const canEmbed = me
        ?.permissionsIn(helloChannel)
        .has(PermissionsBitField.Flags.EmbedLinks);

      if (!canSend) {
        console.warn(
          `[memberLeave] Permission SendMessages manquante dans le salon ${helloChannel.id}`,
        );
        return;
      }

      if (!canEmbed) {
        console.warn(
          `[memberLeave] Permission EmbedLinks manquante dans le salon ${helloChannel.id}`,
        );
        return;
      }

      const staffRole = member.guild.roles.cache.find(
        (r) => r.name === MOD_ROLE_NAME,
      );

      if (!staffRole) {
        console.warn(`[memberLeave] Rôle staff introuvable: ${MOD_ROLE_NAME}`);
      }

      const diffDays = member.joinedTimestamp
        ? Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24))
        : null;

      const timeInServer = diffDays === null ? "Unknown" : `${diffDays} days`;

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
          { name: "🆔 ID", value: `${member.user.id}`, inline: true },
          { name: "🕒 Time in server", value: timeInServer, inline: true },
          { name: "🎭 Previous roles", value: roles.slice(0, 1024) },
        )
        .setFooter({ text: "Xavier Pro • Departure Log" })
        .setTimestamp();

      await helloChannel.send({
        content: staffRole ? `${staffRole}` : undefined,
        embeds: [embed],
      });

      if (typeof sendToTelegram === "function") {
        const safeName = escapeTelegramMarkdown(member.user.username);
        const safeRoles = escapeTelegramMarkdown(roles);
        const safeGuild = escapeTelegramMarkdown(member.guild.name);
        const telegramMessage =
          `❌ *Member left the Discord!*\n\n` +
          `👤 *Name:* ${safeName}\n` +
          `🆔 *ID:* \`${member.user.id}\`\n` +
          `🕒 *Time on server:* ${timeInServer}\n` +
          `🎭 *Previous roles:* ${safeRoles}\n` +
          `🏰 *Server:* ${safeGuild}\n` +
          `👥 *Members remaining:* ${member.guild.memberCount}`;

        sendToTelegram(telegramMessage, { parse_mode: "Markdown" });
      }
    } catch (err) {
      console.error("[memberLeave] Erreur notification départ:", err);
    }
  });
};
