const test = require("node:test");
const assert = require("node:assert/strict");
const { BlackjackStore, BlackjackStoreError } = require("../db/blackjackStore");

test("BlackjackStore: creates users with default balance", () => {
  const store = new BlackjackStore(":memory:");
  const user = store.getOrCreateUser("guild", "user", 1000);

  assert.equal(user.balance, 1000);
  assert.equal(user.played, 0);

  store.close();
});

test("BlackjackStore: reserves wagers atomically and rejects insufficient balance", () => {
  const store = new BlackjackStore(":memory:");

  const afterReserve = store.reserveWager("guild", "user", 100, 1000);
  assert.equal(afterReserve.balance, 900);

  assert.throws(
    () => store.reserveWager("guild", "user", 1000, 1000),
    (err) => err instanceof BlackjackStoreError && err.code === "INSUFFICIENT_BALANCE",
  );

  store.close();
});

test("BlackjackStore: settles wins with balance and stats updates", () => {
  const store = new BlackjackStore(":memory:");

  store.reserveWager("guild", "user", 100, 1000);
  const user = store.settleGame("guild", "user", {
    result: "win",
    wager: 100,
    credit: 200,
    profit: 100,
  }, 1000);

  assert.equal(user.balance, 1100);
  assert.equal(user.played, 1);
  assert.equal(user.wins, 1);
  assert.equal(user.totalWagered, 100);
  assert.equal(user.totalWon, 100);

  store.close();
});

test("BlackjackStore: enforces daily cooldown", () => {
  const store = new BlackjackStore(":memory:");

  const first = store.claimDaily("guild", "user", {
    amount: 250,
    cooldownMs: 24 * 60 * 60 * 1000,
    now: 1000,
  });
  assert.equal(first.claimed, true);
  assert.equal(first.user.balance, 1250);

  const second = store.claimDaily("guild", "user", {
    amount: 250,
    cooldownMs: 24 * 60 * 60 * 1000,
    now: 2000,
  });
  assert.equal(second.claimed, false);
  assert.equal(second.user.balance, 1250);

  store.close();
});
