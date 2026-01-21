const { BYPASS_ROLE_IDS } = require("../config/channels");

const bypassSet = new Set(BYPASS_ROLE_IDS);

function hasBypassRole(member) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some((role) => bypassSet.has(role.id));
}

module.exports = { hasBypassRole, BYPASS_ROLE_IDS: bypassSet };
