const { MEMBER_ROLE_NAME, MEMBER_ROLE_ID, PENDING_ROLE_ID, GUEST_ROLE_ID, VISITOR_ROLE_NAME } = require("../config/channels");

const UNVERIFIED_ROLE_NAME = "Unverified";
const APPLICANT_ROLE_NAME = "Applicant";

async function removePendingRole(guild, member) {
  const pendingRole = guild.roles.cache.get(PENDING_ROLE_ID);
  if (pendingRole && member.roles.cache.has(pendingRole.id)) {
    await member.roles.remove(pendingRole).catch(() => {});
  }
}

async function cleanupJoinUsMessages(guild, ticketChannel) {
  const messages = await ticketChannel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return;

  const metaMsg = messages.find((m) => m.content.startsWith("META_JOINUS:"));
  if (!metaMsg) return;

  const [, joinChannelId, userMsgId, botMsgId] = metaMsg.content.split(":");
  const joinChannel = await guild.channels.fetch(joinChannelId).catch(() => null);
  if (!joinChannel || !joinChannel.isTextBased()) return;

  const userMsg = await joinChannel.messages.fetch(userMsgId).catch(() => null);
  if (userMsg) await userMsg.delete().catch(() => {});

  const botMsg = await joinChannel.messages.fetch(botMsgId).catch(() => null);
  if (botMsg) await botMsg.delete().catch(() => {});
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
        await member.roles.add(guestRole);
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
      await member.roles.add(memberRole);
      result.addedMember = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to add Member role to ${member.user?.tag}: ${err.message}`);
  }

  // Remove Applicant role
  try {
    const applicantRole = guild.roles.cache.find((r) => r.name === APPLICANT_ROLE_NAME);
    if (applicantRole && member.roles.cache.has(applicantRole.id)) {
      await member.roles.remove(applicantRole);
      result.removedApplicant = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to remove Applicant role from ${member.user?.tag}: ${err.message}`);
  }

  // Remove Unverified role
  try {
    const unverifiedRole = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.remove(unverifiedRole);
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
      await member.roles.remove(applicantRole);
      result.removedApplicant = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to remove Applicant role from ${member.user?.tag}: ${err.message}`);
  }

  try {
    // Remove Unverified role so declined users can explore limited channels
    const unverifiedRole = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.remove(unverifiedRole);
      result.removedUnverified = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to remove Unverified role from ${member.user?.tag}: ${err.message}`);
  }

  try {
    // Add Visitor role to give access only to specific channels (team-search, clips, screenshots, etc.)
    const visitorRole = guild.roles.cache.find((r) => r.name === VISITOR_ROLE_NAME);
    if (visitorRole && !member.roles.cache.has(visitorRole.id)) {
      await member.roles.add(visitorRole);
      result.addedVisitor = true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to add Visitor role to ${member.user?.tag}: ${err.message}`);
  }

  return result;
}

async function closeTicketSoon(ticketChannel) {
  setTimeout(() => {
    ticketChannel.delete().catch(() => {});
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
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    if (decisionMessage) await decisionMessage.edit({ components: [] }).catch(() => {});
    await closeTicketSoon(ticketChannel);
    return { ok: false, error: "User not found (left server?)" };
  }

  if (decisionMessage) await decisionMessage.edit({ components: [] }).catch(() => {});

  await removePendingRole(guild, member);
  await cleanupJoinUsMessages(guild, ticketChannel);

  if (decision === "accept") {
    const applyResult = await applyAcceptRoles(guild, member);
    const roleChangeOk = applyResult.addedGuest || applyResult.addedMember;

    await ticketChannel
      .send(
        roleChangeOk
          ? `?? Application **ACCEPTED** by ${moderatorLabel}${reason ? `\nReason: ${reason}` : ""}.`
          : `?? Application **ACCEPTED** by ${moderatorLabel}, but I couldn't change roles.\nPlease ensure the bot's role is above Guest/Member and has 'Manage Roles' permission.`,
      )
      .catch(() => {});

    await member
      .send(
        "?? Your application has been **accepted**!\n" +
          "An XPro staff member will reach out to you **in-game later today** to get you set up.",
      )
      .catch(() => {});

    await closeTicketSoon(ticketChannel);
    return roleChangeOk ? { ok: true } : { ok: false, error: "Insufficient permissions to change roles on acceptance." };
  }

  if (decision === "deny") {
    await applyDeclineRoles(guild, member);

    await ticketChannel
      .send(
        `?? Application **DECLINED** by ${moderatorLabel}${reason ? `\nReason: ${reason}` : ""}.`,
      )
      .catch(() => {});

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

    await member.send(declineMessage).catch(() => {});

    await closeTicketSoon(ticketChannel);
    return { ok: true };
  }

  return { ok: false, error: "Invalid decision" };
}

module.exports = {
  runJoinUsTicketDecision,
};

