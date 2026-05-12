/**
 * Rules Message Handler
 * Posts and maintains the server rules message in the rules channel.
 * Uses hash-based change detection to avoid re-posting on every restart.
 */

const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const { RULES_CHANNEL_ID } = require("../config/channels");
const {
  RULES_BANNER_FILENAME,
  RULES_TITLE,
  RULES_DESCRIPTION,
  RULES_FIELDS,
  RULES_FOOTER,
  RULES_COLOR,
} = require("../config/rules-content");

const stateFile = path.join(__dirname, "../data/rulesState.json");
const bannerPath = path.join(__dirname, "../attached_assets", RULES_BANNER_FILENAME);

// Queue to serialize async writes
let rulesSaveQueue = Promise.resolve();

function loadState() {
  try {
    const data = fs.readFileSync(stateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveState(state) {
  rulesSaveQueue = rulesSaveQueue
    .then(async () => {
      try {
        await fsPromises.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
      } catch (err) {
        console.warn("⚠️ Could not save rules state:", err.message);
      }
    })
    .catch((err) => {
      console.warn("⚠️ Unexpected error in rules save queue:", err.message);
    });
  return rulesSaveQueue;
}

function rulesHash() {
  // Hash based on all configurable content
  return JSON.stringify({
    title: RULES_TITLE,
    description: RULES_DESCRIPTION,
    fields: RULES_FIELDS,
    footer: RULES_FOOTER,
    color: RULES_COLOR,
    banner: RULES_BANNER_FILENAME,
  });
}

function createRulesEmbed() {
  return new EmbedBuilder()
    .setColor(RULES_COLOR)
    .setTitle(RULES_TITLE)
    .setDescription(RULES_DESCRIPTION)
    .addFields(RULES_FIELDS)
    .setFooter({ text: RULES_FOOTER })
    .setTimestamp();
}

function createAcceptButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("accept_rules")
      .setLabel("✅ Accept Rules")
      .setStyle(ButtonStyle.Success)
  );
}

function hasAcceptRulesButton(message) {
  return message.components?.some((row) =>
    row.components?.some((component) => component.customId === "accept_rules"),
  );
}

function findExistingRulesMessage(messages) {
  return messages.find((message) =>
    message.author?.bot &&
    (
      hasAcceptRulesButton(message) ||
      message.embeds?.some((embed) => embed.title === RULES_TITLE)
    ),
  ) || null;
}

function findExistingRulesBanner(messages) {
  return messages.find((message) =>
    message.author?.bot &&
    message.attachments?.some((attachment) => attachment.name === RULES_BANNER_FILENAME),
  ) || null;
}

module.exports = (client) => {
  client.rulesMessagePosted = false;

  client.on(Events.ClientReady, async () => {
    if (client.rulesMessagePosted) return;

    try {
      const channel = client.channels.cache.get(RULES_CHANNEL_ID);
      if (!channel) {
        console.log("❌ Rules channel not found:", RULES_CHANNEL_ID);
        return;
      }

      const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (!messages) {
        console.log("⚠️ Cannot access Rules channel. Please check bot permissions.");
        return;
      }

      const state = loadState();
      const currentHash = rulesHash();
      const existingMsgByState = state.messageId ? messages.get(state.messageId) : null;
      const existingMsg = existingMsgByState || findExistingRulesMessage(messages);
      const existingBannerByState = state.bannerMsgId ? messages.get(state.bannerMsgId) : null;
      const existingBanner = existingBannerByState || findExistingRulesBanner(messages);

      if (existingMsg && state.hash === currentHash) {
        state.messageId = existingMsg.id;
        state.bannerMsgId = existingBanner?.id || state.bannerMsgId || null;
        await saveState(state);
        console.log("✅ Rules: no changes, keeping existing message.");
        client.rulesMessagePosted = true;
        return;
      }

      const embed = createRulesEmbed();
      const row = createAcceptButton();

      let bannerMsgId = existingBanner?.id || null;
      if (!bannerMsgId && fs.existsSync(bannerPath)) {
        const attachment = new AttachmentBuilder(bannerPath, { name: RULES_BANNER_FILENAME });
        const bannerMsg = await channel.send({ files: [attachment] });
        bannerMsgId = bannerMsg.id;
        console.log("🖼️ Rules banner posted");
      } else {
        console.log("⚠️ Rules banner not found at:", bannerPath);
      }

      const newMsg = existingMsg
        ? await existingMsg.edit({ embeds: [embed], components: [row] })
        : await channel.send({ embeds: [embed], components: [row] });

      state.hash = currentHash;
      state.messageId = newMsg.id;
      state.bannerMsgId = bannerMsgId;
      await saveState(state);

      console.log(`📜 Rules message ${existingMsg ? "synced" : "posted"} successfully!`);
      client.rulesMessagePosted = true;
    } catch (err) {
      console.error("❌ Error in Rules handler:", err.message);
    }
  });
};
