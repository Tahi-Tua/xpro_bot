// Add this code to index.js after line 73 (after the closing brace of commands loading)

// Initialize Telegram File Notifier
try {
  const telegramNotifier = require("./utils/telegramFileNotifier");
  telegramNotifier.init();
  console.log("🚀 Telegram File Notifier started");
} catch (err) {
  console.warn("⚠️ Telegram notifier failed to start:", err.message);
  console.warn("Make sure node-telegram-bot-api is installed: npm install node-telegram-bot-api");
}
