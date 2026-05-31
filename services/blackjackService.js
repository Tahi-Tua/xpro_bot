const crypto = require("crypto");
const blackjackEngine = require("../utils/blackjackEngine");
const { BlackjackStore, BlackjackStoreError } = require("../db/blackjackStore");

const BLACKJACK_CONFIG = {
  initialBalance: 1000,
  dailyAmount: 250,
  dailyCooldownMs: 24 * 60 * 60 * 1000,
  minBet: 10,
  maxBet: 500,
  betStep: 10,
  sessionIdleMs: 60 * 1000,
};

class BlackjackService {
  constructor(options = {}) {
    this.store = options.store || new BlackjackStore(undefined, {
      initialBalance: BLACKJACK_CONFIG.initialBalance,
    });
    this.rng = options.rng || Math.random;
    this.now = options.now || (() => Date.now());
    this.createRound = options.createRound || ((args) => blackjackEngine.createRound(args));
    this.activeSessions = new Map();
    this.sessions = new Map();
    this.sessionLocks = new Map();
  }

  startGame({ guildId, channelId, user, member, bet }) {
    const wager = Number(bet);
    const validation = validateBet(wager);
    if (!validation.ok) return validation;

    const userId = user.id;
    const key = sessionKey(guildId, userId);
    const activeSession = this.activeSessions.get(key);
    if (activeSession) {
      return {
        ok: false,
        code: "ACTIVE_SESSION",
        message: activeSession.messageUrl
          ? `Partie deja active / Active game already running: ${activeSession.messageUrl}`
          : "Partie deja active / Active game already running.",
        session: activeSession,
      };
    }

    const currentUser = this.store.getOrCreateUser(guildId, userId, this.now());
    if (currentUser.balance < wager) {
      return {
        ok: false,
        code: "INSUFFICIENT_BALANCE",
        message: `Solde insuffisant / Insufficient balance. Balance: ${currentUser.balance}`,
        user: currentUser,
      };
    }

    let reservedUser;
    try {
      reservedUser = this.store.reserveWager(guildId, userId, wager, this.now());
    } catch (err) {
      if (err instanceof BlackjackStoreError && err.code === "INSUFFICIENT_BALANCE") {
        return {
          ok: false,
          code: "INSUFFICIENT_BALANCE",
          message: "Solde insuffisant / Insufficient balance.",
          user: this.store.getOrCreateUser(guildId, userId, this.now()),
        };
      }
      throw err;
    }

    let round;
    try {
      round = this.createRound({ rng: this.rng });
    } catch (err) {
      this.store.creditBalance(guildId, userId, wager, this.now());
      throw err;
    }

    const session = {
      id: createSessionId(),
      key,
      guildId,
      channelId,
      messageId: null,
      messageUrl: null,
      userId,
      userTag: user.tag || user.username || userId,
      displayName: member?.displayName || user.displayName || user.username || "Player",
      baseBet: wager,
      wager,
      balance: reservedUser.balance,
      round,
      status: "active",
      result: null,
      timedOut: false,
      createdAt: this.now(),
      updatedAt: this.now(),
    };

    const initialOutcome = blackjackEngine.resolveInitialBlackjack(round);
    if (initialOutcome) {
      return {
        ok: true,
        completed: true,
        session: this.finishSession(session, initialOutcome),
      };
    }

    this.activeSessions.set(key, session);
    this.sessions.set(session.id, session);

    return {
      ok: true,
      completed: false,
      session,
    };
  }

  attachMessage(sessionId, { messageId, messageUrl, channelId }) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.messageId = messageId;
    session.messageUrl = messageUrl;
    session.channelId = channelId || session.channelId;
    session.updatedAt = this.now();
    return session;
  }

  cancelStartFailure(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return null;

    const user = this.store.creditBalance(session.guildId, session.userId, session.wager, this.now());
    session.status = "cancelled";
    session.balance = user.balance;
    session.updatedAt = this.now();
    this.activeSessions.delete(session.key);
    this.sessions.delete(session.id);
    return session;
  }

  performAction(sessionId, userId, action) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") {
      return {
        ok: false,
        code: "SESSION_NOT_FOUND",
        message: "Partie terminee ou introuvable / Game ended or not found.",
      };
    }

    if (session.userId !== userId) {
      return {
        ok: false,
        code: "WRONG_USER",
        message: "Cette partie ne t'appartient pas / This is not your game.",
      };
    }

    if (action === "hit") return this.hit(session);
    if (action === "stand") return this.stand(session);
    if (action === "double") return this.doubleDown(session);
    if (action === "surrender") return this.surrender(session);

    return {
      ok: false,
      code: "UNKNOWN_ACTION",
      message: "Action inconnue / Unknown action.",
    };
  }

  hit(session) {
    blackjackEngine.hitPlayer(session.round);
    session.updatedAt = this.now();

    if (blackjackEngine.handValue(session.round.playerHand).isBust) {
      const outcome = blackjackEngine.resolveRound(session.round);
      return {
        ok: true,
        completed: true,
        session: this.finishSession(session, outcome),
      };
    }

    return {
      ok: true,
      completed: false,
      session,
    };
  }

  stand(session) {
    const outcome = blackjackEngine.stand(session.round);
    return {
      ok: true,
      completed: true,
      session: this.finishSession(session, outcome),
    };
  }

  doubleDown(session) {
    if (session.round.playerActions > 0) {
      return {
        ok: false,
        code: "DOUBLE_NOT_ALLOWED",
        message: "Double autorise seulement au premier tour / Double only on the first turn.",
      };
    }

    const additionalWager = session.wager;
    if (session.balance < additionalWager) {
      return {
        ok: false,
        code: "INSUFFICIENT_BALANCE",
        message: "Solde insuffisant pour doubler / Insufficient balance to double.",
      };
    }

    const user = this.store.reserveWager(session.guildId, session.userId, additionalWager, this.now());
    session.balance = user.balance;
    session.wager += additionalWager;

    blackjackEngine.hitPlayer(session.round);
    session.updatedAt = this.now();

    const outcome = blackjackEngine.handValue(session.round.playerHand).isBust
      ? blackjackEngine.resolveRound(session.round)
      : blackjackEngine.stand(session.round);

    return {
      ok: true,
      completed: true,
      session: this.finishSession(session, outcome),
    };
  }

  surrender(session) {
    if (session.round.playerActions > 0) {
      return {
        ok: false,
        code: "SURRENDER_NOT_ALLOWED",
        message: "Abandon autorise seulement avant action / Surrender only before the first action.",
      };
    }

    return {
      ok: true,
      completed: true,
      session: this.finishSession(session, blackjackEngine.surrender(session.round)),
    };
  }

  timeoutSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return null;

    const outcome = blackjackEngine.stand(session.round);
    return {
      ok: true,
      completed: true,
      session: this.finishSession(session, outcome, { timedOut: true }),
    };
  }

  finishSession(session, outcome, options = {}) {
    const settlement = createSettlement(outcome.type, session.wager);
    const user = this.store.settleGame(session.guildId, session.userId, settlement, this.now());

    session.status = "completed";
    session.timedOut = Boolean(options.timedOut);
    session.result = {
      ...outcome,
      ...settlement,
      timedOut: session.timedOut,
    };
    session.balance = user.balance;
    session.updatedAt = this.now();

    this.activeSessions.delete(session.key);
    this.sessions.delete(session.id);

    return session;
  }

  withSessionLock(sessionId, task) {
    const previous = this.sessionLocks.get(sessionId) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    const tracked = next
      .finally(() => {
        if (this.sessionLocks.get(sessionId) === tracked) {
          this.sessionLocks.delete(sessionId);
        }
      })
      .catch(() => {});

    this.sessionLocks.set(sessionId, tracked);
    return next;
  }

  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  getProfile(guildId, userId) {
    const user = this.store.getOrCreateUser(guildId, userId, this.now());
    return {
      user,
      daily: getDailyState(user, this.now()),
    };
  }

  claimDaily(guildId, userId) {
    return this.store.claimDaily(guildId, userId, {
      amount: BLACKJACK_CONFIG.dailyAmount,
      cooldownMs: BLACKJACK_CONFIG.dailyCooldownMs,
      now: this.now(),
    });
  }

  getLeaderboard(guildId, limit = 10) {
    return this.store.getLeaderboard(guildId, limit);
  }
}

function validateBet(wager) {
  if (!Number.isInteger(wager)) {
    return {
      ok: false,
      code: "INVALID_BET",
      message: "Mise invalide / Invalid bet.",
    };
  }
  if (wager < BLACKJACK_CONFIG.minBet) {
    return {
      ok: false,
      code: "BET_TOO_LOW",
      message: `Mise minimum / Minimum bet: ${BLACKJACK_CONFIG.minBet}`,
    };
  }
  if (wager > BLACKJACK_CONFIG.maxBet) {
    return {
      ok: false,
      code: "BET_TOO_HIGH",
      message: `Mise maximum / Maximum bet: ${BLACKJACK_CONFIG.maxBet}`,
    };
  }
  if (wager % BLACKJACK_CONFIG.betStep !== 0) {
    return {
      ok: false,
      code: "BET_STEP",
      message: `Mise par palier de ${BLACKJACK_CONFIG.betStep} / Bet must be a multiple of ${BLACKJACK_CONFIG.betStep}.`,
    };
  }
  return { ok: true };
}

function createSettlement(result, wager) {
  if (result === "blackjack") {
    const profit = Math.round(wager * 1.5);
    return {
      result,
      wager,
      credit: wager + profit,
      profit,
    };
  }

  if (result === "win") {
    return {
      result,
      wager,
      credit: wager * 2,
      profit: wager,
    };
  }

  if (result === "push") {
    return {
      result,
      wager,
      credit: wager,
      profit: 0,
    };
  }

  if (result === "surrender") {
    return {
      result,
      wager,
      credit: Math.floor(wager / 2),
      profit: 0,
    };
  }

  return {
    result: "loss",
    wager,
    credit: 0,
    profit: 0,
  };
}

function getDailyState(user, now = Date.now()) {
  const lastDailyAt = user.lastDailyAt || 0;
  if (!lastDailyAt) {
    return {
      available: true,
      nextDailyAt: now,
      remainingMs: 0,
    };
  }

  const nextDailyAt = lastDailyAt + BLACKJACK_CONFIG.dailyCooldownMs;
  const remainingMs = Math.max(0, nextDailyAt - now);
  return {
    available: remainingMs === 0,
    nextDailyAt,
    remainingMs,
  };
}

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function createSessionId() {
  return crypto.randomBytes(6).toString("hex");
}

let defaultService = null;

function getBlackjackService() {
  if (!defaultService) {
    defaultService = new BlackjackService();
  }
  return defaultService;
}

module.exports = {
  BlackjackService,
  BLACKJACK_CONFIG,
  createSettlement,
  getDailyState,
  getBlackjackService,
  validateBet,
};
