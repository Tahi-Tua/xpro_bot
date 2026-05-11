const { PermissionFlagsBits } = require("discord.js");
const { MEMBER_ROLE_NAME, MEMBER_ROLE_ID, PENDING_ROLE_ID, GUEST_ROLE_ID, VISITOR_ROLE_NAME } = require("../config/channels");
const { sendDmWithRateLimit } = require("./dmRateLimiter");
const { withTimeout } = require("./discordUtils");

const UNVERIFIED_ROLE_NAME = "Unverified";
const APPLICANT_ROLE_NAME = "Applicant";

async function getBotMember(guild) {
  const botUserId = guild.client?.user?.id;
  if (!botUserId) return guild.members.me || null;
  return guild.members.me || withTimeout(guild.members.fetch(botUserId), "Join-Us bot member fetch").catch(() => null);
}

async function ensureCanManageRole(guild, role) {
  if (!role) return false;

  const botMember = await getBotMember(guild);
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("Bot lacks Manage Roles permission");
  }

  if (role.managed) {
    throw new Error(`Role '${role.name}' is managed by an integration`);
  }

  if (role.position >= botMember.roles.highest.position) {
    throw new Error(`Bot role is not high enough to manage '${role.name}'`);
  }

  return true;
}

async function removePendingRole(guild, member) {
  const pendingRole = guild.roles.cache.get(PENDING_ROLE_ID);
  if (pendingRole && member.roles.cache.has(pendingRole.id)) {
    await ensureCanManageRole(guild, pendingRole);
    await withTimeout(member.roles.remove(pendingRole), "Join-Us pending role remove").catch(() => {});
  }
}

async function cleanupJoinUsMessages(guild, ticketChannel) {
  const messages = await withTimeout(ticketChannel.messages.fetch({ limit: 50 }), "Join-Us metadata fetch").catch(() => null);
  if (!messages) return;

  const metaMsg = messages.find((m) => m.content.startsWith("META_JOINUS:"));
  if (!metaMsg) return;

  const [, joinChannelId, userMsgId, botMsgId] = metaMsg.content.split(":");
  const joinChannel = await withTimeout(guild.channels.fetch(joinChannelId), "Join-Us source channel fetch").catch(() => null);
  if (!joinChannel || !joinChannel.isTextBased()) return;

  const userMsg = await withTimeout(joinChannel.messages.fetch(userMsgId), "Join-Us user message fetch").catch(() => null);
  if (userMsg) await withTimeout(userMsg.delete(), "Join-Us user message delete").catch(() => {});

  const botMsg = await withTimeout(joinChannel.messages.fetch(botMsgId), "Join-Us bot message fetch").catch(() => null);
  if (botMsg) await withTimeout(botMsg.delete(), "Join-Us bot message delete").catch(() => {});
}

async function applyAcceptRoles(guild, member) {
  const result = {
    addedGuest: false,
    addedMember: false,
    removedApplicant: false,
    removedUnverified: false,
  };

  // Add Guest role
  try {
    if (GUEST_ROLE_ID) {
      const guestRole = guild.roles.cache.get(GUEST_ROLE_ID);
      if (guestRole && !member.roles.cache.has(guestRole.id)) {
        await ensureCanManageRole(guild, guestRole);
        await withTimeout(member.roles.add(guestRole), "Join-Us guest role add");
        result.addedGuest = true;
      }
    }
  } catch (err) {
    console.warn(`⚠️ Failed to add Guest role to ${member.user?.tag}: ${err.message}`);
  }

  // Add Member role
  try {
    const memberRole = MEMBER_ROLE_ID
      ? guild.roles.cache.get(MEMBER_ROLE_ID)
      : guild.roles.cache.find((r) => r.name === MEMBER_ROLE_NAME);
    if (memberRole && !member.roles.cache.has(memberRole.id)) {
      await ensureCanManageRole(guild, memberRole);
      await withTimeout(member.roles.add(memberRole), "Join-Us member role add");
      result.addedMember = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to add Member role to ${member.user?.tag}: ${err.message}`);
  }

  // Remove Applicant role
  try {
    const applicantRole = guild.roles.cache.find((r) => r.name === APPLICANT_ROLE_NAME);
    if (applicantRole && member.roles.cache.has(applicantRole.id)) {
      await ensureCanManageRole(guild, applicantRole);
      await withTimeout(member.roles.remove(applicantRole), "Join-Us applicant role remove");
      result.removedApplicant = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to remove Applicant role from ${member.user?.tag}: ${err.message}`);
  }

  // Remove Unverified role
  try {
    const unverifiedRole = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await ensureCanManageRole(guild, unverifiedRole);
      await withTimeout(member.roles.remove(unverifiedRole), "Join-Us unverified role remove");
      result.removedUnverified = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to remove Unverified role from ${member.user?.tag}: ${err.message}`);
  }

  return result;
}

async function applyDeclineRoles(guild, member) {
  const result = {
    removedApplicant: false,
    removedUnverified: false,
    addedVisitor: false,
  };

  try {
    const applicantRole = guild.roles.cache.find((r) => r.name === APPLICANT_ROLE_NAME);
    if (applicantRole && member.roles.cache.has(applicantRole.id)) {
      await ensureCanManageRole(guild, applicantRole);
      await withTimeout(member.roles.remove(applicantRole), "Join-Us applicant role remove");
      result.removedApplicant = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to remove Applicant role from ${member.user?.tag}: ${err.message}`);
  }

  try {
    // Remove Unverified role so declined users can explore limited channels
    const unverifiedRole = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await ensureCanManageRole(guild, unverifiedRole);
      await withTimeout(member.roles.remove(unverifiedRole), "Join-Us unverified role remove");
      result.removedUnverified = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to remove Unverified role from ${member.user?.tag}: ${err.message}`);
  }

  try {
    // Add Visitor role to give access only to specific channels (team-search, clips, screenshots, etc.)
    const visitorRole = guild.roles.cache.find((r) => r.name === VISITOR_ROLE_NAME);
    if (visitorRole && !member.roles.cache.has(visitorRole.id)) {
      await ensureCanManageRole(guild, visitorRole);
      await withTimeout(member.roles.add(visitorRole), "Join-Us visitor role add");
      result.addedVisitor = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to add Visitor role to ${member.user?.tag}: ${err.message}`);
  }

  return result;
}

async function closeTicketSoon(ticketChannel) {
  setTimeout(() => {
    withTimeout(ticketChannel.delete(), "Join-Us ticket delete").catch(() => {});
  }, 5000);
}

async function runJoinUsTicketDecision({
  guild,
  ticketChannel,
  decisionMessage = null,
  userId,
  decision, // "accept" | "deny"
  moderatorLabel,
  reason = null,
}) {
  const member = await withTimeout(guild.members.fetch(userId), "Join-Us applicant member fetch").catch(() => null);
  if (!member) {
    if (decisionMessage) await withTimeout(decisionMessage.edit({ components: [] }), "Join-Us decision disable").catch(() => {});
    await closeTicketSoon(ticketChannel);
    return { ok: false, error: "User not found (left server?)" };
  }

  if (decisionMessage) await withTimeout(decisionMessage.edit({ components: [] }), "Join-Us decision disable").catch(() => {});

  await removePendingRole(guild, member).catch((err) => {
    console.warn(`⚠️ Failed to remove Pending role from ${member.user?.tag}: ${err.message}`);
  });
  await cleanupJoinUsMessages(guild, ticketChannel);

  if (decision === "accept") {
    const applyResult = await applyAcceptRoles(guild, member);
    const roleChangeOk = applyResult.addedGuest || applyResult.addedMember;

    await withTimeout(
      ticketChannel.send(
        roleChangeOk
          ? `✅ Application **ACCEPTED** by ${moderatorLabel}${reason ? `\nReason: ${reason}` : ""}.`
          : `✅ Application **ACCEPTED** by ${moderatorLabel}, but I couldn't change roles.\n⚠️ Please ensure the bot's role is above Guest/Member and has 'Manage Roles' permission.`,
      ),
      "Join-Us accept result send",
    ).catch(() => {});

    await sendDmWithRateLimit(
      member,
        "✅ Your application has been **accepted**!\n" +
          "An XPro staff member will reach out to you **in-game later today** to get you set up.",
    );

    await closeTicketSoon(ticketChannel);
    return roleChangeOk ? { ok: true } : { ok: false, error: "Insufficient permissions to change roles on acceptance." };
  }

  if (decision === "deny") {
    await applyDeclineRoles(guild, member);

    await withTimeout(
      ticketChannel.send(
        `❌ Application **DECLINED** by ${moderatorLabel}${reason ? `\nReason: ${reason}` : ""}.`,
      ),
      "Join-Us decline result send",
    ).catch(() => {});

    const teamSearchMention = `<#1381575870468198460>`;
    const clipsMention = `<#1381581265542844496>`;
    const screenshotsMention = `<#1381575518532534402>`;
    const balanceChangesMention = `<#1427088947871223848>`;
    const memesMention = `<#1381575710942167101>`;

    const declineMessage =
      "Unfortunately your application has been rejected, " +
      "If u want a friend or a team you can reach out to our members individually or maybe go to our\n\n" +
      `${teamSearchMention}\n\n` +
      "to get a team, but unfortunately we can't actually let you into the syndicate. " +
      "Your application was rejected for the following reasons: " +
      `${reason ? reason : "(no reason provided)"}. ` +
      "When this is sorted out feel free to reach out to us and we'll gladly look into letting u in.\n" +
      "For now feel free to explore the server:\n\n" +
      `${clipsMention}\n` +
      `${screenshotsMention}\n` +
      `${balanceChangesMention}\n` +
      `${memesMention}`;

    await sendDmWithRateLimit(member, declineMessage);

    await closeTicketSoon(ticketChannel);
    return { ok: true };
  }

  return { ok: false, error: "Invalid decision" };
}

module.exports = {
  ensureCanManageRole,
  runJoinUsTicketDecision,
};
