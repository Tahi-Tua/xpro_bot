/**
 * Rate limiter for Discord DMs to avoid hitting API limits.
 * Discord allows ~5 DMs per 5 seconds per user globally.
 */

const DM_RATE_LIMIT_MS = Number(process.env.DM_RATE_LIMIT_MS || 2000); // Min delay between DMs to same user
const DM_GLOBAL_LIMIT = Number(process.env.DM_GLOBAL_LIMIT || 5);      // Max DMs in window
const DM_GLOBAL_WINDOW_MS = Number(process.env.DM_GLOBAL_WINDOW_MS || 5000);

const lastDmTime = new Map();     // userId -> timestamp
const globalDmQueue = [];         // Array of timestamps

/**
 * Clean old entries from the global queue
 */
function cleanGlobalQueue() {
  const now = Date.now();
  while (globalDmQueue.length > 0 && globalDmQueue[0] < now - DM_GLOBAL_WINDOW_MS) {
    globalDmQueue.shift();
  }
}

/**
 * Check if we can send a DM to a user right now
 * @param {string} userId - Discord user ID
 * @returns {boolean}
 */
function canSendDm(userId) {
  const now = Date.now();
  
  // Check per-user rate limit
  const lastTime = lastDmTime.get(userId) || 0;
  if (now - lastTime < DM_RATE_LIMIT_MS) {
    return false;
  }
  
  // Check global rate limit
  cleanGlobalQueue();
  if (globalDmQueue.length >= DM_GLOBAL_LIMIT) {
    return false;
  }
  
  return true;
}

/**
 * Record that a DM was sent
 * @param {string} userId - Discord user ID
 */
function recordDm(userId) {
  const now = Date.now();
  lastDmTime.set(userId, now);
  globalDmQueue.push(now);
  
  // Cleanup old per-user entries periodically (every 100 DMs)
  if (globalDmQueue.length % 100 === 0) {
    const cutoff = now - 60000; // 1 minute
    for (const [uid, timestamp] of lastDmTime.entries()) {
      if (timestamp < cutoff) {
        lastDmTime.delete(uid);
      }
    }
  }
}

/**
 * Get delay before next DM can be sent to user
 * @param {string} userId - Discord user ID
 * @returns {number} milliseconds to wait (0 if can send now)
 */
function getDelayForUser(userId) {
  const now = Date.now();
  
  // Check per-user limit
  const lastTime = lastDmTime.get(userId) || 0;
  const userDelay = Math.max(0, DM_RATE_LIMIT_MS - (now - lastTime));
  
  // Check global limit
  cleanGlobalQueue();
  let globalDelay = 0;
  if (globalDmQueue.length >= DM_GLOBAL_LIMIT) {
    globalDelay = Math.max(0, DM_GLOBAL_WINDOW_MS - (now - globalDmQueue[0]));
  }
  
  return Math.max(userDelay, globalDelay);
}

/**
 * Send a DM with rate limiting. Waits if necessary.
 * @param {User|GuildMember} target - Discord User or GuildMember
 * @param {object} content - Message content (string or { embeds: [...] })
 * @returns {Promise<Message|null>} The sent message or null on failure
 */
async function sendDmWithRateLimit(target, content) {
  const user = target.user || target; // Handle both User and GuildMember
  const userId = user.id;
  
  // Wait if needed
  const delay = getDelayForUser(userId);
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // Record and send
  recordDm(userId);
  
  try {
    return await user.send(content);
  } catch (err) {
    // User may have DMs disabled
    if (err.code === 50007) {
      console.log(`[DM] Cannot send to ${user.tag || userId}: DMs disabled`);
    } else {
      console.error(`[DM] Failed to send to ${user.tag || userId}:`, err.message);
    }
    return null;
  }
}

/**
 * Queue multiple DMs with proper spacing
 * @param {Array<{target: User|GuildMember, content: object}>} messages
 * @returns {Promise<Array<Message|null>>}
 */
async function sendBulkDms(messages) {
  const results = [];
  for (const { target, content } of messages) {
    const result = await sendDmWithRateLimit(target, content);
    results.push(result);
  }
  return results;
}

module.exports = {
  canSendDm,
  recordDm,
  getDelayForUser,
  sendDmWithRateLimit,
  sendBulkDms,
  DM_RATE_LIMIT_MS,
  DM_GLOBAL_LIMIT,
  DM_GLOBAL_WINDOW_MS,
};
