const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const {
  MODERATION_LOG_CHANNEL_ID,
  STAFF_LOG_CHANNEL_ID,
  BOT_LOGS_CHANNEL_ID,
  SYNDICATE_MEMBER_ROLE_ID,
  SYNDICATE_MEMBER_ROLE_NAME,
  SYNDICATE_CLEANUP_PROTECTED_ROLE_IDS,
} = require("../config/channels");

const STATE_FILE = path.join(__dirname, "..", "data", "syndicateRoleCleanup.json");
const ROLE_VALUE_MAX_LENGTH = 1024;
const CLEANUP_RETRY_DELAY_MS = Number(process.env.SYNDICATE_CLEANUP_RETRY_DELAY_MS || 8000);

let saveQueue = Promise.resolve();

function emptyState() {
  return { members: {} };
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8") || "{}");
    return parsed && typeof parsed === "object" && parsed.members
      ? parsed
      : emptyState();
  } catch (err) {
    console.warn("[syndicateCleanup] State load failed:", err?.message || err);
    return emptyState();
  }
}

function saveState(state) {
  saveQueue = saveQueue.then(async () => {
    await fsPromises.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fsPromises.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  }).catch((err) => {
    console.error("[syndicateCleanup] State save failed:", err?.message || err);
  });

  return saveQueue;
}

function resolveSyndicateRole(guild) {
  if (!guild?.roles?.cache) return null;
  if (SYNDICATE_MEMBER_ROLE_ID) {
    const byId = guild.roles.cache.get(SYNDICATE_MEMBER_ROLE_ID);
    if (byId) return byId;
  }

  return guild.roles.cache.find((role) => role.name === SYNDICATE_MEMBER_ROLE_NAME) || null;
}

function memberHasSyndicateRole(member) {
  const role = resolveSyndicateRole(member.guild);
  if (!role) return false;
  return member.roles.cache.has(role.id);
}

function getStoredRoleSnapshot(member) {
  return member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .map((role) => ({
      id: role.id,
      name: role.name,
      position: role.position,
      managed: role.managed,
    }))
    .sort((a, b) => b.position - a.position);
}

function chunkRoleNames(roles) {
  const value = roles.map((role) => `• ${role.name} (${role.id})`).join("\n");
  if (!value) return "None";
  return value.length > ROLE_VALUE_MAX_LENGTH
    ? `${value.slice(0, ROLE_VALUE_MAX_LENGTH - 20)}\n...truncated`
    : value;
}

async function getLogChannel(guild) {
  const ids = [MODERATION_LOG_CHANNEL_ID, STAFF_LOG_CHANNEL_ID, BOT_LOGS_CHANNEL_ID].filter(Boolean);

  for (const id of ids) {
    const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    if (channel?.isTextBased?.()) return channel;
  }

  return null;
}

async function sendCleanupLog(guild, embed) {
  const channel = await getLogChannel(guild);
  if (!channel) {
    console.warn("[syndicateCleanup] No log channel available.");
    return;
  }

  await channel.send({ embeds: [embed] }).catch((err) => {
    console.warn("[syndicateCleanup] Log send failed:", err?.message || err);
  });
}

async function markSyndicateMemberDeparture(member) {
  const syndicateRole = resolveSyndicateRole(member.guild);
  if (!syndicateRole) {
    console.warn(`[syndicateCleanup] Syndicate role not found: ${SYNDICATE_MEMBER_ROLE_NAME}`);
    return { tracked: false, reason: "role_not_found" };
  }

  if (!member.roles.cache.has(syndicateRole.id)) {
    return { tracked: false, reason: "not_syndicate_member" };
  }

  const roles = getStoredRoleSnapshot(member);
  const state = loadState();
  state.members[member.id] = {
    userId: member.id,
    tag: member.user?.tag || member.user?.username || member.id,
    guildId: member.guild.id,
    guildName: member.guild.name,
    leftAt: new Date().toISOString(),
    triggerRoleId: syndicateRole.id,
    triggerRoleName: syndicateRole.name,
    roles,
  };

  await saveState(state);

  const embed = new EmbedBuilder()
    .setColor(0xff3b3b)
    .setTitle("🧹 Syndicate member cleanup armed")
    .setDescription("A syndicate member left the server. Their role snapshot has been saved and will be cleaned if they return.")
    .addFields(
      { name: "Member", value: `${state.members[member.id].tag} (${member.id})`, inline: false },
      { name: "Trigger role", value: `${syndicateRole.name} (${syndicateRole.id})`, inline: false },
      { name: "Saved roles", value: chunkRoleNames(roles), inline: false },
    )
    .setTimestamp();

  await sendCleanupLog(member.guild, embed);
  return { tracked: true, rolesCount: roles.length };
}

function isProtectedRole(role, guild, botMember) {
  if (!role) return true;
  if (role.id === guild.id) return true;
  if (role.managed) return true;
  if (SYNDICATE_CLEANUP_PROTECTED_ROLE_IDS.includes(role.id)) return true;
  if (botMember && role.position >= botMember.roles.highest.position) return true;
  return false;
}

async function cleanupReturningSyndicateMember(member, options = {}) {
  const { preserveRecord = false, pass = "immediate" } = options;
  const state = loadState();
  const record = state.members[member.id];
  if (!record) return { cleaned: false, reason: "not_tracked" };

  const freshMember = await member.guild.members.fetch(member.id).catch(() => member);
  const botMember = freshMember.guild.members.me || await freshMember.guild.members.fetchMe().catch(() => null);
  const permissions = botMember?.permissions;
  const canManageRoles = permissions?.has(PermissionsBitField.Flags.ManageRoles);

  const removed = [];
  const skipped = [];
  const failed = [];

  if (!canManageRoles) {
    skipped.push({ name: "all_roles", id: "n/a", reason: "missing_manage_roles" });
  } else {
    for (const savedRole of record.roles || []) {
      const role = freshMember.guild.roles.cache.get(savedRole.id) || await freshMember.guild.roles.fetch(savedRole.id).catch(() => null);
      if (!role) {
        skipped.push({ ...savedRole, reason: "role_deleted_or_missing" });
        continue;
      }

      if (!freshMember.roles.cache.has(role.id)) {
        skipped.push({ ...savedRole, reason: "not_present_on_member" });
        continue;
      }

      if (isProtectedRole(role, freshMember.guild, botMember)) {
        skipped.push({ ...savedRole, reason: "protected_or_unmanageable" });
        continue;
      }

      try {
        await freshMember.roles.remove(role, `Syndicate cleanup ${pass}`);
        removed.push({ id: role.id, name: role.name });
      } catch (err) {
        failed.push({ id: role.id, name: role.name, reason: err?.message || String(err) });
      }
    }
  }

  if (!preserveRecord) {
    delete state.members[freshMember.id];
    await saveState(state);
  }

  const embed = new EmbedBuilder()
    .setColor(failed.length ? 0xffa500 : 0x35c759)
    .setTitle("🧹 Syndicate member cleanup executed")
    .setDescription(`Saved roles were processed for cleanup. Pass: ${pass}`)
    .addFields(
      { name: "Member", value: `${freshMember.user.tag} (${freshMember.id})`, inline: false },
      { name: "Removed roles", value: chunkRoleNames(removed), inline: false },
      { name: "Skipped roles", value: chunkRoleNames(skipped.map((role) => ({ ...role, name: `${role.name} — ${role.reason}` }))), inline: false },
      { name: "Failed roles", value: chunkRoleNames(failed.map((role) => ({ ...role, name: `${role.name} — ${role.reason}` }))), inline: false },
    )
    .setTimestamp();

  await sendCleanupLog(freshMember.guild, embed);

  return {
    cleaned: true,
    removedCount: removed.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
  };
}

function scheduleReturningSyndicateCleanup(member) {
  const state = loadState();
  const record = state.members[member.id];
  if (!record) return false;

  setTimeout(async () => {
    try {
      await cleanupReturningSyndicateMember(member, {
        preserveRecord: false,
        pass: "delayed",
      });
    } catch (err) {
      console.error("[syndicateCleanup] Delayed cleanup failed:", err?.message || err);
    }
  }, CLEANUP_RETRY_DELAY_MS).unref?.();

  return true;
}

module.exports = {
  cleanupReturningSyndicateMember,
  loadState,
  markSyndicateMemberDeparture,
  memberHasSyndicateRole,
  resolveSyndicateRole,
  scheduleReturningSyndicateCleanup,
};
