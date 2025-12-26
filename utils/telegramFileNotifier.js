const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");

// The Telegram bot token **must** be provided via the environment.  A
// hard‑coded fallback value is intentionally omitted here to prevent
// accidental leakage of credentials.  Configure TG_BOT_TOKEN in your
// `.env` file or environment variables.
const BOT_TOKEN = process.env.TG_BOT_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID; // Must be set in .env - should be your personal Telegram user ID, not a bot ID
const PROJECT_ROOT = path.join(__dirname, "..");

// Limit the directories that are monitored for changes.  Watching the entire
// project recursively can lead to inadvertent disclosure of secrets or
// unnecessary noise.  We restrict monitoring to the core source
// directories.  Add additional directories here only if you need to track
// changes in those locations.
const WATCH_DIRS = [
  path.join(PROJECT_ROOT, "commands"),
  path.join(PROJECT_ROOT, "handlers"),
  path.join(PROJECT_ROOT, "config"),
  path.join(PROJECT_ROOT, "utils"),
];

// Root-level files that should also trigger Telegram updates when modified.
// Keeping this list explicit avoids watching the entire project root.
const WATCH_FILES = [
  path.join(PROJECT_ROOT, "index.js"),
  path.join(PROJECT_ROOT, "deploy-commands.js"),
  path.join(PROJECT_ROOT, "patch_index.js"),
  path.join(PROJECT_ROOT, "package.json"),
];
const STATE_FILE = path.join(__dirname, "..", "data", "telegramState.json"); // Persistent storage

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.env(\..*)?$/, // Ignore .env and variants
  /\.env\.example$/,
  /scanState\.json/,
  /heroState\.json/,
  /channelState\.json/,
  /telegramState\.json/, // Ignore our own state file
  /data[\/\\]/, // Ignore all files in data/ folder
  /attached_assets[\/\\]/, // Ignore attached asset images and other media
  /bot\.log/,
  /\.log$/,
  /package-lock\.json/,
  /\.DS_Store/,
  /Thumbs\.db/,
];

// Only send these file extensions
const ALLOWED_EXTENSIONS = [".js", ".json", ".txt", ".md", ".yml", ".yaml", ".xml"];

const SENSITIVE_PATTERNS = [
  /secret/i,
  /token/i,
  /credential/i,
  /password/i,
  /id_rsa/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\.cer$/i,
];

const watchedFiles = new Map(); // Track file modifications (timestamp)
const fileHashes = new Map(); // Track file content hashes (MD5)
const sentMessages = new Map(); // Track sent message IDs per file
const debounceTimers = new Map(); // Prevent duplicate sends
let stateLastUpdatedMs = 0;

const WATCH_DIR_NAMES = ["commands", "handlers", "config", "utils"];

function normalizeStateKey(key) {
  return String(key || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .trim();
}

function toStateKey(filePath) {
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  return normalizeStateKey(relativePath);
}

function tryExtractRelativeFromLegacyKey(legacyKey) {
  const normalized = normalizeStateKey(legacyKey);

  // Already relative?
  if (!/^[a-zA-Z]:\//.test(normalized) && !normalized.startsWith("/")) {
    return normalized;
  }

  // Legacy state stored absolute paths from a different folder.
  for (const dirName of WATCH_DIR_NAMES) {
    const marker = `/${dirName}/`;
    const idx = normalized.lastIndexOf(marker);
    if (idx !== -1) return normalized.slice(idx + 1);
  }

  return null;
}

// Load persistent state from file
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (data.lastUpdated) {
        const parsed = Date.parse(data.lastUpdated);
        if (!Number.isNaN(parsed)) stateLastUpdatedMs = parsed;
      }
      if (data.sentMessages) {
        Object.entries(data.sentMessages).forEach(([key, value]) => {
          const stateKey = tryExtractRelativeFromLegacyKey(key);
          if (!stateKey) return;
          sentMessages.set(stateKey, value);
        });
      }
      if (data.fileHashes) {
        Object.entries(data.fileHashes).forEach(([key, value]) => {
          const stateKey = tryExtractRelativeFromLegacyKey(key);
          if (!stateKey) return;
          fileHashes.set(stateKey, value);
        });
      }
      console.log(`📂 Loaded ${sentMessages.size} tracked files from state`);
    }
  } catch (err) {
    console.warn("⚠️ Could not load telegram state:", err.message);
  }
}

// Save persistent state to file
function saveState() {
  try {
    const nowIso = new Date().toISOString();
    const data = {
      sentMessages: Object.fromEntries(sentMessages),
      fileHashes: Object.fromEntries(fileHashes),
      lastUpdated: nowIso
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
    stateLastUpdatedMs = Date.parse(nowIso);
  } catch (err) {
    console.warn("⚠️ Could not save telegram state:", err.message);
  }
}

class TelegramFileNotifier {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;

    // Load previous state
    loadState();

    // Check if CHAT_ID is configured
    if (!CHAT_ID) {
      console.error("❌ TG_CHAT_ID not set in .env file!");
      console.log("📝 To fix:");
      console.log("   1. Message @userinfobot on Telegram to get your user ID");
      console.log("   2. Add to your .env file: TG_CHAT_ID=<your_user_id>");
      console.log("   3. Restart the bot");
      return;
    }

    // Check if BOT_TOKEN is configured
    if (!BOT_TOKEN) {
      console.error("❌ TG_BOT_TOKEN not set in .env file! Telegram notifications are disabled.");
      console.log("📝 To fix:");
      console.log("   1. Create a Telegram bot with @BotFather to obtain a token");
      console.log("   2. Add to your .env file: TG_BOT_TOKEN=<your_bot_token>");
      console.log("   3. Restart the bot");
      return;
    }

    // Security: Never log tokens or credentials, even partially. Only confirm they're configured.
    console.log(`🔍 Initializing Telegram notifier (token: configured, chat ID: ${CHAT_ID ? 'configured' : 'missing'})`);

    try {
      // File notifier only (no inbound polling handlers)
      this.bot = new TelegramBot(BOT_TOKEN, { polling: false });
      this.isInitialized = true;
      console.log("✅ Telegram File Notifier initialized successfully");
      this.startWatching();
    } catch (err) {
      console.error("❌ Failed to initialize Telegram bot:", err.message);
      console.error("Stack:", err.stack);
    }
  }

  shouldIgnore(filePath) {
    return IGNORE_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  isSensitiveFile(filePath) {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  startWatching() {
    // Send elegant startup message
    const startupMessage = `
🚀 *Xavier Pro Bot - File Monitor*
━━━━━━━━━━━━━━━━━━━━━━

✅ *Status:* Active
📁 *Watching:* \`${path.basename(PROJECT_ROOT)}\`
⏰ *Started:* ${new Date().toLocaleString('fr-FR')}

━━━━━━━━━━━━━━━━━━━━━━
_You will be notified when files are modified._
    `.trim();
    
    this.sendCustomMessage(startupMessage);

    // Ignore file changes for 3 seconds after startup (Node.js loads all files)
    const startupIgnorePeriod = 3000;
    const startupTime = Date.now();

    WATCH_DIRS.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        console.warn(`⚠️ Directory does not exist: ${dir}`);
        return;
      }

      try {
        fs.watch(
          dir,
          { recursive: true },
          (eventType, filename) => {
            if (!filename) return;

            const fullPath = path.join(dir, filename);
            if (this.shouldIgnore(fullPath)) return;

            // Ignore all changes during startup period
            if (Date.now() - startupTime < startupIgnorePeriod) {
              return;
            }

            // Debounce: wait 1 second before sending to avoid multiple sends
            const key = fullPath;
            if (debounceTimers.has(key)) {
              clearTimeout(debounceTimers.get(key));
            }

            const timer = setTimeout(() => {
              this.handleFileChange(fullPath, eventType);
              debounceTimers.delete(key);
            }, 1000);

            debounceTimers.set(key, timer);
          }
        );

        console.log(`👁️ Watching directory: ${dir}`);
      } catch (err) {
        console.error(`Failed to watch ${dir}:`, err.message);
      }
    });

    WATCH_FILES.forEach((filePath) => {
      if (!fs.existsSync(filePath)) return;

      try {
        fs.watch(filePath, (eventType) => {
          if (Date.now() - startupTime < startupIgnorePeriod) return;

          const key = filePath;
          if (debounceTimers.has(key)) {
            clearTimeout(debounceTimers.get(key));
          }

          const timer = setTimeout(() => {
            this.handleFileChange(filePath, eventType);
            debounceTimers.delete(key);
          }, 1000);

          debounceTimers.set(key, timer);
        });
      } catch (err) {
        console.error(`Failed to watch file ${filePath}:`, err.message);
      }
    });

    // Catch up on changes that happened while the bot was offline.
    setTimeout(() => {
      this.scanForOfflineChanges().catch((err) => {
        console.error("? Offline change scan failed:", err.message);
      });
    }, startupIgnorePeriod + 500);
  }

  isAllowedChat(chatId) {
    if (!CHAT_ID) return false;
    try {
      return String(chatId) === String(CHAT_ID);
    } catch {
      return false;
    }
  }

  registerAnalysisHandlers() {
    if (!this.bot) return;

    const handlePhoto = async (msg, fileId) => {
      if (!this.isAllowedChat(msg.chat.id)) return;

      const waiting = await this.bot
        .sendMessage(msg.chat.id, "?? Analyzing image...")
        .catch(() => null);

      try {
        const fileLink = await this.bot.getFileLink(fileId);
        const { analyzeGameStats, formatStats } = require("./telegramImageAnalyzer");
        const stats = await analyzeGameStats(fileLink);
        const summary = formatStats(stats);
        await this.bot.sendMessage(msg.chat.id, summary, { parse_mode: "Markdown" });
      } catch (err) {
        console.error("Telegram image analysis failed:", err.message);
        await this.bot.sendMessage(
          msg.chat.id,
          "?? Unable to analyze this image right now."
        );
      } finally {
        if (waiting) {
          await this.bot.deleteMessage(waiting.chat.id, waiting.message_id).catch(() => {});
        }
      }
    };

    // Photos sent directly
    this.bot.on("photo", async (msg) => {
      if (!msg.photo || msg.photo.length === 0) return;
      const best = msg.photo[msg.photo.length - 1]; // highest resolution
      await handlePhoto(msg, best.file_id);
    });

    // Documents that are images
    this.bot.on("document", async (msg) => {
      const mime = msg.document?.mime_type || "";
      if (!mime.startsWith("image/")) return;
      await handlePhoto(msg, msg.document.file_id);
    });
  }

  async handleFileChange(filePath, eventType) {
    if (!fs.existsSync(filePath)) return;

    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return;

      const fileName = path.basename(filePath);
      const fileExt = path.extname(filePath);

      console.log(`🔔 File change detected: ${fileName} (${eventType})`);

      // Only monitor allowed file types
      if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        console.log(`⏭️ Ignoring file type: ${fileExt}`);
        return;
      }

      // Check ignore patterns
      if (this.shouldIgnore(filePath)) {
        console.log(`⏭️ File ignored by pattern: ${fileName}`);
        return;
      }

      if (this.isSensitiveFile(filePath)) {
        console.log(`⏭️ Skipping sensitive file: ${fileName}`);
        return;
      }

      // Track last modification time to avoid sending on initial load
      const lastMtime = watchedFiles.get(filePath);
      const currentMtime = stat.mtimeMs;
      
      if (lastMtime && Math.abs(currentMtime - lastMtime) < 100) {
        console.log(`⏭️ Skipping duplicate event for: ${fileName}`);
        return;
      }
      
      watchedFiles.set(filePath, currentMtime);

      const fileContent = fs.readFileSync(filePath, "utf8");
      const fileSize = Buffer.byteLength(fileContent);

      // Calculate content hash to detect real changes
      const contentHash = crypto.createHash('md5').update(fileContent).digest('hex');
      const stateKey = toStateKey(filePath);
      const lastHash = fileHashes.get(stateKey);

      if (!lastHash) {
        // If the file is new (created after our last saved state), track it
        // but don't send it yet. Future modifications will be sent normally.
        const createdMs = Number.isFinite(stat.birthtimeMs) ? stat.birthtimeMs : stat.ctimeMs;

        if (!stateLastUpdatedMs || createdMs > stateLastUpdatedMs) {
          fileHashes.set(stateKey, contentHash);
          saveState();
          return;
        }

        // For offline scans, only send untracked files if they were modified
        // since our last saved state (e.g. newly-added watch targets).
        if (eventType === "offline-scan" && stat.mtimeMs <= stateLastUpdatedMs) {
          fileHashes.set(stateKey, contentHash);
          saveState();
          return;
        }

        // Otherwise: existing file, newly tracked -> treat as an update and send it.
      }
      
      if (lastHash === contentHash) {
        console.log(`⏭️ Skipping ${fileName} - content unchanged (hash match)`);
        return;
      }
      

      // Telegram file size limit: 50MB
      if (fileSize > 50 * 1024 * 1024) {
        console.warn(`⚠️ File too large to send: ${fileName}`);
        return;
      }

      // Prepare file info
      const relativeDir = path.relative(PROJECT_ROOT, path.dirname(filePath));
      const fileSizeKB = (fileSize / 1024).toFixed(2);
      const timestamp = new Date().toLocaleString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });

      // Send file with message above it (text first, then file immediately)
      if (fileSize < 20 * 1024 * 1024) {
        // 20MB threshold for file attachment
        try {
          // Delete old messages if they exist
          const oldMessageIds = sentMessages.get(stateKey);
          if (oldMessageIds) {
            try {
              await this.bot.deleteMessage(CHAT_ID, oldMessageIds.textMessageId).catch(() => {});
              await this.bot.deleteMessage(CHAT_ID, oldMessageIds.fileMessageId).catch(() => {});
              console.log(`🗑️ Deleted old messages for: ${fileName}`);
            } catch (delErr) {
              console.warn(`⚠️ Could not delete old messages:`, delErr.message);
            }
          }

          // Send info message first
          const message = `?? *File modified*\n\n?? *Path:* \`${relativeDir || 'root'}/${fileName}\`\n?? *Size:* ${fileSizeKB} KB\n? *Time:* ${timestamp}`;
          const textMsg = await this.bot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });
          
          // Then send file without caption (will appear right below)
          const fileMsg = await this.bot.sendDocument(CHAT_ID, filePath, {}, { filename: fileName });
          
          // Store message IDs for future deletion
          sentMessages.set(stateKey, {
            textMessageId: textMsg.message_id,
            fileMessageId: fileMsg.message_id
          });

          fileHashes.set(stateKey, contentHash);
          
          // Save state to persist across restarts
          saveState();
          
          console.log(`✅ File sent to Telegram: ${fileName} (${fileSize} bytes)`);
        } catch (fileErr) {
          console.error(`❌ Failed to send file ${fileName}:`, fileErr.message);
          await this.bot.sendMessage(CHAT_ID, `?? *Send error*\n\nFile: \`${fileName}\`\nError: ${fileErr.message}`, { parse_mode: "Markdown" });
        }
      } else {
        // File too large, send info only
        const message = `?? *File modified* ?? *(Too large)*\n\n?? \`${relativeDir || 'root'}/${fileName}\`\n?? ${fileSizeKB} KB\n? ${timestamp}`;
        
        await this.bot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });

        fileHashes.set(stateKey, contentHash);
        saveState();
        console.log(`⏭️ File ${fileName} info sent (too large to attach)`);
      }
    } catch (err) {
      console.error(`❌ Error handling file change for ${filePath}:`, err.message);
    }
  }

  async scanForOfflineChanges() {
    if (!this.bot) return;

    const pending = [];

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (this.shouldIgnore(fullPath)) continue;
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (entry.isFile()) pending.push(fullPath);
      }
    };

    for (const dir of WATCH_DIRS) {
      if (!fs.existsSync(dir)) continue;
      walk(dir);
    }

    for (const filePath of WATCH_FILES) {
      if (fs.existsSync(filePath)) pending.push(filePath);
    }

    // Newest first to keep Telegram more readable.
    pending.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });

    for (const filePath of pending) {
      try {
        const ext = path.extname(filePath);
        if (!ALLOWED_EXTENSIONS.includes(ext)) continue;
        if (this.isSensitiveFile(filePath)) continue;
        await this.handleFileChange(filePath, "offline-scan");
      } catch {}
    }
  }

  formatMessageForTelegram(message) {
    // Ensure proper UTF-8 encoding and handle special characters
    if (typeof message !== 'string') {
      message = String(message);
    }
    
    // Normalize Unicode characters
    message = message.normalize('NFC');
    
    return message;
  }

  async sendCustomMessage(message, filePathOpt = null) {
    if (!this.bot) {
      console.error("❌ Telegram bot not initialized");
      return;
    }

    try {
      // Format message for Telegram with proper UTF-8 encoding
      const formattedMessage = this.formatMessageForTelegram(message);
      
      await this.bot.sendMessage(CHAT_ID, formattedMessage, { 
        parse_mode: "Markdown",
      });

      if (filePathOpt && fs.existsSync(filePathOpt)) {
        // Use file path directly instead of Buffer
        const fileName = path.basename(filePathOpt);
        await this.bot.sendDocument(CHAT_ID, filePathOpt, {
          caption: `📄 ${fileName}`,
        });
      }

      console.log("✅ Custom message sent to Telegram");
    } catch (err) {
      console.error("❌ Failed to send custom message:", err.message);
    }
  }
}

const notifier = new TelegramFileNotifier();

module.exports = notifier;
