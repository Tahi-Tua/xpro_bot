const { WELCOME_CHANNEL_ID } = require("../config/channels");
const { getWelcomePayload } = require("../handlers/welcome");
const { sendToTelegram } = require("../utils/telegram");

const escapeTelegramMarkdown = (text) => (text || "").replace(/([_*\[\]()`])/g, "\\$1");

const UNVERIFIED_ROLE_NAME = "Unverified";

module.exports = (client) => {
  client.on("guildMemberAdd", async (member) => {
    if (member.user.bot) return;
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;

    // Add Unverified role to new members
    const unverifiedRole = member.guild.roles.cache.find(
      (r) => r.name === UNVERIFIED_ROLE_NAME
    );
    if (unverifiedRole) {
      try {
        await member.roles.add(unverifiedRole);
        console.log(`✅ Added ${UNVERIFIED_ROLE_NAME} role to ${member.user.tag}`);
      } catch (err) {
        console.error(`❌ Cannot add ${UNVERIFIED_ROLE_NAME} role:`, err.message);
      }
    } else {
      console.warn(
        `⚠️ ${UNVERIFIED_ROLE_NAME} role not found. Create it in Discord server settings.`
      );
    }

    const payload = getWelcomePayload(member);
    await channel.send(payload).catch(() => {});

    // Send notification to Telegram
    if (typeof sendToTelegram === 'function') {
      const safeName = escapeTelegramMarkdown(member.user.username);
      const safeGuild = escapeTelegramMarkdown(member.guild.name);
      const telegramMessage =
        `✅ *Nouveau membre Discord!*\n\n` +
        `👤 *Nom:* ${safeName}\n` +
        `🆔 *ID:* \`${member.user.id}\`\n` +
        `📅 *Compte créé:* ${escapeTelegramMarkdown(member.user.createdAt.toLocaleDateString('fr-FR'))}\n` +
        `🏰 *Serveur:* ${safeGuild}\n` +
        `👥 *Total membres:* ${member.guild.memberCount}`;

      sendToTelegram(telegramMessage, { parse_mode: 'Markdown' });
    }
  });
};
