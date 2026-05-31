const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DEFAULT_INITIAL_BALANCE = 1000;
const DEFAULT_DB_PATH = process.env.BLACKJACK_DB_PATH || path.join(__dirname, "../data/blackjack.sqlite");

class BlackjackStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BlackjackStoreError";
    this.code = code;
  }
}

class BlackjackStore {
  constructor(dbPath = DEFAULT_DB_PATH, options = {}) {
    this.dbPath = dbPath;
    this.initialBalance = options.initialBalance ?? DEFAULT_INITIAL_BALANCE;

    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
    this.prepareStatements();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blackjack_users (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        balance INTEGER NOT NULL DEFAULT 1000,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        pushes INTEGER NOT NULL DEFAULT 0,
        played INTEGER NOT NULL DEFAULT 0,
        total_wagered INTEGER NOT NULL DEFAULT 0,
        total_won INTEGER NOT NULL DEFAULT 0,
        last_daily_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_blackjack_users_leaderboard
        ON blackjack_users (guild_id, balance DESC, wins DESC);
    `);
  }

  prepareStatements() {
    this.insertUserStmt = this.db.prepare(`
      INSERT OR IGNORE INTO blackjack_users (
        guild_id,
        user_id,
        balance,
        wins,
        losses,
        pushes,
        played,
        total_wagered,
        total_won,
        last_daily_at,
        created_at,
        updated_at
      ) VALUES (
        @guildId,
        @userId,
        @balance,
        0,
        0,
        0,
        0,
        0,
        0,
        NULL,
        @now,
        @now
      )
    `);

    this.getUserStmt = this.db.prepare(`
      SELECT * FROM blackjack_users
      WHERE guild_id = @guildId AND user_id = @userId
    `);

    this.reserveWagerStmt = this.db.prepare(`
      UPDATE blackjack_users
      SET balance = balance - @amount,
          updated_at = @now
      WHERE guild_id = @guildId
        AND user_id = @userId
        AND balance >= @amount
    `);

    this.creditBalanceStmt = this.db.prepare(`
      UPDATE blackjack_users
      SET balance = balance + @amount,
          updated_at = @now
      WHERE guild_id = @guildId AND user_id = @userId
    `);

    this.settleGameStmt = this.db.prepare(`
      UPDATE blackjack_users
      SET balance = balance + @credit,
          wins = wins + @wins,
          losses = losses + @losses,
          pushes = pushes + @pushes,
          played = played + 1,
          total_wagered = total_wagered + @wager,
          total_won = total_won + @profit,
          updated_at = @now
      WHERE guild_id = @guildId AND user_id = @userId
    `);

    this.claimDailyStmt = this.db.prepare(`
      UPDATE blackjack_users
      SET balance = balance + @amount,
          last_daily_at = @now,
          updated_at = @now
      WHERE guild_id = @guildId AND user_id = @userId
    `);

    this.leaderboardStmt = this.db.prepare(`
      SELECT * FROM blackjack_users
      WHERE guild_id = @guildId
      ORDER BY balance DESC, wins DESC, played ASC, user_id ASC
      LIMIT @limit
    `);
  }

  getOrCreateUser(guildId, userId, now = Date.now()) {
    this.insertUserStmt.run({
      guildId,
      userId,
      balance: this.initialBalance,
      now,
    });
    return this.getUser(guildId, userId);
  }

  getUser(guildId, userId) {
    const row = this.getUserStmt.get({ guildId, userId });
    return row ? rowToUser(row) : null;
  }

  reserveWager(guildId, userId, amount, now = Date.now()) {
    const reserve = this.db.transaction(() => {
      this.getOrCreateUser(guildId, userId, now);
      const info = this.reserveWagerStmt.run({ guildId, userId, amount, now });
      if (info.changes !== 1) {
        throw new BlackjackStoreError("INSUFFICIENT_BALANCE", "Insufficient balance for this wager.");
      }
      return this.getUser(guildId, userId);
    });

    return reserve();
  }

  creditBalance(guildId, userId, amount, now = Date.now()) {
    const credit = this.db.transaction(() => {
      this.getOrCreateUser(guildId, userId, now);
      this.creditBalanceStmt.run({ guildId, userId, amount, now });
      return this.getUser(guildId, userId);
    });

    return credit();
  }

  settleGame(guildId, userId, settlement, now = Date.now()) {
    const settle = this.db.transaction(() => {
      this.getOrCreateUser(guildId, userId, now);

      const result = settlement.result;
      this.settleGameStmt.run({
        guildId,
        userId,
        credit: settlement.credit,
        wager: settlement.wager,
        profit: settlement.profit,
        wins: result === "win" || result === "blackjack" ? 1 : 0,
        losses: result === "loss" || result === "surrender" ? 1 : 0,
        pushes: result === "push" ? 1 : 0,
        now,
      });

      return this.getUser(guildId, userId);
    });

    return settle();
  }

  claimDaily(guildId, userId, { amount, cooldownMs, now = Date.now() }) {
    const claim = this.db.transaction(() => {
      const user = this.getOrCreateUser(guildId, userId, now);
      const lastDailyAt = user.lastDailyAt || 0;

      if (lastDailyAt && now - lastDailyAt < cooldownMs) {
        return {
          claimed: false,
          user,
          nextDailyAt: lastDailyAt + cooldownMs,
        };
      }

      this.claimDailyStmt.run({ guildId, userId, amount, now });
      return {
        claimed: true,
        user: this.getUser(guildId, userId),
        nextDailyAt: now + cooldownMs,
      };
    });

    return claim();
  }

  getLeaderboard(guildId, limit = 10) {
    return this.leaderboardStmt
      .all({ guildId, limit })
      .map(rowToUser);
  }

  close() {
    this.db.close();
  }
}

function rowToUser(row) {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    balance: row.balance,
    wins: row.wins,
    losses: row.losses,
    pushes: row.pushes,
    played: row.played,
    totalWagered: row.total_wagered,
    totalWon: row.total_won,
    lastDailyAt: row.last_daily_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  BlackjackStore,
  BlackjackStoreError,
  DEFAULT_DB_PATH,
  DEFAULT_INITIAL_BALANCE,
};
