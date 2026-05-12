const csv = (value, fallback = []) => {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const env = (name, fallback) => process.env[name] || fallback;

module.exports = {
  RULES_CHANNEL_ID: env("RULES_CHANNEL_ID", "1381588865235812373"),
  WELCOME_CHANNEL_ID: env("WELCOME_CHANNEL_ID", "1381589122455703644"),
  JOIN_US_CHANNEL_ID: env("JOIN_US_CHANNEL_ID", "1381590371758374922"),
  GENERAL_CHAT_ID: env("GENERAL_CHAT_ID", "1392950551502786660"),
  SCREENSHOTS_CHANNEL_ID: env("SCREENSHOTS_CHANNEL_ID", "1381575518532534402"),
  CLAN_MEDIA_CHANNEL_ID: env("CLAN_MEDIA_CHANNEL_ID", "1381596357026119780"),
  DIVINE_TIPS_CHANNEL_ID: env("DIVINE_TIPS_CHANNEL_ID", "1381586337408225322"),
  HERO_TIPS_CHANNEL_ID: env("HERO_TIPS_CHANNEL_ID", "1381586653033922620"),
  HELLO_CHANNEL_ID: env("HELLO_CHANNEL_ID", "1381589122455703644"),
  STAFF_LOG_CHANNEL_ID: env("STAFF_LOG_CHANNEL_ID", "1448782736620912690"),
  MODERATION_LOG_CHANNEL_ID: env("MODERATION_LOG_CHANNEL_ID", "1380197851371409482"),
  SVS_REMINDER_CHANNEL_ID: env("SVS_REMINDER_CHANNEL_ID", "1381596170748690452"),
  SVS_ROLE_ID: env("SVS_ROLE_ID", "1386473592622940221"),
  ONLINE_CATEGORY_ID: env("ONLINE_CATEGORY_ID", "1448069014495432785"),
  BUG_REPORTS_CHANNEL_ID: env("BUG_REPORTS_CHANNEL_ID", "1451311925030813878"),
  TACTICS_SUBMISSIONS_CHANNEL_ID: env("TACTICS_SUBMISSIONS_CHANNEL_ID", "1463323444300091610"),
  BOT_LOGS_CHANNEL_ID: env("BOT_LOGS_CHANNEL_ID", "1449540381216735293"),
  SUGGESTION_CHANNEL_ID: env("SUGGESTION_CHANNEL_ID", "1381583643834581013"),
  HALL_OF_FAME_CHANNEL_ID: env("HALL_OF_FAME_CHANNEL_ID", "1380349437070540841"),
  CLAN_CHATS_CATEGORY_ID: env("CLAN_CHATS_CATEGORY_ID", "1381595433113223259"),
  YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID: env("YOUTUBE_ANNOUNCEMENTS_CHANNEL_ID", "1503759754995175434"),
  YOUTUBE_ANNOUNCEMENTS_CHANNEL_NAME: env("YOUTUBE_ANNOUNCEMENTS_CHANNEL_NAME", "├・🎬・sir-genix-yt"),

  // Survey results channel (staff-only)
  SURVEY_RESULTS_CHANNEL_ID: env("SURVEY_RESULTS_CHANNEL_ID", "1469465152972652565"),

  // Channels excluded from spam/badwords filters and scans.
  FILTER_EXEMPT_CHANNEL_IDS: csv(process.env.FILTER_EXEMPT_CHANNEL_IDS, [
    "1381595826505253024",
  ]),
  // Categories where spam/badword filters are always enforced.
  FILTER_ENFORCED_CATEGORY_IDS: csv(process.env.FILTER_ENFORCED_CATEGORY_IDS, [
    "1380190903616147589",
  ]),

  // Private channels/categories excluded from Guest/Member public access
  PRIVATE_CHANNEL_IDS: csv(process.env.PRIVATE_CHANNEL_IDS, [
    "1448782736620912690",    // STAFF_LOG_CHANNEL_ID
    "1380197851371409482",    // MODERATION_LOG_CHANNEL_ID
    "1449540381216735293",    // BOT_LOGS_CHANNEL_ID
  ]),
  PRIVATE_CATEGORY_IDS: csv(process.env.PRIVATE_CATEGORY_IDS, [
    // Add category IDs here if you have staff-only categories
  ]),

  // The name of the role granted to regular members.  This value is used
  // throughout the bot when assigning roles after verification.  Change
  // this to match your server's member role name.
  MEMBER_ROLE_NAME: env("MEMBER_ROLE_NAME", "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑜"),
  // Optional: if you prefer referencing the member role by ID rather than name,
  // set MEMBER_ROLE_ID (or via env var MEMBER_ROLE_ID). When present, the bot
  // will use the ID to grant the role on acceptance.
  MEMBER_ROLE_ID: process.env.MEMBER_ROLE_ID || null,

  // Role IDs for ticket management (Leaders and Staff)
  LEADER_ROLE_ID: env("LEADER_ROLE_ID", "1380247716596023317"),  // ҲƤƦƠ ԼЄƛƊЄƦ 🌟
  STAFF_ROLE_ID: env("STAFF_ROLE_ID", "1447642963189694647"),   // Xpro Pro Staff
  MOD_ROLE_NAME: env("MOD_ROLE_NAME", "Xpro Pro Staff"),
  PENDING_ROLE_ID: env("PENDING_ROLE_ID", "1447512419705425952"),
  GUEST_ROLE_ID: env("GUEST_ROLE_ID", "1381603842856321096"), // Role automatically assigned to accepted new members
  VISITOR_ROLE_NAME: env("VISITOR_ROLE_NAME", "Visitor"), // Role for declined applicants with limited channel access
  ADMIN_USER_ID: env("ADMIN_USER_ID", "1349048881966747699"),
  MEDIA_MANAGER_ROLE_ID: env("MEDIA_MANAGER_ROLE_ID", ""),
  MEDIA_MANAGER_ROLE_NAME: env("MEDIA_MANAGER_ROLE_NAME", "media manager"),
  
  // Read-only role configuration
  READ_ONLY_ROLE_NAME: env("READ_ONLY_ROLE_NAME", "LECTURE SEULE"),
  READ_ONLY_THRESHOLD: Number(process.env.READ_ONLY_THRESHOLD || 20),

  // Role IDs that bypass spam/badwords filters (staff/moderation roles)
  BYPASS_ROLE_IDS: csv(process.env.BYPASS_ROLE_IDS, [
    "1380247716596023317", // @leaders XPRO
    "1380243547642400849", // @vice-leaders XPRO
    "1380194646155726940", // @Moderators
  ]),

  // IDs allowed to use @everyone/@here without triggering spam
  ALLOWED_GLOBAL_MENTION_IDS: csv(process.env.ALLOWED_GLOBAL_MENTION_IDS, [
    "1380247716596023317", // ҲƤƦƠ ԼЄƛƊЄƦ 🌟
  ]),
};
