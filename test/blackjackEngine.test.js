const test = require("node:test");
const assert = require("node:assert/strict");
const blackjackEngine = require("../utils/blackjackEngine");

function card(rank, suit = "S") {
  return { rank, suit };
}

test("handValue: counts aces dynamically as 1 or 11", () => {
  assert.equal(blackjackEngine.handValue([card("A"), card("9")]).total, 20);
  assert.equal(blackjackEngine.handValue([card("A"), card("9"), card("A")]).total, 21);
  assert.equal(blackjackEngine.handValue([card("A"), card("9"), card("8")]).total, 18);
});

test("cardValue: face cards are worth 10", () => {
  assert.equal(blackjackEngine.cardValue(card("J")), 10);
  assert.equal(blackjackEngine.cardValue(card("Q")), 10);
  assert.equal(blackjackEngine.cardValue(card("K")), 10);
});

test("resolveInitialBlackjack: recognizes natural blackjack", () => {
  const round = {
    deck: [],
    playerHand: [card("A"), card("K")],
    dealerHand: [card("9"), card("8")],
    playerActions: 0,
  };

  assert.equal(blackjackEngine.resolveInitialBlackjack(round).type, "blackjack");
});

test("playDealer: dealer stands on soft 17", () => {
  const round = {
    deck: [card("5")],
    playerHand: [card("10"), card("7")],
    dealerHand: [card("A"), card("6")],
    playerActions: 0,
  };

  blackjackEngine.playDealer(round);
  assert.equal(round.dealerHand.length, 2);
  assert.equal(blackjackEngine.handValue(round.dealerHand).total, 17);
});

test("stand: dealer draws to at least 17 and resolves win", () => {
  const round = {
    deck: [card("2")],
    playerHand: [card("10"), card("9")],
    dealerHand: [card("10"), card("6")],
    playerActions: 0,
  };

  const outcome = blackjackEngine.stand(round);
  assert.equal(outcome.type, "win");
  assert.equal(outcome.playerValue, 19);
  assert.equal(outcome.dealerValue, 18);
});

test("resolveRound: detects player bust and push", () => {
  assert.equal(
    blackjackEngine.resolveRound({
      deck: [],
      playerHand: [card("10"), card("9"), card("5")],
      dealerHand: [card("10"), card("7")],
      playerActions: 1,
    }).type,
    "loss",
  );

  assert.equal(
    blackjackEngine.resolveRound({
      deck: [],
      playerHand: [card("10"), card("8")],
      dealerHand: [card("Q"), card("8")],
      playerActions: 0,
    }).type,
    "push",
  );
});
