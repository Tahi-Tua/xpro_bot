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
    "RANG  MEMBRE               SAISON",
    "────  ──────────────────   ──────────",
    ...rows,
  ].join("\n");
}

function buildMemberRankingEmbed(rankings, options = {}) {
  const top = Array.isArray(rankings) ? rankings.slice(0, 5) : [];
  const updatedBy = options.updatedBy || null;

  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle("🏆 CLASSEMENT SAISON — BULLET ECHO")
    .setDescription(
      top.length
        ? "**Top 5 officiel des meilleurs contributeurs du syndicat.**"
        : "Aucun classement enregistré pour le moment.",
    )
    .setFooter({ text: "XPRO Ranking System • Classement saison" })
    .setTimestamp();

  if (!top.length) {
    embed.addFields({
      name: "Aucune donnée",
      value: "Utilise `/ranking set` pour ajouter les premiers scores saison.",
      inline: false,
    });
    return embed;
  }

  const champion = top[0];
  const totalSeason = top.reduce((sum, entry) => sum + Number(entry.season || 0), 0);

  embed.addFields(
    {
      name: "👑 CHAMPION ACTUEL",
      value: `**${displayName(champion)}**\n⭐ **${formatNumber(champion.season)}** points saison`,
      inline: false,
    },
    {
      name: "📋 TABLEAU OFFICIEL",
      value: `\`\`\`text\n${buildRankingTable(top)}\n\`\`\``,
      inline: false,
    },
    {
      name: "📊 TOTAL TOP 5",
      value: `**${formatNumber(totalSeason)}** points saison`,
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
      name: "Mise à jour",
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
