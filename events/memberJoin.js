const { WELCOME_CHANNEL_ID, GUEST_ROLE_ID } = require("../config/channels");
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

    // Remove Guest role if it was auto-assigned by Discord (should only get Guest after acceptance)
    if (GUEST_ROLE_ID) {
      const guestRole = member.guild.roles.cache.get(GUEST_ROLE_ID);
      if (guestRole && member.roles.cache.has(guestRole.id)) {
        try {
          await member.roles.remove(guestRole);
          console.log(`✅ Removed Guest role from ${member.user.tag} (should only get after acceptance)`);
        } catch (err) {
          console.error(`❌ Cannot remove Guest role:`, err.message);
        }
      }
    }

    const payload = getWelcomePayload(member);
    await channel.send(payload).catch(() => {});

    // Send notification to Telegram
    if (typeof sendToTelegram === 'function') {
      const safeName = escapeTelegramMarkdown(member.user.username);
      const safeGuild = escapeTelegramMarkdown(member.guild.name);
      const telegramMessage =
        `? *New Discord member!*\n\n` +
        `?? *Name:* ${safeName}\n` +
        `?? *ID:* \`${member.user.id}\`\n` +
        `?? *Account created:* ${escapeTelegramMarkdown(member.user.createdAt.toLocaleDateString('fr-FR'))}\n` +
        `?? *Server:* ${safeGuild}\n` +
        `?? *Total members:* ${member.guild.memberCount}`;

      sendToTelegram(telegramMessage, { parse_mode: 'Markdown' });
    }
  });
};
