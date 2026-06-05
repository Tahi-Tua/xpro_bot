const { WELCOME_CHANNEL_ID, GUEST_ROLE_ID } = require("../config/channels");
const { getWelcomePayload } = require("../handlers/welcome");
const {
  cleanupReturningSyndicateMember,
  scheduleReturningSyndicateCleanup,
} = require("../utils/syndicateRoleCleanup");

const UNVERIFIED_ROLE_NAME = "Unverified";

module.exports = (client) => {
  client.on("guildMemberAdd", async (member) => {
    if (member.user.bot) return;

    let delayedCleanupScheduled = false;

    try {
      const cleanupResult = await cleanupReturningSyndicateMember(member, {
        preserveRecord: true,
        pass: "immediate",
      });

      if (cleanupResult.cleaned) {
        delayedCleanupScheduled = scheduleReturningSyndicateCleanup(member);
        console.log(
          `🧹 Syndicate cleanup immediate pass for ${member.user.tag}: removed=${cleanupResult.removedCount}, skipped=${cleanupResult.skippedCount}, failed=${cleanupResult.failedCount}, delayed=${delayedCleanupScheduled}`,
        );
      }
    } catch (cleanupErr) {
      console.error(
        "❌ Syndicate cleanup failed on member join:",
        cleanupErr?.message || cleanupErr,
      );
    }

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

    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (channel?.isTextBased?.()) {
      const payload = getWelcomePayload(member);
      await channel.send(payload).catch((err) => {
        console.error("❌ Cannot send welcome message:", err.message);
      });
    } else {
      console.warn(`⚠️ Welcome channel not found or not text-based: ${WELCOME_CHANNEL_ID}`);
    }
  });
};
