const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { READ_ONLY_ROLE_NAME, READ_ONLY_THRESHOLD, MODERATION_LOG_CHANNEL_ID, MOD_ROLE_NAME } = require("../config/channels");
const { sendModerationLog } = require("../handlers/badwords");
const { sendToTelegram } = require("./telegram");

async function ensureReadOnlyRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === READ_ONLY_ROLE_NAME);
  if (role) return role;

  try {
    role = await guild.roles.create({
      name: READ_ONLY_ROLE_NAME,
      color: 0x808080,
      hoist: false,
      mentionable: false,
      // Grant minimal positive permissions; channel overwrites may be needed server-side
      permissions: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AddReactions,
      ],
    });
    return role;
  } catch (err) {
    console.warn(`⚠️ Failed to create role '${READ_ONLY_ROLE_NAME}':`, err.message);
    return null;
  }
}

async function assignReadOnlyRole(member, totalViolations) {
  try {
    const guild = member.guild;
    const role = await ensureReadOnlyRole(guild);
    if (!role) return false;

    if (member.roles.cache.has(role.id)) {
      return true; // already assigned
    }

    await member.roles.add(role);

    const dmEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🔒 Mode Lecture Seule activé")
      .setDescription(
        `Tu as atteint **${totalViolations}** violations.\n\n` +
        `Tu peux lire les salons et réagir aux messages, mais tu ne peux plus envoyer de messages pour le moment.\n` +
        `Si tu penses que c'est une erreur, contacte le staff.`
      )
      .addFields(
        { name: "Serveur", value: guild.name, inline: true },
        { name: "Seuil", value: `${READ_ONLY_THRESHOLD}`, inline: true }
      )
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    const modEmbed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("🔒 Rôle 'LECTURE SEULE' attribué")
      .addFields(
        { name: "Membre", value: `${member.user.tag} (${member.id})`, inline: true },
        { name: "Violations", value: `${totalViolations}`, inline: true },
        { name: "Rôle", value: READ_ONLY_ROLE_NAME, inline: true }
      )
      .setTimestamp();

    await sendModerationLog(guild, modEmbed, member.user);

    if (typeof sendToTelegram === "function") {
      sendToTelegram(
        `🔒 Lecture seule attribuée\n👤 ${member.user.tag} (${member.id})\n🎚️ Violations: ${totalViolations}`,
        { parse_mode: "Markdown" }
      );
    }

    return true;
  } catch (err) {
    console.error(`Failed to assign '${READ_ONLY_ROLE_NAME}' to ${member.user?.tag}:`, err.message);
    return false;
  }
}

module.exports = {
  ensureReadOnlyRole,
  assignReadOnlyRole,
};
