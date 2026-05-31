const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffleDeck(deck = createDeck(), rng = Math.random) {
  const shuffled = deck.map((card) => ({ ...card }));

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function cardValue(card) {
  if (!card || !card.rank) return 0;
  if (card.rank === "A") return 11;
  if (["K", "Q", "J"].includes(card.rank)) return 10;
  return Number.parseInt(card.rank, 10);
}

function handValue(hand) {
  let total = 0;
  let flexibleAces = 0;

  for (const card of hand || []) {
    total += cardValue(card);
    if (card.rank === "A") flexibleAces += 1;
  }

  while (total > 21 && flexibleAces > 0) {
    total -= 10;
    flexibleAces -= 1;
  }

  return {
    total,
    softAces: flexibleAces,
    isSoft: flexibleAces > 0,
    isBust: total > 21,
    isBlackjack: isNaturalBlackjack(hand),
  };
}

function isNaturalBlackjack(hand) {
  return Array.isArray(hand) && hand.length === 2 && handValueWithoutBlackjackFlag(hand).total === 21;
}

function handValueWithoutBlackjackFlag(hand) {
  let total = 0;
  let flexibleAces = 0;

  for (const card of hand || []) {
    total += cardValue(card);
    if (card.rank === "A") flexibleAces += 1;
  }

  while (total > 21 && flexibleAces > 0) {
    total -= 10;
    flexibleAces -= 1;
  }

  return {
    total,
    softAces: flexibleAces,
    isSoft: flexibleAces > 0,
    isBust: total > 21,
  };
}

function drawCard(deck) {
  if (!Array.isArray(deck) || deck.length === 0) {
    throw new Error("Cannot draw from an empty Blackjack deck.");
  }
  return deck.shift();
}

function createRound({ deck = null, rng = Math.random } = {}) {
  const roundDeck = deck ? deck.map((card) => ({ ...card })) : shuffleDeck(createDeck(), rng);
  const playerHand = [];
  const dealerHand = [];

  playerHand.push(drawCard(roundDeck));
  dealerHand.push(drawCard(roundDeck));
  playerHand.push(drawCard(roundDeck));
  dealerHand.push(drawCard(roundDeck));

  return {
    deck: roundDeck,
    playerHand,
    dealerHand,
    playerActions: 0,
  };
}

function hitPlayer(round) {
  const card = drawCard(round.deck);
  round.playerHand.push(card);
  round.playerActions += 1;
  return card;
}

function playDealer(round) {
  while (handValue(round.dealerHand).total < 17) {
    round.dealerHand.push(drawCard(round.deck));
  }
  return round.dealerHand;
}

function resolveInitialBlackjack(round) {
  const playerBlackjack = isNaturalBlackjack(round.playerHand);
  const dealerBlackjack = isNaturalBlackjack(round.dealerHand);

  if (playerBlackjack && dealerBlackjack) {
    return buildOutcome("push", "both_blackjack", round);
  }
  if (playerBlackjack) {
    return buildOutcome("blackjack", "player_blackjack", round);
  }
  if (dealerBlackjack) {
    return buildOutcome("loss", "dealer_blackjack", round);
  }
  return null;
}

function resolveRound(round) {
  const player = handValue(round.playerHand);
  const dealer = handValue(round.dealerHand);

  if (player.isBust) return buildOutcome("loss", "player_bust", round);
  if (dealer.isBust) return buildOutcome("win", "dealer_bust", round);
  if (player.total > dealer.total) return buildOutcome("win", "player_higher", round);
  if (player.total < dealer.total) return buildOutcome("loss", "dealer_higher", round);
  return buildOutcome("push", "same_total", round);
}

function stand(round) {
  playDealer(round);
  return resolveRound(round);
}

function surrender(round) {
  return buildOutcome("surrender", "player_surrender", round);
}

function buildOutcome(type, reason, round) {
  return {
    type,
    reason,
    playerValue: handValue(round.playerHand).total,
    dealerValue: handValue(round.dealerHand).total,
  };
}

module.exports = {
  SUITS,
  RANKS,
  createDeck,
  shuffleDeck,
  cardValue,
  handValue,
  isNaturalBlackjack,
  drawCard,
  createRound,
  hitPlayer,
  playDealer,
  resolveInitialBlackjack,
  resolveRound,
  stand,
  surrender,
};
