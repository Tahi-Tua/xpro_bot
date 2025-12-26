require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const express = require("express");              // added
const app = express();                           // added

// Small endpoint for Render / monitoring
app.get("/", (req, res) => {
  res.send("xpro_bot is running");
});

// Render provides the port in process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 HTTP server listening on port ${PORT}`);
});

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

const BOT_DISPLAY_NAME = process.env.BOT_DISPLAY_NAME || "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑜";

const ENABLE_TELEGRAM_FILE_NOTIFIER = (() => {
  const flag = (process.env.ENABLE_TELEGRAM_FILE_NOTIFIER || "").toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return Boolean(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID);
})();

// ============================================================================
// State helpers
// ============================================================================

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

function contentHash(content) {
  return crypto.createHash("md5").update(JSON.stringify(content)).digest("hex");
}

// ============================================================================
// Discord client setup
// ============================================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// captureRejections must be set on the constructor or defined before
client.captureRejections = true;
client.commands = new Collection();

client.on("error", (err) => console.error("Discord client error:", err));
process.on("unhandledRejection", (reason) =>
  console.error("Unhandled rejection:", reason)
);

// ============================================================================
// Command loader
// ============================================================================

const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const commandFolders = fs.readdirSync(commandsPath);
  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) continue;

    const commandFiles = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const command = require(filePath);
      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        console.log(`📦 Command loaded: ${command.data.name}`);
      } else {
        console.warn(
          `[WARN] The command at ${filePath} is missing a required "data" or "execute" property.`
        );
      }
    }
  }
} else {
  console.warn("⚠️ No 'commands' directory found.");
}

// ============================================================================
// Handlers loader (auto-register all handlers exporting a function)
// ============================================================================

const handlersPath = path.join(__dirname, "handlers");
if (fs.existsSync(handlersPath)) {
  const handlerFiles = fs
    .readdirSync(handlersPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of handlerFiles) {
    const filePath = path.join(handlersPath, file);
    try {
      const mod = require(filePath);
      if (typeof mod === "function") {
        mod(client);
        console.log(`🔗 Handler loaded: ${file}`);
      } else {
        console.warn(
          `[WARN] The handler at ${filePath} does not export a function.`
        );
      }
    } catch (err) {
      console.error(`❌ Failed to load handler ${file}:`, err.message);
    }
  }
} else {
  console.warn("⚠️ No 'handlers' directory found.");
}

// ============================================================================
// Events loader (auto-register all events exporting a function)
// ============================================================================

const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const mod = require(filePath);
      if (typeof mod === "function") {
        mod(client);
        console.log(`🎛️ Event loaded: ${file}`);
      } else {
        console.warn(
          `[WARN] The event at ${filePath} does not export a function.`
        );
      }
    } catch (err) {
      console.error(`❌ Failed to load event ${file}:`, err.message);
    }
  }
} else {
  console.warn("⚠️ No 'events' directory found.");
}

// ============================================================================
// Telegram File Notifier
// ============================================================================

if (ENABLE_TELEGRAM_FILE_NOTIFIER) {
  try {
    const telegramNotifier = require("./utils/telegramFileNotifier");
    telegramNotifier.init();
    console.log("🚀 Telegram File Notifier started");
  } catch (err) {
    console.warn("⚠️ Telegram notifier failed to start:", err.message);
  }
} else {
  console.log(
    "ℹ️ Telegram File Notifier disabled (ENABLE_TELEGRAM_FILE_NOTIFIER=false or missing TG_BOT_TOKEN/TG_CHAT_ID)"
  );
}

// ============================================================================
// Events / Bot logic
// ============================================================================

// TODO: keep all your existing events here (ready, interactionCreate,
// messageCreate, guildMemberAdd, etc.) as they were in your file.
// Minimal example for ready:

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  try {
    if (BOT_DISPLAY_NAME) {
      await c.user.setUsername(BOT_DISPLAY_NAME);
      console.log("🖊️ Bot name updated");
    }
  } catch (err) {
    console.warn("⚠️ Failed to update bot name:", err.message);
  }

  // Exemple : runStartupHistoryScan si tu l’utilises
  try {
    await runStartupHistoryScan(client);
  } catch (err) {
    console.error("❌ Error in runStartupHistoryScan:", err);
  }
});

// Minimal example for interactionCreate (slash commands)
// Keep your real handler; this is just a skeleton.
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  }
});

// ============================================================================
// Login
// ============================================================================

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ DISCORD_TOKEN is not set. Please configure it in your environment variables."
  );
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
