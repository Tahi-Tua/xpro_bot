const { EmbedBuilder } = require("discord.js");

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function medalForRank(index) {
  return ["🥇", "🥈", "🥉", "🏅", "🏅"][index] || "🏅";
}

function barForScore(score, maxScore) {
  const total = 12;
  if (!maxScore || maxScore <= 0) return "░".repeat(total);
  const filled = Math.max(1, Math.round((Number(score || 0) / maxScore) * total));
  return "█".repeat(Math.min(total, filled)) + "░".repeat(Math.max(0, total - filled));
}

function displayName(entry) {
  return entry.tag || entry.username || entry.userId;
}

function buildMemberRankingEmbed(rankings, options = {}) {
  const top = Array.isArray(rankings) ? rankings.slice(0, 5) : [];
  const updatedBy = options.updatedBy || null;
  const maxSeason = Math.max(...top.map((entry) => Number(entry.season || 0)), 0);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🏆 BULLET ECHO — TOP 5 SAISON")
    .setDescription(
      top.length
        ? "Classement officiel des meilleurs contributeurs de la saison."
        : "Aucun classement enregistré pour le moment.",
    )
    .setFooter({ text: "XPRO Ranking System • Classement saison" })
    .setTimestamp();

  if (!top.length) {
    embed.addFields({
      name: "📭 Aucune donnée",
      value: "Utilise `/ranking set` pour ajouter les premiers scores saison.",
      inline: false,
    });
    return embed;
  }

  const podium = top.slice(0, 3).map((entry, index) => {
    return `${medalForRank(index)} **#${index + 1} — ${displayName(entry)}**\n⭐ Saison : **${formatNumber(entry.season)}**`;
  }).join("\n\n");

  embed.addFields({
    name: "👑 Podium",
    value: podium,
    inline: false,
  });

  const board = top.map((entry, index) => {
    const rank = `#${index + 1}`.padEnd(3, " ");
    const name = displayName(entry).slice(0, 22);
    const bar = barForScore(entry.season, maxSeason);
    return `${medalForRank(index)} **${rank} ${name}**\n\` ${bar} \`  **${formatNumber(entry.season)}** saison`;
  }).join("\n\n");

  embed.addFields({
    name: "📊 Tableau saison",
    value: board.slice(0, 4096),
    inline: false,
  });

  const totalSeason = top.reduce((sum, entry) => sum + Number(entry.season || 0), 0);
  embed.addFields(
    {
      name: "🏆 Leader actuel",
      value: `**${displayName(top[0])}**\n${formatNumber(top[0].season)} points saison`,
      inline: true,
    },
    {
      name: "📈 Total Top 5",
      value: `${formatNumber(totalSeason)} points saison`,
      inline: true,
    },
  );

  if (updatedBy) {
    embed.addFields({
      name: "🛠️ Mise à jour",
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
