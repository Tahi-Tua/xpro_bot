const { Events, EmbedBuilder } = require("discord.js");
const { HERO_TIPS_CHANNEL_ID } = require("../config/channels");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const stateFile = path.join(__dirname, "../data/heroState.json");

// Queue to serialize async writes
let heroSaveQueue = Promise.resolve();

function loadHeroes() {
  delete require.cache[require.resolve("../data/heroes")];
  const heroesDir = path.join(__dirname, "../data/heroes");
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(heroesDir) && key.endsWith(".js")) {
      delete require.cache[key];
    }
  }
  return require("../data/heroes");
}

function loadState() {
  try {
    const data = fs.readFileSync(stateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save hero state to disk asynchronously.
 * Uses a queue to serialize writes and prevent race conditions.
 */
function saveState(state) {
  heroSaveQueue = heroSaveQueue
    .then(async () => {
      try {
        await fsPromises.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
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

module.exports = (client) => {
  client.heroTipsPosted = false;

  client.on(Events.ClientReady, async () => {
    if (client.heroTipsPosted) return;

    try {
      const channel = client.channels.cache.get(HERO_TIPS_CHANNEL_ID);
      if (!channel) {
        console.log("❌ Hero-Tips channel not found:", HERO_TIPS_CHANNEL_ID);
        return;
      }

      const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (!messages) {
        console.log("⚠️ Cannot access Hero-Tips channel. Please give the bot permission to view this channel.");
        return;
      }

      const heroes = loadHeroes();
      const state = loadState();
      let updated = false;

      for (const hero of heroes) {
        const currentHash = heroHash(hero);
        const savedData = state[hero.id];
        const existingMsgByState = savedData?.messageId ? messages.get(savedData.messageId) : null;
        const existingMsg = existingMsgByState || findExistingHeroMessage(messages, hero);

        if (existingMsg && savedData?.hash === currentHash && savedData?.messageId === existingMsg.id) {
          continue;
        }

        const embed = buildHeroEmbed(hero);
        const newMsg = existingMsg
          ? await existingMsg.edit({ embeds: [embed] })
          : await channel.send({ embeds: [embed] });

        state[hero.id] = {
          hash: currentHash,
          messageId: newMsg.id,
        };

        updated = true;
        console.log(`📘 Hero-Tips ${existingMsg ? "synced" : "posted"}: ${hero.name}`);
      }

      const heroIds = heroes.map((h) => h.id);
      for (const id of Object.keys(state)) {
        if (!heroIds.includes(id)) {
          const oldData = state[id];
          if (oldData && oldData.messageId) {
            const oldMsg = messages.get(oldData.messageId);
            if (oldMsg) {
              await oldMsg.delete().catch(() => {});
            }
          }
          delete state[id];
          updated = true;
        }
      }

      if (updated) {
        saveState(state);
      } else {
        console.log("✅ Hero-Tips: no changes, keeping existing messages.");
      }

      client.heroTipsPosted = true;
    } catch (err) {
      console.log("❌ Error in Hero-Tips handler:", err.message);
    }
  });
};
