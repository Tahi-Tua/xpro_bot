require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

const {
  Client,
  Collection,
  GatewayIntentBits,
  EmbedBuilder,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const {
  RULES_CHANNEL_ID,
  JOIN_US_CHANNEL_ID,
  DIVINE_TIPS_CHANNEL_ID,
} = require("./config/channels");
const { runStartupHistoryScan } = require("./handlers/historyScan");

const stateFile = path.join(__dirname, "data/channelState.json");
const profileStateFile = path.join(__dirname, "data/profileState.json");
const BOT_AVATAR_SOURCE =
  process.env.BOT_AVATAR_SOURCE || path.join(__dirname, "attached_assets", "bot-avatar.gif");
const BOT_DISPLAY_NAME = process.env.BOT_DISPLAY_NAME || "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑜";
const ENABLE_TELEGRAM_FILE_NOTIFIER = (() => {
  const flag = (process.env.ENABLE_TELEGRAM_FILE_NOTIFIER || "").toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return Boolean(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID);
})();

// Parse mode is now defined in utils/telegram.  See that module for details.

function loadChannelState() {
  try {
    const data = fs.readFileSync(stateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveChannelState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function loadProfileState() {
  try {
    const data = fs.readFileSync(profileStateFile, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveProfileState(state) {
  fs.writeFileSync(profileStateFile, JSON.stringify(state, null, 2));
}

function resolveAvatarSource(source) {
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) return source;
  return path.isAbsolute(source) ? source : path.join(__dirname, source);
}

async function readAvatarBuffer(source) {
  if (!source) return null;

  if (/^https?:\/\//i.test(source)) {
    return new Promise((resolve, reject) => {
      https
        .get(source, (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Avatar request failed with status ${res.statusCode}`));
            res.resume();
            return;
          }
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        })
        .on("error", reject);
    });
  }

  return fs.readFileSync(source);
}

function contentHash(content) {
  return crypto.createHash("md5").update(JSON.stringify(content)).digest("hex");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// Route rejected promises from async event handlers to the client's `error`
// event instead of producing unhandledRejection noise.
client.captureRejections = true;

client.commands = new Collection();
client.on("error", (err) => console.error("Discord client error:", err));
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));

const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const commandFolders = fs.readdirSync(commandsPath);
  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const stat = fs.statSync(folderPath);
    if (stat.isDirectory()) {
      const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith(".js"));
      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
          client.commands.set(command.data.name, command);
          console.log(`📦 Command loaded: ${command.data.name}`);
        }
      }
    }
  }
}

// Telegram alerting is now encapsulated in utils/telegram.  Modules that
// need to send Telegram messages should import sendToTelegram from
// '../utils/telegram' rather than relying on a global.  See
// utils/telegram.js for implementation details.

// Initialize Telegram File Notifier
if (ENABLE_TELEGRAM_FILE_NOTIFIER) {
  try {
    const telegramNotifier = require("./utils/telegramFileNotifier");
    telegramNotifier.init();
    console.log("🚀 Telegram File Notifier started");
  } catch (err) {
    console.warn("⚠️ Telegram notifier failed to start:", err.message);
  }
} else {
  console.log("ℹ️ Telegram File Notifier disabled (ENABLE_TELEGRAM_FILE_NOTIFIER=false)");
}

require("./handlers/rules")(client);
require("./handlers/joinUs")(client);
require("./handlers/modDecision")(client);
require("./handlers/generalChat")(client);
require("./handlers/screenshots")(client);
require("./handlers/badwords")(client);
require("./handlers/spam")(client);
require("./handlers/bugReports")(client);
require("./handlers/heroTips")(client);
require("./handlers/svsReminder")(client);
require("./handlers/suggestions")(client);
require("./handlers/hallOfFame")(client);

require("./events/memberJoin")(client);
require("./events/memberLeave")(client);

const RULES_CONTENT = {
  color: 0x2b2d31,
  title: "📜 Server Rules – Xavier Pro",
  description:
    "**Welcome to the official Xavier Pro Discord server.**\n" +
    "Please read the rules carefully.\n\n" +
    "__General Rules__\n" +
    "▫ No insulting\n" +
    "▫ No doxxing or sharing private information\n" +
    "▫ No spam\n" +
    "▫ English only\n" +
    "▫ Discord name MUST match your in-game name\n\n" +
    "__Member Rules__\n" +
    "▫ Stay active\n" +
    "▫ More than 4 days inactive = kick\n" +
    "▫ Notify leaders if you need time off\n" +
    "▫ Must participate in SVS\n" +
    "▫ No toxic behavior\n\n" +
    "**Press the button below to accept the rules.**",
  footer: "Xavier Pro • Verification System",
};

const JOIN_US_CONTENT = {
  color: 0x0099ff,
  title: "🎯 Syndicate Application (Optional)",
  description:
    "This channel is **only** for players who want to **apply to join the syndicate**.\n\n" +
    "Please send your **Player ID** + **screenshots** (stats/heroes), **or** a **valid official stats link**.\n\n" +
    "🚫 **No chatting in this channel** — applications only.\n" +
    "A private ticket will be created automatically for our staff.",
  footer: "Xavier Pro • Recruitment System",
};

const DIVINE_TIPS_CONTENT = {
  color: 0xffd700,
  title: "🔥 Key Strategies for Reaching Divine 🔥",
  description:
    "**Prioritize Contracts and Chests**\n" +
    "Focus on completing daily contracts and opening battle/skull chests to acquire coins, cards, and resources for upgrades.\n\n" +
    "**Join a Syndicate**\n" +
    "Team up to participate in events and sabotage modes, earning bonus points and faster progress.\n\n" +
    "**Strategically Upgrade Heroes**\n" +
    "Focus on your chosen heroes through common → rare → epic → legendary → mythic → **Divine**.\n\n" +
    "**Utilize Joker Cards Wisely**\n" +
    "Use Joker cards on your preferred heroes as they apply to anyone, unlike random drops.\n\n" +
    "**Master Hero Abilities**\n" +
    "Learn effective usage of your heroes' abilities and their roles within the team.\n\n" +
    "**Develop Map Awareness**\n" +
    "Know spawn points, purple chests, hot zones, and choke points to anticipate movements.\n\n" +
    "**Practice Teamwork**\n" +
    "Coordinate, communicate, and secure objectives together.\n\n" +
    "__**Specific Hero Tips**__\n" +
    "• **Shenji**: Use grenades to zone enemies rather than just for damage.\n" +
    "• **Tess**: Use lightning balls for zoning and disrupting shields/abilities.\n" +
    "• **Raven/Cyclops**: Don't spam abilities early; save them for late-game impact.\n" +
    "• **SMG Users**: Use stimpacks offensively, not just for healing.\n" +
    "• **Drones**: Use them as shields or distractions in combat.\n\n" +
    "__**Additional Tips**__\n" +
    "• **Don't be Greedy**: Avoid risky looting or early engagements.\n" +
    "• **Learn to Disengage**: Fall back when fights are unfavorable.\n" +
    "• **Play During Events**: Maximize participation for valuable rewards.\n" +
    "• **Experiment**: Find the heroes and styles that suit you best.",
  footer: "Xavier Pro • Strategy Guide",
};

async function smartUpdateChannel(channelId, channelKey, content, hasButton, clientRef) {
  const state = loadChannelState();
  const currentHash = contentHash(content);
  const savedData = state[channelKey];

  const channel = await clientRef.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.log(`❌ Cannot access ${channelKey} channel.`);
    return;
  }

  let existingMsg = null;

  if (savedData?.messageId) {
    try {
      existingMsg = await channel.messages.fetch(savedData.messageId);
    } catch (err) {
      // If we can't confirm the existing message (permissions / transient error) but the
      // content hasn't changed, avoid re-posting the same embed on every restart.
      if (savedData.hash === currentHash && err?.code !== 10008) {
        console.warn(
          `⚠️ ${channelKey}: cannot fetch saved message; skipping update to avoid duplicates: ${err.message}`,
        );
        return;
      }
    }
  }

  const matchesIdentity = (msg) => {
    const embed = msg?.embeds?.[0];
    if (!embed) return false;
    return embed.title === content.title && embed.footer?.text === content.footer;
  };

  const matchesContent = (msg) => {
    const embed = msg?.embeds?.[0];
    if (!embed) return false;
    return matchesIdentity(msg) && embed.description === content.description;
  };

  if (!existingMsg) {
    // State can be missing (fresh deploy) or the tracked message may have been deleted.
    // Try to reuse an existing pinned/recent message instead of spamming duplicates.
    const pinned = await channel.messages.fetchPinned().catch(() => null);
    if (pinned) {
      existingMsg = pinned.find(
        (m) => m.author?.id === clientRef.user.id && matchesIdentity(m),
      );
    }

    if (!existingMsg) {
      const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (recent) {
        existingMsg = recent.find(
          (m) => m.author?.id === clientRef.user.id && matchesIdentity(m),
        );
      }
    }
  }

  if (existingMsg && savedData?.hash === currentHash) {
    console.log(`✅ ${channelKey}: no changes, keeping existing message.`);
    return;
  }

  if (existingMsg && !savedData?.messageId && matchesContent(existingMsg)) {
    state[channelKey] = { hash: currentHash, messageId: existingMsg.id };
    saveChannelState(state);
    console.log(`✅ ${channelKey}: no changes, keeping existing message.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(content.color)
    .setTitle(content.title)
    .setDescription(content.description)
    .setFooter({ text: content.footer })
    .setTimestamp();

  const messageOptions = { embeds: [embed], components: [] };

  if (hasButton) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("accept_rules")
        .setLabel("✅ Accept the rules")
        .setStyle(ButtonStyle.Success),
    );
    messageOptions.components = [row];
  }

  if (existingMsg) {
    const updated = await existingMsg.edit(messageOptions).catch(() => null);
    if (updated) {
      state[channelKey] = {
        hash: currentHash,
        messageId: existingMsg.id,
      };
      saveChannelState(state);
      console.log(`📘 ${channelKey}: message updated.`);
      return;
    }

    await existingMsg.delete().catch(() => {});
  }

  const newMsg = await channel.send(messageOptions).catch(() => null);
  if (!newMsg) {
    console.log(`❌ ${channelKey}: failed to send message.`);
    return;
  }

  state[channelKey] = {
    hash: currentHash,
    messageId: newMsg.id,
  };
  saveChannelState(state);

  console.log(`📘 ${channelKey}: message updated.`);
}

async function ensureBotProfile(clientRef) {
  const profileState = loadProfileState();
  let hasChanges = false;

  if (BOT_DISPLAY_NAME && clientRef.user.username !== BOT_DISPLAY_NAME) {
    try {
      await clientRef.user.setUsername(BOT_DISPLAY_NAME);
      profileState.username = BOT_DISPLAY_NAME;
      hasChanges = true;
      console.log(`✨ Bot name set to "${BOT_DISPLAY_NAME}"`);
    } catch (err) {
      console.warn("⚠️ Unable to update bot username:", err.message);
    }
  }

  const resolvedAvatar = resolveAvatarSource(BOT_AVATAR_SOURCE);

  if (resolvedAvatar) {
    try {
      const avatarBuffer = await readAvatarBuffer(resolvedAvatar);
      const avatarHash = crypto.createHash("md5").update(avatarBuffer).digest("hex");

      if (profileState.avatarHash !== avatarHash) {
        await clientRef.user.setAvatar(avatarBuffer);
        profileState.avatarHash = avatarHash;
        hasChanges = true;
        console.log("✨ Bot avatar updated.");
      } else {
        console.log("ℹ️ Bot avatar already up to date.");
      }
    } catch (err) {
      console.warn("⚠️ Unable to update bot avatar:", err.message);
    }
  } else {
    console.warn(
      "⚠️ No bot avatar source configured; set BOT_AVATAR_SOURCE or place a file at attached_assets/bot-avatar.gif",
    );
  }

  if (hasChanges) {
    saveProfileState(profileState);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} is now online!`);

  await ensureBotProfile(client);
  await smartUpdateChannel(RULES_CHANNEL_ID, "rules", RULES_CONTENT, true, client);
  await smartUpdateChannel(JOIN_US_CHANNEL_ID, "joinUs", JOIN_US_CONTENT, false, client);
  await smartUpdateChannel(DIVINE_TIPS_CHANNEL_ID, "divineTips", DIVINE_TIPS_CONTENT, false, client);

  try {
    await runStartupHistoryScan(client);
  } catch (err) {
    console.warn("?? Startup history scan failed:", err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.log(`❌ Command not found: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
    console.log(`✅ Command executed: ${interaction.commandName} by ${interaction.user.tag}`);
  } catch (error) {
    console.error(`❌ Error executing ${interaction.commandName}:`, error);
    const errorMessage = "An error occurred while executing this command.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Xavier Pro Bot is running!");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", bot: client.user?.tag || "starting..." });
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

client.login(process.env.TOKEN);
