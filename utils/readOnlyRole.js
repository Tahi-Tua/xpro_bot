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
      .setTitle("?? Read-only mode enabled")
      .setDescription(
        `You have reached **${totalViolations}** violations.\n\n` +
        `You can read channels and react to messages, but you cannot send messages for now.\n` +
        `If you think this is a mistake, contact the staff.`
      )
      .addFields(
        { name: "Server", value: guild.name, inline: true },
        { name: "Threshold", value: `${READ_ONLY_THRESHOLD}`, inline: true }
      )
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    const modEmbed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("?? \"READ ONLY\" role assigned")
      .addFields(
        { name: "Member", value: `${member.user.tag} (${member.id})`, inline: true },
        { name: "Violations", value: `${totalViolations}`, inline: true },
        { name: "Role", value: READ_ONLY_ROLE_NAME, inline: true }
      )
      .setTimestamp();

    await sendModerationLog(guild, modEmbed, member.user);

    if (typeof sendToTelegram === "function") {
      sendToTelegram(
        `?? Read-only role assigned\n?? ${member.user.tag} (${member.id})\n??? Violations: ${totalViolations}`,
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
