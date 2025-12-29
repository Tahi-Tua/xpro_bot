const TelegramBot = require('node-telegram-bot-api');

// Default parse mode for Telegram messages.  You can override this via
// TELEGRAM_PARSE_MODE in the environment.  Supported values include
// 'Markdown', 'HTML', etc.  Leaving it undefined will omit the
// parse_mode option entirely.
const DEFAULT_PARSE_MODE = process.env.TELEGRAM_PARSE_MODE || 'Markdown';

// Telegram bot credentials.  These must be defined in your environment or
// .env file.  No fallback values are provided here to avoid leaking
// credentials into version control.
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// Internal cached bot instance to reuse the same connection for multiple
// messages.  Created lazily on first use.
let telegramBotInstance = null;

/**
 * Send a formatted message to the configured Telegram chat.  If the bot
 * token or chat ID are not configured, the message is not sent and a
 * warning is logged.  The options object may include any valid
 * Telegram API parameters supported by node-telegram-bot-api, such as
 * parse_mode or reply_markup.
 *
 * @param {string} message The text of the message to send.
 * @param {object} [options] Additional options for the Telegram API.
 */
async function sendToTelegram(message, options = {}) {
  // Skip if TG_CHAT_ID is not set
  if (!TG_CHAT_ID) {
    console.warn('⚠️ TG_CHAT_ID not configured; cannot send Telegram message');
    return;
  }

  // Lazily create the bot when the first message is sent
  if (!telegramBotInstance) {
    try {
      telegramBotInstance = new TelegramBot(TG_BOT_TOKEN, { polling: false });
    } catch (err) {
      console.error('❌ Failed to create Telegram bot:', err.message);
      return;
    }
  }

  // Determine parse mode.  If options explicitly provides parse_mode,
  // respect it; otherwise use DEFAULT_PARSE_MODE if defined.  If neither
  // is specified, omit parse_mode entirely.
  const hasExplicitParseMode = Object.prototype.hasOwnProperty.call(options, 'parse_mode');
  const parseMode = hasExplicitParseMode ? options.parse_mode : DEFAULT_PARSE_MODE;
  const sendOptions = { ...options };
  if (parseMode) {
    sendOptions.parse_mode = parseMode;
  } else {
    delete sendOptions.parse_mode;
  }

  try {
    await telegramBotInstance.sendMessage(TG_CHAT_ID, message, sendOptions);
    console.log('✅ Telegram alert sent');
  } catch (err) {
    console.error('❌ Failed to send Telegram message:', err.message);
    // Attempt plain text fallback if a parse error occurs
    try {
      await telegramBotInstance.sendMessage(TG_CHAT_ID, message);
    } catch (retryErr) {
      console.error('❌ Telegram fallback failed:', retryErr.message);
    }
  }
}

module.exports = {
  sendToTelegram,
};