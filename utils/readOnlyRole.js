const { ChannelType, EmbedBuilder, PermissionsBitField } = require("discord.js");
const { READ_ONLY_ROLE_NAME, READ_ONLY_THRESHOLD, MODERATION_LOG_CHANNEL_ID, MOD_ROLE_NAME } = require("../config/channels");
const { sendToTelegram } = require("./telegram");

const CONFIGURED_GUILDS = new Set();
const TEXT_BASED_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
].filter((type) => type !== undefined));

const READ_ONLY_DENY = [
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.CreatePrivateThreads,
  PermissionsBitField.Flags.SendMessagesInThreads,
];

const UNSAFE_BASE_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  ...READ_ONLY_DENY,
];

async function ensureReadOnlyRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === READ_ONLY_ROLE_NAME);
  if (role) {
    await sanitizeReadOnlyRoleBasePermissions(role);
    return role;
  }

  try {
    role = await guild.roles.create({
      name: READ_ONLY_ROLE_NAME,
      color: 0x808080,
      hoist: false,
      mentionable: false,
      permissions: [],
      reason: "Read-only role managed by moderation automation",
    });
    return role;
  } catch (err) {
    console.warn(`⚠️ Failed to create role '${READ_ONLY_ROLE_NAME}':`, err.message);
    return null;
  }
}

async function sanitizeReadOnlyRoleBasePermissions(role) {
  try {
    if (!role.permissions.any(UNSAFE_BASE_PERMISSIONS)) return true;

    const sanitized = new PermissionsBitField(role.permissions.bitfield);
    sanitized.remove(UNSAFE_BASE_PERMISSIONS);
    await role.setPermissions(
      sanitized,
      "Remove base permissions that could bypass read-only channel overwrites",
    );
    return true;
  } catch (err) {
    console.warn(`⚠️ Failed to sanitize '${READ_ONLY_ROLE_NAME}' permissions:`, err.message);
    return false;
  }
}

async function ensureReadOnlyChannelOverwrites(guild, role) {
  const cacheKey = `${guild.id}:${role.id}`;
  if (CONFIGURED_GUILDS.has(cacheKey)) {
    return { ok: true, configured: 0, failed: 0, cached: true };
  }

  let configured = 0;
  let failed = 0;

  for (const [, channel] of guild.channels.cache) {
    if (!TEXT_BASED_CHANNEL_TYPES.has(channel.type)) continue;
    if (!channel.permissionOverwrites?.edit) continue;

    try {
      await channel.permissionOverwrites.edit(
        role,
        {
          [PermissionsBitField.Flags.ReadMessageHistory]: true,
          [PermissionsBitField.Flags.AddReactions]: true,
          [PermissionsBitField.Flags.SendMessages]: false,
          [PermissionsBitField.Flags.AttachFiles]: false,
          [PermissionsBitField.Flags.EmbedLinks]: false,
          [PermissionsBitField.Flags.CreatePublicThreads]: false,
          [PermissionsBitField.Flags.CreatePrivateThreads]: false,
          [PermissionsBitField.Flags.SendMessagesInThreads]: false,
        },
        "Ensure read-only role cannot post messages",
      );
      configured += 1;
    } catch (err) {
      failed += 1;
      console.warn(`⚠️ Failed to configure read-only overwrite for #${channel.name}:`, err.message);
    }
  }

  const ok = configured > 0 && failed === 0;
  if (configured > 0) CONFIGURED_GUILDS.add(cacheKey);
  return { ok, configured, failed, cached: false };
}

async function assignReadOnlyRole(member, totalViolations) {
  try {
    const guild = member.guild;
    const role = await ensureReadOnlyRole(guild);
    if (!role) return false;

    const overwriteResult = await ensureReadOnlyChannelOverwrites(guild, role);
    if (overwriteResult.configured === 0 && !overwriteResult.cached) {
      console.warn(
        `⚠️ '${READ_ONLY_ROLE_NAME}' was not assigned because no channel overwrite could be configured.`,
      );
      return false;
    }

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

    const { sendModerationLog } = require("../handlers/badwords");
    if (typeof sendModerationLog === "function") {
      await sendModerationLog(guild, modEmbed, member.user);
    }

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
  ensureReadOnlyChannelOverwrites,
  assignReadOnlyRole,
};
