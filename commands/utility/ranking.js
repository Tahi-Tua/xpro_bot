const crypto = require("crypto");
const fs = require("fs").promises;
const https = require("https");
const path = require("path");
const {
  AttachmentBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");

const {
  LEADER_ROLE_ID,
  STAFF_ROLE_ID,
} = require("../../config/channels");

const {
  getAllRankings,
  removeMemberRanking,
  resetRankings,
  upsertMemberRanking,
} = require("../../utils/memberRankingStore");

const { buildLeaderboardScreenshotBuffer } = require("../../utils/leaderboardScreenshot");

const ROSTER_PATH = process.env.MEMBER_RANKING_ROSTER_FILE || path.join(__dirname, "..", "..", "data", "memberRankingRoster.json");
const ROSTER_URL = process.env.MEMBER_RANKING_ROSTER_URL || "https://raw.githubusercontent.com/Tahi-Tua/xpro_bot/main/data/memberRankingRoster.json";

function canManageRankings(interaction) {
  const roles = interaction.member?.roles?.cache;
  return Boolean(
    roles?.has(LEADER_ROLE_ID) ||
      roles?.has(STAFF_ROLE_ID) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
  );
}

function normalizePlayerName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function playerKeyFromName(name) {
  const normalized = normalizePlayerName(name).toLowerCase();
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 16);
  return `player:${hash}`;
}

function toSafeScore(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function displayNameFromEntry(entry) {
  return entry.displayName || entry.renderName || entry.tag || entry.userId || "Unknown";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function readHttpsText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 10000 }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });

    request.on("timeout", () => request.destroy(new Error("Request timed out")));
    request.on("error", reject);
  });
}

function extractRosterMembers(raw) {
  const parsed = JSON.parse(raw || "{}");
  const members = Array.isArray(parsed) ? parsed : parsed.members;

  if (!Array.isArray(members)) {
    throw new Error("memberRankingRoster.json must contain a members array.");
  }

  return members;
}

async function createRosterTemplate() {
  const template = {
    members: [
      {
        name: "Example Player",
        renderName: "Example Player",
        weekly: 0,
        season: 0,
        dailyXp: 0,
      },
    ],
  };

  await fs.mkdir(path.dirname(ROSTER_PATH), { recursive: true });
  await fs.writeFile(ROSTER_PATH, `${JSON.stringify(template, null, 2)}\n`, "utf8");
}

async function loadRankingRoster() {
  try {
    const raw = await readHttpsText(ROSTER_URL);
    return {
      members: extractRosterMembers(raw),
      source: "GitHub raw roster",
    };
  } catch (remoteErr) {
    let raw;

    try {
      raw = await fs.readFile(ROSTER_PATH, "utf8");
    } catch (localErr) {
      if (localErr.code === "ENOENT") {
        await createRosterTemplate();
        throw new Error(
          `Remote roster failed (${remoteErr.message}) and local roster was missing. Template created at ${ROSTER_PATH}.`,
        );
      }

      throw localErr;
    }

    return {
      members: extractRosterMembers(raw),
      source: "local roster fallback",
    };
  }
}

async function reloadRankingRoster(updatedBy) {
  const roster = await loadRankingRoster();
  let loaded = 0;
  let skipped = 0;

  for (const entry of roster.members) {
    const displayName = normalizePlayerName(entry.renderName || entry.name || entry.displayName || entry.member);
    const sourceName = normalizePlayerName(entry.name || entry.displayName || entry.member || entry.renderName);

    if (!displayName && !sourceName) {
      skipped += 1;
      continue;
    }

    const finalName = displayName || sourceName;

    await upsertMemberRanking({
      userId: playerKeyFromName(sourceName || finalName),
      tag: finalName,
      displayName: finalName,
      weekly: toSafeScore(entry.weekly),
      season: toSafeScore(entry.season),
      dailyXp: toSafeScore(entry.dailyXp ?? entry.daily_xp),
      updatedBy,
    });

    loaded += 1;
  }

  return { loaded, skipped, source: roster.source };
}

function buildListMessage(rankings) {
  if (!rankings.length) return "No ranking data loaded. Use `/ranking reload` first.";

  return rankings
    .slice(0, 20)
    .map((entry, index) => `**#${index + 1}** — ${displayNameFromEntry(entry)} : **${formatNumber(entry.season)}**`)
    .join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Manage and publish the XPRO Bullet Echo ranking.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reload")
        .setDescription("Reload ranking scores from memberRankingRoster.json."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("board")
        .setDescription("Publish the premium XPRO leaderboard image."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Show the current ranking list privately."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set or update a player ranking score manually.")
        .addStringOption((option) =>
          option
            .setName("member")
            .setDescription("Player display name, even if they are not on Discord.")
            .setMinLength(1)
            .setMaxLength(60)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("season")
            .setDescription("Season contribution score.")
            .setMinValue(0)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("weekly")
            .setDescription("Weekly contribution score.")
            .setMinValue(0)
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("daily_xp")
            .setDescription("Daily XP contribution score.")
            .setMinValue(0)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a player from rankings.")
        .addStringOption((option) =>
          option
            .setName("member")
            .setDescription("Player display name to remove.")
            .setMinLength(1)
            .setMaxLength(60)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset all ranking data.")
        .addStringOption((option) =>
          option
            .setName("confirm")
            .setDescription('Type "RESET RANKINGS" to confirm.')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      return interaction.reply({
        content: buildListMessage(getAllRankings()),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }

    if (subcommand === "board") {
      await interaction.deferReply();

      try {
        const pngBuffer = await buildLeaderboardScreenshotBuffer({ rosterUrl: ROSTER_URL });
        const attachment = new AttachmentBuilder(pngBuffer, {
          name: "xpro-member-leaderboard.png",
        });

        return interaction.editReply({
          content: "🏆 **XPRO MEMBER — Ranking of the best contributors**",
          files: [attachment],
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        console.error("[ranking board] Failed to generate leaderboard image:", error);
        return interaction.editReply({
          content: `❌ Ranking board generation failed: ${error.message}`,
          allowedMentions: { parse: [] },
        });
      }
    }

    if (!canManageRankings(interaction)) {
      return interaction.reply({
        content: "❌ You do not have permission to manage member rankings.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === "reload") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const result = await reloadRankingRoster(interaction.user.id);
        return interaction.editReply(
          `✅ Ranking roster reloaded from JSON.\nSource: **${result.source}**\nLoaded: **${result.loaded}**\nSkipped: **${result.skipped}**`,
        );
      } catch (error) {
        console.error("[ranking reload] Failed to reload roster:", error);
        return interaction.editReply(`❌ Could not reload ranking roster: ${error.message}`);
      }
    }

    if (subcommand === "set") {
      const displayName = normalizePlayerName(interaction.options.getString("member"));
      const season = interaction.options.getInteger("season") || 0;
      const weekly = interaction.options.getInteger("weekly") || 0;
      const dailyXp = interaction.options.getInteger("daily_xp") || 0;

      await upsertMemberRanking({
        userId: playerKeyFromName(displayName),
        tag: displayName,
        displayName,
        weekly,
        season,
        dailyXp,
        updatedBy: interaction.user.id,
      });

      return interaction.reply({
        content: `✅ Ranking updated for **${displayName}**.\nSeason score: **${formatNumber(season)}**`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }

    if (subcommand === "remove") {
      const displayName = normalizePlayerName(interaction.options.getString("member"));
      const removed = await removeMemberRanking(playerKeyFromName(displayName));

      return interaction.reply({
        content: removed
          ? `✅ **${displayName}** removed from rankings.`
          : `ℹ️ **${displayName}** was not present in rankings.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }

    if (subcommand === "reset") {
      const confirm = interaction.options.getString("confirm");
      if (confirm !== "RESET RANKINGS") {
        return interaction.reply({
          content: '❌ Reset cancelled. Type exactly `RESET RANKINGS`.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await resetRankings();

      return interaction.reply({
        content: "✅ All member rankings have been reset.",
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: "❌ Unknown ranking subcommand.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
