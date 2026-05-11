const DEFAULT_DISCORD_TIMEOUT_MS = Number(process.env.DISCORD_API_TIMEOUT_MS || 10_000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, label = "Discord API call", ms = DEFAULT_DISCORD_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_DISCORD_TIMEOUT_MS,
  sleep,
  withTimeout,
};
