const test = require("node:test");
const assert = require("node:assert/strict");
const blackjackEngine = require("../utils/blackjackEngine");
const { BlackjackStore } = require("../db/blackjackStore");
const { BlackjackService } = require("../services/blackjackService");

function card(rank, suit = "S") {
  return { rank, suit };
}

function createServiceWithDeck(deck, now = 1000) {
  const store = new BlackjackStore(":memory:");
  const service = new BlackjackService({
    store,
    now: () => now,
    createRound: () => blackjackEngine.createRound({ deck }),
  });

  return { service, store };
}

function user(id = "user") {
  return {
    id,
    username: id,
    tag: `${id}#0001`,
  };
}

test("BlackjackService: validates bet step and range", () => {
  const { service, store } = createServiceWithDeck([
    card("10"), card("9"), card("8"), card("7"),
  ]);

  const result = service.startGame({
    guildId: "guild",
    channelId: "channel",
    user: user(),
    member: null,
    bet: 11,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "BET_STEP");

  store.close();
});

test("BlackjackService: allows only one active session per user", () => {
  const { service, store } = createServiceWithDeck([
    card("10"), card("9"), card("8"), card("7"), card("2"),
  ]);

  const first = service.startGame({
    guildId: "guild",
    channelId: "channel",
    user: user(),
    member: null,
    bet: 100,
  });
  const second = service.startGame({
    guildId: "guild",
    channelId: "channel",
    user: user(),
    member: null,
    bet: 100,
  });

  assert.equal(first.ok, true);
  assert.equal(first.session.status, "active");
  assert.equal(second.ok, false);
  assert.equal(second.code, "ACTIVE_SESSION");

  store.close();
});

test("BlackjackService: rejects insufficient balance", () => {
  const { service, store } = createServiceWithDeck([
    card("10"), card("9"), card("8"), card("7"),
  ]);

  store.reserveWager("guild", "user", 900, 1000);
  const result = service.startGame({
    guildId: "guild",
    channelId: "channel",
    user: user(),
    member: null,
    bet: 500,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "INSUFFICIENT_BALANCE");

  store.close();
});

test("BlackjackService: double is first-turn only and surrender locks after hit", () => {
  const { service, store } = createServiceWithDeck([
    card("10"), card("9"), card("8"), card("7"), card("2"),
  ]);

  const start = service.startGame({
    guildId: "guild",
    channelId: "channel",
    user: user(),
    member: null,
    bet: 100,
  });

  const hit = service.performAction(start.session.id, "user", "hit");
  assert.equal(hit.ok, true);
  assert.equal(hit.completed, false);

  const doubleResult = service.performAction(start.session.id, "user", "double");
  const surrenderResult = service.performAction(start.session.id, "user", "surrender");

  assert.equal(doubleResult.ok, false);
  assert.equal(doubleResult.code, "DOUBLE_NOT_ALLOWED");
  assert.equal(surrenderResult.ok, false);
  assert.equal(surrenderResult.code, "SURRENDER_NOT_ALLOWED");

  store.close();
});

test("BlackjackService: double debits another wager, draws one card, and stands", () => {
  const { service, store } = createServiceWithDeck([
    card("10"), card("6"), card("9"), card("9"), card("2"), card("5"),
  ]);

  const start = service.startGame({
    guildId: "guild",
    channelId: "channel",
    user: user(),
    member: null,
    bet: 100,
  });
  const result = service.performAction(start.session.id, "user", "double");

  assert.equal(result.ok, true);
  assert.equal(result.completed, true);
  assert.equal(result.session.wager, 200);
  assert.equal(result.session.result.result, "win");
  assert.equal(result.session.balance, 1200);

  store.close();
});

test("BlackjackService: surrender returns half the wager and records a loss", () => {
  const { service, store } = createServiceWithDeck([
    card("10"), card("9"), card("8"), card("7"),
  ]);

  const start = service.startGame({
    guildId: "guild",
    channelId: "channel",
    user: user(),
    member: null,
    bet: 100,
  });
  const result = service.performAction(start.session.id, "user", "surrender");
  const profile = service.getProfile("guild", "user");

  assert.equal(result.ok, true);
  assert.equal(result.completed, true);
  assert.equal(result.session.balance, 950);
  assert.equal(profile.user.losses, 1);
  assert.equal(profile.user.played, 1);

  store.close();
});
