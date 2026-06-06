const { Events } = require("discord.js");
const {
  GUEST_ROLE_ID,
  SYNDICATE_CLEANUP_FORCE_USER_IDS,
} = require("../config/channels");
const {
  cleanupReturningSyndicateMember,
  scheduleReturningSyndicateCleanup,
} = require("../utils/syndicateRoleCleanup");

const UNVERIFIED_ROLE_NAME = "Unverified";

async function addStartRole(member) {
  const unverifiedRole = member.guild.roles.cache.find((role) => role.name === UNVERIFIED_ROLE_NAME);
  if (unverifiedRole) {
    await member.roles.add(unverifiedRole, "Forced syndicate cleanup: restore start role");
    return unverifiedRole.name;
  }

  if (GUEST_ROLE_ID) {
    const guestRole = member.guild.roles.cache.get(GUEST_ROLE_ID) || await member.guild.roles.fetch(GUEST_ROLE_ID).catch(() => null);
    if (guestRole) {
      await member.roles.add(guestRole, "Forced syndicate cleanup: restore fallback start role");
      return guestRole.name;
    }
  }

  return null;
}

module.exports = (client) => {
  client.once(Events.ClientReady, async () => {
    if (!SYNDICATE_CLEANUP_FORCE_USER_IDS.length) return;

    console.log(
      `[syndicateForceCleanupReady] Starting forced cleanup scan for ${SYNDICATE_CLEANUP_FORCE_USER_IDS.length} user(s)`,
    );

    for (const guild of client.guilds.cache.values()) {
      for (const userId of SYNDICATE_CLEANUP_FORCE_USER_IDS) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member || member.user.bot) continue;

        try {
          const cleanupResult = await cleanupReturningSyndicateMember(member, {
            preserveRecord: true,
            pass: "ready-scan",
          });

          const startRoleName = await addStartRole(member).catch((err) => {
            console.error(
              `[syndicateForceCleanupReady] Cannot add start role to ${member.user.tag}:`,
              err?.message || err,
            );
            return null;
          });

          const delayed = scheduleReturningSyndicateCleanup(member);

          console.log(
            `[syndicateForceCleanupReady] Forced cleanup done for ${member.user.tag} (${member.id}) | removed=${cleanupResult.removedCount || 0} skipped=${cleanupResult.skippedCount || 0} failed=${cleanupResult.failedCount || 0} startRole=${startRoleName || "none"} delayed=${delayed}`,
          );
        } catch (err) {
          console.error(
            `[syndicateForceCleanupReady] Forced cleanup failed for ${userId}:`,
            err?.message || err,
          );
        }
      }
    }
  });
};
