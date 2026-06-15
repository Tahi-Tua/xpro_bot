const { WELCOME_CHANNEL_ID, GUEST_ROLE_ID } = require("../config/channels");
const { getWelcomePayload } = require("../handlers/welcome");
const {
  cleanupReturningSyndicateMember,
  scheduleReturningSyndicateCleanup,
} = require("../utils/syndicateRoleCleanup");

async function assignGuestRole(member) {
  if (!GUEST_ROLE_ID) {
    console.warn("⚠️ GUEST_ROLE_ID is not configured; new member will not receive Guest.");
    return { added: false, reason: "missing_config" };
  }

  const guestRole = member.guild.roles.cache.get(GUEST_ROLE_ID);
  if (!guestRole) {
    console.warn(`⚠️ Guest role not found for ID: ${GUEST_ROLE_ID}`);
    return { added: false, reason: "missing_role" };
  }

  if (member.roles.cache.has(guestRole.id)) {
    console.log(`ℹ️ ${member.user.tag} already has Guest role.`);
    return { added: false, reason: "already_has_role" };
  }

  try {
    await member.roles.add(guestRole);
    console.log(`✅ Added Guest role to ${member.user.tag}`);
    return { added: true, reason: "added" };
  } catch (err) {
    console.error("❌ Cannot add Guest role:", err.message);
    return { added: false, reason: "add_failed", error: err };
  }
}

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

    await assignGuestRole(member);

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

module.exports.assignGuestRole = assignGuestRole;
