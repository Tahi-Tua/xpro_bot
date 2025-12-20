const { MEMBER_ROLE_NAME, PENDING_ROLE_ID } = require("../config/channels");

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
  const memberRole = guild.roles.cache.find((r) => r.name === MEMBER_ROLE_NAME);
  if (memberRole && !member.roles.cache.has(memberRole.id)) {
    await member.roles.add(memberRole).catch(() => {});
  }

  const applicantRole = guild.roles.cache.find((r) => r.name === APPLICANT_ROLE_NAME);
  if (applicantRole && member.roles.cache.has(applicantRole.id)) {
    await member.roles.remove(applicantRole).catch(() => {});
  }

  const unverifiedRole = guild.roles.cache.find((r) => r.name === UNVERIFIED_ROLE_NAME);
  if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
    await member.roles.remove(unverifiedRole).catch(() => {});
  }
}

async function applyDeclineRoles(guild, member) {
  const applicantRole = guild.roles.cache.find((r) => r.name === APPLICANT_ROLE_NAME);
  if (applicantRole && member.roles.cache.has(applicantRole.id)) {
    await member.roles.remove(applicantRole).catch(() => {});
  }
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
    await applyAcceptRoles(guild, member);

    await ticketChannel
      .send(
        `?? Application **ACCEPTED** by ${moderatorLabel}${reason ? `\nReason: ${reason}` : ""}.`,
      )
      .catch(() => {});

    await member
      .send(
        "?? Your application has been **accepted**! Welcome to Xavier Pro!\n" +
          "You now have full access to all channels.",
      )
      .catch(() => {});

    await closeTicketSoon(ticketChannel);
    return { ok: true };
  }

  if (decision === "deny") {
    await applyDeclineRoles(guild, member);

    await ticketChannel
      .send(
        `?? Application **DECLINED** by ${moderatorLabel}${reason ? `\nReason: ${reason}` : ""}.`,
      )
      .catch(() => {});

    await member
      .send(
        "? Your application has been **declined**.\n" +
          "Thank you for your interest in Xavier Pro.",
      )
      .catch(() => {});

    await closeTicketSoon(ticketChannel);
    return { ok: true };
  }

  return { ok: false, error: "Invalid decision" };
}

module.exports = {
  runJoinUsTicketDecision,
};

