import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const repoRequire = createRequire(`${process.cwd()}/`);

function requireArtifactTool() {
  const candidates = [
    `${process.cwd()}/`,
    process.env.ARTIFACT_TOOL_REQUIRE_ROOT,
    "C:/Users/tetau/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return createRequire(candidate)("@oai/artifact-tool");
    } catch {
      // Try the next known runtime location.
    }
  }

  throw new Error("Cannot find @oai/artifact-tool. Run this from Codex or set ARTIFACT_TOOL_REQUIRE_ROOT.");
}

const { SpreadsheetFile, Workbook } = requireArtifactTool();

const outputArg = process.argv[2];
const outputDir = outputArg
  ? path.resolve(outputArg)
  : path.join(os.tmpdir(), "xpro-member-hub");
const outputPath = path.join(outputDir, "XPRO Member Hub.xlsx");

const channelConfig = repoRequire("./config/channels");
const heroes = repoRequire("./config/heroes");
const { getEntries } = repoRequire("./utils/leaderboardStore");

const guildId = process.env.GUILD_ID || "1380190902630223990";

function channelUrl(channelId) {
  return channelId ? `https://discord.com/channels/${guildId}/${channelId}` : "";
}

function truncate(value, limit = 450) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function styleSheet(sheet, columnWidths = []) {
  sheet.showGridLines = true;
  sheet.freezePanes.freezeRows(1);

  const used = sheet.getUsedRange(true);
  used.format = {
    font: { color: "#111827" },
    borders: { preset: "all", style: "thin", color: "#E5E7EB" },
    wrapText: true,
  };

  const header = sheet.getRangeByIndexes(0, 0, 1, used.columnCount);
  header.format = {
    fill: "#E5E7EB",
    font: { bold: true, color: "#111827" },
    borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  };

  columnWidths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

function addSheet(workbook, name, headers, rows, columnWidths) {
  const sheet = workbook.worksheets.add(name);
  sheet.getRangeByIndexes(0, 0, rows.length + 1, headers.length).values = [headers, ...rows];
  styleSheet(sheet, columnWidths);
  return sheet;
}

function buildLeaderboardRows() {
  const entries = getEntries().slice(0, 100);
  let lastScore = null;
  let lastRank = 0;

  return entries.map((entry, index) => {
    if (entry.score !== lastScore) {
      lastRank = index + 1;
      lastScore = entry.score;
    }

    return [
      entry.name,
      "",
      entry.score,
      lastRank,
      entry.updatedAt ? new Date(entry.updatedAt).toISOString() : new Date().toISOString(),
    ];
  });
}

const workbook = Workbook.create();

addSheet(
  workbook,
  "Users",
  ["Email", "DiscordId", "DiscordName", "Role", "Status", "JoinedAt", "ProfileComplete"],
  [
    ["member@example.com", "", "Example Member", "member", "accepted", formatIsoDate(new Date()), false],
    ["staff@example.com", "", "Example Staff", "staff", "accepted", formatIsoDate(new Date()), true],
    ["leader@example.com", "", "Example Leader", "leader", "accepted", formatIsoDate(new Date()), true],
  ],
  [210, 160, 180, 110, 120, 120, 150],
);

addSheet(
  workbook,
  "MemberProfiles",
  [
    "Email",
    "DiscordId",
    "InGameName",
    "PlayerId",
    "FavoriteHeroes",
    "Language",
    "Timezone",
    "Availability",
    "Bio",
    "AvatarUrl",
  ],
  [
    [
      "member@example.com",
      "",
      "Example Member",
      "",
      "Sparkle, Cyclops",
      "FR/EN",
      "Europe/Paris",
      "Evenings, weekend events",
      "Complete this row from Glide after sign-in.",
      "",
    ],
  ],
  [210, 160, 170, 150, 220, 100, 140, 220, 320, 220],
);

const resourceRows = [
  [
    "Welcome to XPRO",
    "Guide",
    "",
    "Start here: read the rules, complete your member profile, check events, and join the right Discord channels.",
    "",
    channelUrl(channelConfig.RULES_CHANNEL_ID),
    "member",
    1,
  ],
  [
    "Join-Us / Syndicate Application",
    "Link",
    "",
    "Use this Discord channel if you want to apply to join the syndicate.",
    "",
    channelUrl(channelConfig.JOIN_US_CHANNEL_ID),
    "member",
    2,
  ],
  ...heroes.map((hero, index) => [
    hero.name,
    "Hero Tip",
    hero.name,
    truncate(hero.tips, 500),
    hero.image || "",
    channelUrl(channelConfig.HERO_TIPS_CHANNEL_ID),
    "member",
    100 + index,
  ]),
];

addSheet(
  workbook,
  "Resources",
  ["Title", "Type", "Hero", "Content", "ImageUrl", "Link", "VisibleForRole", "SortOrder"],
  resourceRows,
  [220, 120, 140, 520, 260, 260, 130, 100],
);

addSheet(
  workbook,
  "Events",
  ["Title", "Type", "StartsAt", "Status", "Description", "DiscordLink", "VisibleForRole"],
  [
    [
      "Xavier Pro KOTH Tournament",
      "Tournament",
      "Coming Soon",
      "planned",
      "Battle Royale Duos, 10 rounds, point-based scoring.",
      "",
      "member",
    ],
    [
      "SVS Availability Check",
      "SVS",
      "Weekly",
      "active",
      "Members confirm availability, then teams are generated from responses.",
      channelUrl(channelConfig.SVS_REMINDER_CHANNEL_ID),
      "member",
    ],
  ],
  [240, 130, 160, 120, 420, 260, 130],
);

const leaderboardRows = buildLeaderboardRows();
addSheet(
  workbook,
  "Leaderboard",
  ["Name", "DiscordId", "Score", "Rank", "LastUpdated"],
  leaderboardRows.length ? leaderboardRows : [["", "", 0, "", ""]],
  [220, 170, 110, 90, 220],
);

addSheet(
  workbook,
  "AppLinks",
  ["Title", "Description", "Url", "VisibleForRole", "SortOrder"],
  [
    ["Rules", "Read and accept the server rules.", channelUrl(channelConfig.RULES_CHANNEL_ID), "member", 1],
    ["General Chat", "Main community chat.", channelUrl(channelConfig.GENERAL_CHAT_ID), "member", 2],
    ["Hero Tips", "Hero guides and updates.", channelUrl(channelConfig.HERO_TIPS_CHANNEL_ID), "member", 3],
    ["Suggestions", "Suggest improvements for the server.", channelUrl(channelConfig.SUGGESTION_CHANNEL_ID), "member", 4],
    ["Bug Reports", "Report bot/server issues.", channelUrl(channelConfig.BUG_REPORTS_CHANNEL_ID), "member", 5],
    ["Hall of Fame", "Community achievements.", channelUrl(channelConfig.HALL_OF_FAME_CHANNEL_ID), "member", 6],
  ],
  [180, 320, 300, 130, 100],
);

for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange(true);
  used.format.rowHeightPx = 28;
  sheet.getRangeByIndexes(0, 0, 1, used.columnCount).format.rowHeightPx = 34;
}

const overview = await workbook.inspect({
  kind: "sheet,table",
  maxChars: 5000,
  tableMaxRows: 4,
  tableMaxCols: 8,
});
console.log(overview.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputPath);
console.log(outputPath);
