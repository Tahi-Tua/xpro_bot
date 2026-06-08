const { EmbedBuilder } = require("discord.js");

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function medalForRank(index) {
  return ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][index] || `${index + 1}.`;
}

function buildMemberRankingEmbed(rankings, options = {}) {
  const top = Array.isArray(rankings) ? rankings.slice(0, 5) : [];
  const updatedBy = options.updatedBy || null;

  const embed = new EmbedBuilder()
    .setColor(0x00c853)
    .setTitle("🏆 Bullet Echo — Top 5 Member Rankings")
    .setDescription(
      top.length
        ? "Classement des membres les plus actifs et contributeurs du syndicat."
        : "Aucun classement enregistré pour le moment.",
    )
    .setFooter({ text: "XPRO Ranking System • Scores saisis par le staff" })
    .setTimestamp();

  if (!top.length) {
    embed.addFields({
      name: "Aucune donnée",
      value: "Utilise `/ranking set` pour ajouter les premiers scores.",
      inline: false,
    });
    return embed;
  }

  const lines = top.map((entry, index) => {
    const medal = medalForRank(index);
    return [
      `${medal} <@${entry.userId}>`,
      `Score: **${formatNumber(entry.score)}**`,
      `Weekly: ${formatNumber(entry.weekly)} • Season: ${formatNumber(entry.season)} • Daily XP: ${formatNumber(entry.dailyXp)}`,
    ].join("\n");
  });

  embed.addFields({
    name: "Top 5",
    value: lines.join("\n\n").slice(0, 4096),
    inline: false,
  });

  if (updatedBy) {
    embed.addFields({
      name: "Dernière mise à jour par",
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
