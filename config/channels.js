module.exports = {
  RULES_CHANNEL_ID: "1446779130145144892",
  WELCOME_CHANNEL_ID: "1381589122455703644",
  JOIN_US_CHANNEL_ID: "1381590371758374922",
  GENERAL_CHAT_ID: "1392950551502786660",
  SCREENSHOTS_CHANNEL_ID: "1381575518532534402",
  CLAN_MEDIA_CHANNEL_ID: "1381596357026119780",
  DIVINE_TIPS_CHANNEL_ID: "1381586337408225322",
  HERO_TIPS_CHANNEL_ID: "1381586653033922620",
  HELLO_CHANNEL_ID: process.env.HELLO_CHANNEL_ID || "1381589122455703644",
  STAFF_LOG_CHANNEL_ID: "1448782736620912690",
  MODERATION_LOG_CHANNEL_ID: "1380197851371409482",
  SVS_REMINDER_CHANNEL_ID: "1381596170748690452",
  SVS_ROLE_ID: "1386473592622940221",
  ONLINE_CATEGORY_ID: "1448069014495432785",
  BUG_REPORTS_CHANNEL_ID: "1451311925030813878",
  BOT_LOGS_CHANNEL_ID: "1449540381216735293",
  SUGGESTION_CHANNEL_ID: "1381583643834581013",
  HALL_OF_FAME_CHANNEL_ID: "1380349437070540841",

  // Channels excluded from spam/badwords filters and scans.
  FILTER_EXEMPT_CHANNEL_IDS: [
    "1381595826505253024",
  ],
  // Categories where spam/badword filters are always enforced.
  FILTER_ENFORCED_CATEGORY_IDS: [
    "1380190903616147589",
  ],

  // Private channels/categories excluded from Guest/Member public access
  PRIVATE_CHANNEL_IDS: [
    "1448782736620912690",    // STAFF_LOG_CHANNEL_ID
    "1380197851371409482",    // MODERATION_LOG_CHANNEL_ID
    "1449540381216735293",    // BOT_LOGS_CHANNEL_ID
  ],
  PRIVATE_CATEGORY_IDS: [
    // Add category IDs here if you have staff-only categories
  ],

  // The name of the role granted to regular members.  This value is used
  // throughout the bot when assigning roles after verification.  Change
  // this to match your server's member role name.
  MEMBER_ROLE_NAME: "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑜",
  // Optional: if you prefer referencing the member role by ID rather than name,
  // set MEMBER_ROLE_ID (or via env var MEMBER_ROLE_ID). When present, the bot
  // will use the ID to grant the role on acceptance.
  MEMBER_ROLE_ID: process.env.MEMBER_ROLE_ID || null,

  // Role IDs for ticket management (Leaders and Staff)
  LEADER_ROLE_ID: "1380247716596023317",  // ҲƤƦƠ ԼЄƛƊЄƦ 🌟
  STAFF_ROLE_ID: "1447642963189694647",   // Xpro Pro Staff
  MOD_ROLE_NAME: process.env.MOD_ROLE_NAME || "Xpro Pro Staff",
  PENDING_ROLE_ID: "1447512419705425952",
  GUEST_ROLE_ID: "1381603842856321096", // Role automatically assigned to accepted new members
  VISITOR_ROLE_NAME: "Visitor", // Role for declined applicants with limited channel access
  ADMIN_USER_ID: "1349048881966747699",
  
  // Read-only role configuration
  READ_ONLY_ROLE_NAME: process.env.READ_ONLY_ROLE_NAME || "LECTURE SEULE",
  READ_ONLY_THRESHOLD: Number(process.env.READ_ONLY_THRESHOLD || 20),
};
