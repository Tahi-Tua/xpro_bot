const BYPASS_ROLE_IDS = new Set([
  "1380247716596023317", // @leaders XPRO
  "1380243547642400849", // @vice-leaders XPRO
  "1380194646155726940", // @Moderators
]);

function hasBypassRole(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some((role) => BYPASS_ROLE_IDS.has(role.id));
}

module.exports = { hasBypassRole, BYPASS_ROLE_IDS };
