const muteStore = require("./muteStore");

const MUTED_ROLE_NAME = process.env.MUTED_ROLE_NAME || "muted";

function findMutedRole(guild) {
  return guild.roles.cache.find((r) => r.name.toLowerCase() === MUTED_ROLE_NAME.toLowerCase());
}

async function applyModerationMute(member, reason, durationMs) {
  const guild = member.guild;
  const mutedRole = findMutedRole(guild);
  const expiresAt = Date.now() + durationMs;

  if (mutedRole) {
    await member.roles.add(mutedRole, reason);
    muteStore.recordMute(guild.id, member.id, expiresAt, reason);
    return { ok: true, method: "role", expiresAt, mutedRole };
  }

  await member.timeout(durationMs, reason);
  return { ok: true, method: "timeout", expiresAt, mutedRole: null };
}

async function liftModerationMute(guild, userId, reason = "Mute lifted") {
  const result = {
    memberFound: false,
    removedRole: false,
    clearedTimeout: false,
    clearedStore: false,
  };

  const member = await guild.members.fetch(userId).catch(() => null);
  const mutedRole = findMutedRole(guild);

  if (member) {
    result.memberFound = true;

    if (mutedRole && member.roles.cache.has(mutedRole.id)) {
      await member.roles.remove(mutedRole, reason);
      result.removedRole = true;
    }

    if (member.communicationDisabledUntilTimestamp) {
      await member.timeout(null, reason);
      result.clearedTimeout = true;
    } else {
      await member.timeout(null, reason).catch(() => {});
    }
  }

  if (muteStore.isMuted(guild.id, userId)) {
    muteStore.removeMute(guild.id, userId);
    result.clearedStore = true;
  }

  return result;
}

module.exports = {
  MUTED_ROLE_NAME,
  findMutedRole,
  applyModerationMute,
  liftModerationMute,
};
