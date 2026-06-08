const { EmbedBuilder } = require("discord.js");

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function medalForRank(index) {
  return ["🥇", "🥈", "🥉", "4", "5"][index] || `${index + 1}`;
}

function displayName(entry) {
  return String(entry.tag || entry.username || entry.userId || "Unknown")
    .replace(/\s+/g, " ")
    .trim();
}

function fixedName(name, length = 18) {
  const safeName = displayName({ tag: name });
  if (safeName.length > length) return `${safeName.slice(0, length - 1)}…`;
  return safeName.padEnd(length, " ");
}

function fixedScore(value, length = 10) {
  return formatNumber(value).padStart(length, " ");
}

function buildRankingTable(top) {
  const rows = top.map((entry, index) => {
    const rank = String(index + 1).padStart(2, "0");
    const name = fixedName(displayName(entry));
    const season = fixedScore(entry.season);
    return `${rank}   ${name}   ${season}`;
  });

  return [
    "RANK  MEMBER               SEASON",
    "────  ──────────────────   ──────────",
    ...rows,
  ].join("\n");
}

function buildMemberRankingEmbed(rankings, options = {}) {
  const top = Array.isArray(rankings) ? rankings.slice(0, 5) : [];
  const updatedBy = options.updatedBy || null;

  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("🏆 SEASON RANKING — BULLET ECHO")
    .setDescription(
      top.length
        ? "**Official Top 5 season contributors of the syndicate.**"
        : "No ranking data has been saved yet.",
    )
    .setFooter({ text: "XPRO Ranking System • Season leaderboard" })
    .setTimestamp();

  if (!top.length) {
    embed.addFields({
      name: "No data",
      value: "Use `/ranking set` to add the first season scores.",
      inline: false,
    });
    return embed;
  }

  const champion = top[0];
  const totalSeason = top.reduce((sum, entry) => sum + Number(entry.season || 0), 0);

  embed.addFields(
    {
      name: "👑 CURRENT CHAMPION",
      value: `**${displayName(champion)}**\n⭐ **${formatNumber(champion.season)}** season points`,
      inline: false,
    },
    {
      name: "📋 OFFICIAL LEADERBOARD",
      value: `\`\`\`text\n${buildRankingTable(top)}\n\`\`\``,
      inline: false,
    },
    {
      name: "📊 TOP 5 TOTAL",
      value: `**${formatNumber(totalSeason)}** season points`,
      inline: true,
    },
    {
      name: "🥇 PODIUM",
      value: top
        .slice(0, 3)
        .map((entry, index) => `${medalForRank(index)} **${displayName(entry)}** — ${formatNumber(entry.season)}`)
        .join("\n"),
      inline: true,
    },
  );

  if (updatedBy) {
    embed.addFields({
      name: "Updated by",
      value: updatedBy,
      inline: true,
    });
  }

  return embed;
}

module.exports = {
  buildMemberRankingEmbed,
  formatNumber,
};