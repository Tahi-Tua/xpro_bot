const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const blackjackEngine = require("../utils/blackjackEngine");
const { BLACKJACK_CONFIG } = require("../services/blackjackService");

const COLORS = {
  active: "#0B6B3A",
  win: "#D4AF37",
  loss: "#8B1E24",
  push: "#6C757D",
  timeout: "#7A5C00",
  info: "#111827",
};

const SUIT_SYMBOLS = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

function buildGameEmbed(session) {
  const completed = session.status === "completed";
  const hideDealerHole = !completed;

  return new EmbedBuilder()
    .setTitle("Blackjack 21")
    .setColor(getGameColor(session))
    .setAuthor({ name: session.displayName })
    .addFields(
      {
        name: "Player / Joueur",
        value: `${formatHand(session.round.playerHand)}\nTotal: **${blackjackEngine.handValue(session.round.playerHand).total}**`,
        inline: false,
      },
      {
        name: "Dealer / Croupier",
        value: `${formatHand(session.round.dealerHand, { hideHole: hideDealerHole })}\nTotal: **${hideDealerHole ? "?" : blackjackEngine.handValue(session.round.dealerHand).total}**`,
        inline: false,
      },
      {
        name: "Bet / Mise",
        value: formatChips(session.wager),
        inline: true,
      },
      {
        name: "Balance",
        value: formatChips(session.balance),
        inline: true,
      },
      {
        name: "Status",
        value: getStatusText(session),
        inline: false,
      },
    )
    .setFooter({
      text: completed
        ? "Game finished • Buttons disabled"
        : "60s inactivity timeout • Only the player can use these buttons",
    })
    .setTimestamp(new Date(session.updatedAt || Date.now()));
}

function buildGameButtons(session) {
  const disabled = session.status !== "active";
  const firstTurn = session.round.playerActions === 0;
  const canDouble = !disabled && firstTurn && session.balance >= session.wager;
  const canSurrender = !disabled && firstTurn;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj:hit:${session.id}`)
      .setLabel("Tirer / Hit")
      .setEmoji("🃏")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`bj:stand:${session.id}`)
      .setLabel("Rester / Stand")
      .setEmoji("✋")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`bj:double:${session.id}`)
      .setLabel("Doubler / Double")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canDouble),
    new ButtonBuilder()
      .setCustomId(`bj:surrender:${session.id}`)
      .setLabel("Abandon / Surrender")
      .setEmoji("🏳️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canSurrender),
  );
}

function buildBalanceEmbed({ targetUser, profile }) {
  const dailyText = profile.daily.available
    ? "Disponible / Available"
    : `Prochain daily / Next: ${discordTimestamp(profile.daily.nextDailyAt, "R")}`;

  return new EmbedBuilder()
    .setTitle("Blackjack Balance")
    .setColor(COLORS.info)
    .setDescription(`${targetUser}`)
    .addFields(
      { name: "Balance", value: formatChips(profile.user.balance), inline: true },
      { name: "Daily", value: dailyText, inline: true },
    )
    .setTimestamp();
}

function buildStatsEmbed({ targetUser, profile }) {
  const user = profile.user;
  const winRate = user.played ? `${Math.round((user.wins / user.played) * 100)}%` : "0%";

  return new EmbedBuilder()
    .setTitle("Blackjack Stats")
    .setColor(COLORS.info)
    .setDescription(`${targetUser}`)
    .addFields(
      { name: "Played", value: String(user.played), inline: true },
      { name: "Wins", value: String(user.wins), inline: true },
      { name: "Losses", value: String(user.losses), inline: true },
      { name: "Pushes", value: String(user.pushes), inline: true },
      { name: "Win rate", value: winRate, inline: true },
      { name: "Balance", value: formatChips(user.balance), inline: true },
      { name: "Total wagered", value: formatChips(user.totalWagered), inline: true },
      { name: "Total won", value: formatChips(user.totalWon), inline: true },
    )
    .setTimestamp();
}

function buildLeaderboardEmbed(rows) {
  const description = rows.length
    ? rows
        .map((user, index) => {
          const medal = index === 0 ? "1." : `${index + 1}.`;
          return `${medal} <@${user.userId}> - ${formatChips(user.balance)} - ${user.wins} wins`;
        })
        .join("\n")
    : "Aucun joueur pour le moment / No players yet.";

  return new EmbedBuilder()
    .setTitle("Blackjack Leaderboard")
    .setColor(COLORS.win)
    .setDescription(description)
    .setFooter({ text: "Sorted by balance, then wins" })
    .setTimestamp();
}

function buildDailyEmbed(result) {
  const title = result.claimed ? "Daily claimed" : "Daily cooldown";
  const description = result.claimed
    ? `Daily recu / Claimed: **${formatChips(BLACKJACK_CONFIG.dailyAmount)}**\nBalance: **${formatChips(result.user.balance)}**`
    : `Daily deja recu / Already claimed.\nNext: ${discordTimestamp(result.nextDailyAt, "R")}`;

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(result.claimed ? COLORS.win : COLORS.timeout)
    .setDescription(description)
    .setTimestamp();
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle("Blackjack 21 Help")
    .setColor(COLORS.active)
    .setDescription([
      "`/blackjack play bet:<amount>` - lancer une partie / start a game",
      "`/blackjack balance [user]` - voir le solde / view balance",
      "`/blackjack stats [user]` - statistiques / stats",
      "`/blackjack leaderboard` - top joueurs / top players",
      "`/blackjack daily` - bonus quotidien / daily bonus",
      "",
      `Mise / Bet: ${BLACKJACK_CONFIG.minBet}-${BLACKJACK_CONFIG.maxBet}, multiple de ${BLACKJACK_CONFIG.betStep}.`,
      "Blackjack naturel / Natural blackjack pays 3:2.",
      "Dealer stands on soft 17.",
      "Double and surrender are first-turn only.",
    ].join("\n"))
    .setFooter({ text: "Casino premium • Good luck" })
    .setTimestamp();
}

function formatCard(card) {
  if (!card) return "??";
  return `${card.rank}${SUIT_SYMBOLS[card.suit] || card.suit}`;
}

function formatHand(hand, options = {}) {
  if (!Array.isArray(hand) || hand.length === 0) return "No cards";
  if (options.hideHole && hand.length > 1) {
    return `${formatCard(hand[0])} ??`;
  }
  return hand.map(formatCard).join(" ");
}

function formatChips(amount) {
  return `${Number(amount || 0).toLocaleString("en-US")} chips`;
}

function getGameColor(session) {
  if (session.timedOut) return COLORS.timeout;
  if (session.status !== "completed") return COLORS.active;
  if (!session.result) return COLORS.active;
  if (session.result.result === "win" || session.result.result === "blackjack") return COLORS.win;
  if (session.result.result === "push") return COLORS.push;
  return COLORS.loss;
}

function getStatusText(session) {
  if (session.status !== "completed") {
    const canDouble = session.round.playerActions === 0 && session.balance >= session.wager;
    return [
      "A toi de jouer / Your turn.",
      canDouble
        ? "Double disponible / Double available."
        : "Double indisponible / Double unavailable.",
    ].join("\n");
  }

  const result = session.result;
  const label = resultLabel(result.result);
  const timeoutPrefix = result.timedOut ? "Timeout - auto stand.\n" : "";
  const profitText = result.profit > 0
    ? `Gain / Profit: +${formatChips(result.profit)}`
    : result.result === "loss"
      ? `Perte / Lost: -${formatChips(result.wager)}`
      : result.result === "surrender"
        ? `Retour / Returned: ${formatChips(result.credit)}`
        : "Mise remboursee / Bet returned.";

  return `${timeoutPrefix}**${label}**\n${reasonLabel(result.reason)}\n${profitText}`;
}

function resultLabel(result) {
  const labels = {
    blackjack: "Blackjack naturel / Natural blackjack",
    win: "Victoire / Win",
    loss: "Defaite / Loss",
    push: "Egalite / Push",
    surrender: "Abandon / Surrender",
  };
  return labels[result] || "Resultat / Result";
}

function reasonLabel(reason) {
  const labels = {
    player_blackjack: "21 en deux cartes.",
    both_blackjack: "Deux blackjacks naturels.",
    dealer_blackjack: "Le dealer a un blackjack naturel.",
    player_bust: "Le joueur depasse 21.",
    dealer_bust: "Le dealer depasse 21.",
    player_higher: "Le joueur a le meilleur total.",
    dealer_higher: "Le dealer a le meilleur total.",
    same_total: "Meme total.",
    player_surrender: "Abandon avant action.",
  };
  return labels[reason] || "Round complete.";
}

function discordTimestamp(ms, style = "R") {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

module.exports = {
  COLORS,
  buildGameEmbed,
  buildGameButtons,
  buildBalanceEmbed,
  buildStatsEmbed,
  buildLeaderboardEmbed,
  buildDailyEmbed,
  buildHelpEmbed,
  formatCard,
  formatHand,
  formatChips,
  discordTimestamp,
};
