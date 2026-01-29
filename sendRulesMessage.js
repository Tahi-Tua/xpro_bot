/**
 * Script to manually send/update the rules message.
 * Usage: node sendRulesMessage.js
 * 
 * This will force-post the rules message regardless of the current state.
 * Useful for initial setup or when you want to refresh the message.
 */

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const { RULES_CHANNEL_ID } = require("./config/channels");
const {
  RULES_BANNER_FILENAME,
  RULES_TITLE,
  RULES_DESCRIPTION,
  RULES_FIELDS,
  RULES_FOOTER,
  RULES_COLOR,
} = require("./config/rules-content");

const stateFile = path.join(__dirname, "data/rulesState.json");
const bannerPath = path.join(__dirname, "attached_assets", RULES_BANNER_FILENAME);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

function rulesHash() {
  return JSON.stringify({
    title: RULES_TITLE,
    description: RULES_DESCRIPTION,
    fields: RULES_FIELDS,
    footer: RULES_FOOTER,
    color: RULES_COLOR,
    banner: RULES_BANNER_FILENAME,
  });
}

function loadState() {
  try {
    const data = fs.readFileSync(stateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveState(state) {
  await fsPromises.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(RULES_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error(`❌ Rules channel not found: ${RULES_CHANNEL_ID}`);
      process.exit(1);
    }

    console.log(`📋 Posting rules to #${channel.name} (${channel.id})`);

    // Fetch existing messages to find old rules message
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const state = loadState();

    // Delete old messages if exist
    if (state.bannerMsgId && messages) {
      const oldBanner = messages.get(state.bannerMsgId);
      if (oldBanner) {
        await oldBanner.delete().catch(() => {});
        console.log("🗑️ Deleted old banner");
      }
    }
    if (state.messageId && messages) {
      const oldMsg = messages.get(state.messageId);
      if (oldMsg) {
        await oldMsg.delete().catch(() => {});
        console.log("🗑️ Deleted old rules message");
      }
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(RULES_COLOR)
      .setTitle(RULES_TITLE)
      .setDescription(RULES_DESCRIPTION)
      .addFields(RULES_FIELDS)
      .setFooter({ text: RULES_FOOTER })
      .setTimestamp();

    // Build button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("accept_rules")
        .setLabel("✅ Accept Rules")
        .setStyle(ButtonStyle.Success)
    );

    // Send banner FIRST (so it appears above the rules)
    let bannerMsgId = null;
    if (fs.existsSync(bannerPath)) {
      const attachment = new AttachmentBuilder(bannerPath, { name: RULES_BANNER_FILENAME });
      const bannerMsg = await channel.send({ files: [attachment] });
      bannerMsgId = bannerMsg.id;
      console.log("🖼️ Banner image posted");
    } else {
      console.log(`⚠️ Banner not found at: ${bannerPath}`);
    }

    // Then send the embed with rules
    const newMsg = await channel.send({
      embeds: [embed],
      components: [row],
    });

    // Save state
    const newState = {
      hash: rulesHash(),
      messageId: newMsg.id,
      bannerMsgId: bannerMsgId,
    };
    await saveState(newState);

    console.log("\n" + "=".repeat(50));
    console.log("✅ RULES MESSAGE POSTED SUCCESSFULLY");
    console.log("=".repeat(50));
    console.log(`Message ID: ${newMsg.id}`);
    console.log(`Channel: #${channel.name}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error posting rules:", error);
    process.exit(1);
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN not set in environment");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
