const { Events, EmbedBuilder } = require("discord.js");
const { HERO_TIPS_CHANNEL_ID } = require("../config/channels");
const fs = require("fs");
const path = require("path");

const stateFile = path.join(__dirname, "../data/heroState.json");

function loadHeroes() {
  delete require.cache[require.resolve("../data/heroes")];
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

function saveState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function heroHash(hero) {
  return JSON.stringify({ name: hero.name, image: hero.image, tips: hero.tips });
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

        if (savedData && savedData.hash === currentHash && savedData.messageId) {
          const existingMsg = messages.get(savedData.messageId);
          if (existingMsg) {
            continue;
          }
        }

        if (savedData && savedData.messageId) {
          const oldMsg = messages.get(savedData.messageId);
          if (oldMsg) {
            await oldMsg.delete().catch(() => {});
          }
        }

        const embed = new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle(`🦸 ${hero.name}`)
          .setDescription(hero.tips)
          .setImage(hero.image);

        const newMsg = await channel.send({ embeds: [embed] });

        state[hero.id] = {
          hash: currentHash,
          messageId: newMsg.id,
        };

        updated = true;
        console.log(`📘 Hero-Tips updated: ${hero.name}`);
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
