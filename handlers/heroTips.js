const { Events, EmbedBuilder } = require("discord.js");
const { HERO_TIPS_CHANNEL_ID } = require("../config/channels");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const stateFile = path.join(projectRoot, "data/heroState.json");
const heroSourceDirs = [
  path.join(projectRoot, "config/heroes"),
  path.join(projectRoot, "data/heroes"),
];

const HERO_TIPS_WATCH_ENABLED = (process.env.HERO_TIPS_WATCH || "true").toLowerCase() !== "false";
const HERO_TIPS_WATCH_DEBOUNCE_MS = Number(process.env.HERO_TIPS_WATCH_DEBOUNCE_MS || 1500);

let heroSaveQueue = Promise.resolve();
let heroSyncQueue = Promise.resolve();
let heroWatchHandle = null;
let heroWatchTimer = null;
const pendingHeroPaths = new Set();

function resolveHeroSourceDir() {
  return heroSourceDirs.find((dir) => {
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).some((file) => /^hero-\d+\.js$/i.test(file));
  }) || null;
}

function clearHeroRequireCache(heroesDir) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(heroesDir) && key.endsWith(".js")) {
      delete require.cache[key];
    }
  }
}

function loadHeroSource() {
  const heroesDir = resolveHeroSourceDir();

  if (!heroesDir) {
    console.warn("⚠️ Hero-Tips: no hero source directory found. Skipping hero sync.");
    return { heroes: [], heroesDir: null };
  }

  clearHeroRequireCache(heroesDir);

  const files = fs
    .readdirSync(heroesDir)
    .filter((file) => /^hero-\d+\.js$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const heroes = [];
  for (const file of files) {
    const sourceFile = path.join(heroesDir, file);
    try {
      const hero = require(sourceFile);
      if (!hero?.id || !hero?.name || !hero?.tips) {
        console.warn(`[Hero-Tips] Skipping ${file}: missing id, name, or tips.`);
        continue;
      }
      heroes.push({
        ...hero,
        sourceFile,
        sourceFileName: file,
      });
    } catch (err) {
      console.warn(`[Hero-Tips] Skipping ${file}: ${err.message}`);
    }
  }

  console.log(`[Hero-Tips] Loading ${heroes.length} heroes from ${heroesDir}`);
  return { heroes, heroesDir };
}

function loadHeroes() {
  return loadHeroSource().heroes;
}

function loadState() {
  try {
    if (!fs.existsSync(stateFile)) return {};
    const data = fs.readFileSync(stateFile, "utf8");
    if (!data.trim()) return {};
    return JSON.parse(data);
  } catch (err) {
    console.warn("⚠️ Could not load hero state:", err.message);
    return {};
  }
}

function saveState(state) {
  heroSaveQueue = heroSaveQueue
    .then(async () => {
      try {
        await fsPromises.mkdir(path.dirname(stateFile), { recursive: true });
        const tempFile = `${stateFile}.tmp`;
        await fsPromises.writeFile(tempFile, JSON.stringify(state, null, 2), "utf8");
        await fsPromises.rename(tempFile, stateFile);
      } catch (err) {
        console.warn("⚠️ Could not save hero state:", err.message);
      }
    })
    .catch((err) => {
      console.warn("⚠️ Unexpected error in hero save queue:", err.message);
    });
  return heroSaveQueue;
}

function heroHash(hero) {
  return JSON.stringify({ name: hero.name, image: hero.image, tips: hero.tips });
}

function isValidEmbedImageUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function buildHeroEmbed(hero) {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🦸 ${hero.name}`)
    .setDescription(hero.tips);

  if (isValidEmbedImageUrl(hero.image)) {
    embed.setImage(hero.image);
  } else if (hero.image) {
    console.warn(`⚠️ Hero-Tips: skipped invalid image URL for ${hero.name}`);
  }

  return embed;
}

function findExistingHeroMessage(messages, hero) {
  const expectedTitle = `🦸 ${hero.name}`;
  return messages.find((message) =>
    message.author?.bot &&
    message.embeds?.some((embed) => embed.title === expectedTitle),
  ) || null;
}

function normalizePath(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function getTargetHeroIdsForChangedPaths(heroes, changedPaths) {
  if (!changedPaths || changedPaths.length === 0) return null;

  const normalizedChangedPaths = new Set(changedPaths.map(normalizePath));
  const changedNames = new Set(changedPaths.map((filePath) => path.basename(filePath).toLowerCase()));

  if (changedNames.has("index.js")) return null;

  const targetIds = new Set();
  for (const hero of heroes) {
    if (normalizedChangedPaths.has(normalizePath(hero.sourceFile))) {
      targetIds.add(hero.id);
    }
  }

  return targetIds.size > 0 ? targetIds : null;
}

async function runHeroTipsSync(client, options = {}) {
  const reason = options.reason || "startup";
  const changedPaths = options.changedPaths || null;

  const channel = await client.channels.fetch(HERO_TIPS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.log("❌ Hero-Tips channel not found or invalid:", HERO_TIPS_CHANNEL_ID);
    return { updated: false, heroesDir: null };
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) {
    console.log("⚠️ Cannot access Hero-Tips channel. Please give the bot permission to view this channel.");
    return { updated: false, heroesDir: null };
  }

  const { heroes, heroesDir } = loadHeroSource();
  if (!heroes.length) {
    console.log("⚠️ Hero-Tips: no heroes loaded, skipping sync.");
    return { updated: false, heroesDir };
  }

  const targetHeroIds = getTargetHeroIdsForChangedPaths(heroes, changedPaths);
  const targetHeroes = targetHeroIds
    ? heroes.filter((hero) => targetHeroIds.has(hero.id))
    : heroes;

  if (targetHeroes.length === 0) {
    console.log(`[Hero-Tips] ${reason}: no matching hero file to sync.`);
    return { updated: false, heroesDir };
  }

  const state = loadState();
  let stateChanged = false;
  const summary = {
    posted: 0,
    updated: 0,
    skipped: 0,
    removed: 0,
  };

  for (const hero of targetHeroes) {
    const currentHash = heroHash(hero);
    const savedData = state[hero.id];
    const existingMsgByState = savedData?.messageId ? messages.get(savedData.messageId) : null;
    const existingMsg = existingMsgByState || findExistingHeroMessage(messages, hero);

    if (existingMsg && savedData?.hash === currentHash && savedData?.messageId === existingMsg.id) {
      summary.skipped += 1;
      continue;
    }

    const embed = buildHeroEmbed(hero);
    const newMsg = existingMsg
      ? await existingMsg.edit({ embeds: [embed] })
      : await channel.send({ embeds: [embed] });

    state[hero.id] = {
      hash: currentHash,
      messageId: newMsg.id,
      sourceFile: path.relative(projectRoot, hero.sourceFile).replace(/\\/g, "/"),
      syncedAt: Date.now(),
    };

    stateChanged = true;
    if (existingMsg) summary.updated += 1;
    else summary.posted += 1;

    console.log(`📘 Hero-Tips ${existingMsg ? "updated" : "posted"}: ${hero.name}`);
  }

  if (!targetHeroIds) {
    const heroIds = heroes.map((h) => h.id);
    for (const id of Object.keys(state)) {
      if (!heroIds.includes(id)) {
        const oldData = state[id];
        if (oldData?.messageId) {
          const oldMsg = messages.get(oldData.messageId);
          if (oldMsg) {
            await oldMsg.delete().catch(() => {});
          }
        }
        delete state[id];
        stateChanged = true;
        summary.removed += 1;
      }
    }
  }

  if (stateChanged) {
    await saveState(state);
  }

  console.log(
    `[Hero-Tips] ${reason}: ${summary.updated} updated, ${summary.posted} posted, ${summary.removed} removed, ${summary.skipped} unchanged.`,
  );

  return { updated: stateChanged, heroesDir, summary };
}

function syncHeroTips(client, options = {}) {
  heroSyncQueue = heroSyncQueue
    .then(() => runHeroTipsSync(client, options))
    .catch((err) => {
      console.log("❌ Error in Hero-Tips sync:", err.message);
      return { updated: false, heroesDir: null, error: err };
    });

  return heroSyncQueue;
}

function scheduleHeroTipsSync(client, filePath, eventType) {
  if (filePath) pendingHeroPaths.add(filePath);
  if (heroWatchTimer) clearTimeout(heroWatchTimer);

  heroWatchTimer = setTimeout(() => {
    const changedPaths = Array.from(pendingHeroPaths);
    pendingHeroPaths.clear();

    syncHeroTips(client, {
      reason: `file ${eventType || "change"}`,
      changedPaths,
    });
  }, HERO_TIPS_WATCH_DEBOUNCE_MS);
}

function startHeroTipsWatcher(client, heroesDir) {
  if (!HERO_TIPS_WATCH_ENABLED || !heroesDir || heroWatchHandle) return;

  try {
    heroWatchHandle = fs.watch(heroesDir, (eventType, filename) => {
      if (!filename || !filename.endsWith(".js")) return;
      scheduleHeroTipsSync(client, path.join(heroesDir, filename), eventType);
    });
    console.log(`[Hero-Tips] Smart watcher active for ${heroesDir}`);
  } catch (err) {
    console.warn("[Hero-Tips] Could not start smart watcher:", err.message);
  }
}

module.exports = (client) => {
  client.heroTipsPosted = false;

  client.on(Events.ClientReady, async () => {
    if (client.heroTipsPosted) return;

    const result = await syncHeroTips(client, { reason: "startup" });
    if (result?.heroesDir) startHeroTipsWatcher(client, result.heroesDir);
    client.heroTipsPosted = true;
  });
};

module.exports.loadHeroes = loadHeroes;
module.exports.loadHeroSource = loadHeroSource;
module.exports.getTargetHeroIdsForChangedPaths = getTargetHeroIdsForChangedPaths;
module.exports.syncHeroTips = syncHeroTips;
