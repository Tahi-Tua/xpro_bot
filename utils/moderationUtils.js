/**
 * Shared utilities for moderation handlers (badwords, spam, etc.)
 * Centralizes common functions to avoid code duplication.
 */

// Telegram message length limit (4096 chars). Use 4000 for safety margin.
const TELEGRAM_MAX_LENGTH = 4000;

// Zero-width characters that can be used to obfuscate text
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;

/**
 * Strip diacritics (accents) from text for normalization.
 * @param {string} str - Input string
 * @returns {string} String without diacritics
 */
function stripDiacritics(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}+/gu, "");
}

/**
 * Normalize symbols and whitespace in text.
 * Replaces common obfuscation symbols with spaces.
 * @param {string} str - Input string
 * @returns {string} Normalized string
 */
function normalizeSymbols(str) {
  return stripDiacritics(str || "")
    .replace(/[\u00A0]/g, " ") // non-breaking space
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/(?<=[a-z0-9])[!|](?=[a-z0-9])/gi, "i")
    .replace(/\*/g, "") // remove stars (for p**n -> pn)
    .replace(/[\-_. ,/\\+~=`'"()\[\]{}<>^%#!?;:|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert leetspeak characters to normal letters.
 * @param {string} str - Input string
 * @returns {string} String with leetspeak converted
 */
function normalizeLeetspeak(str) {
  return str
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3?]/g, "e")
    .replace(/4|@/g, "a")
    .replace(/5|\$/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g");
}

/**
 * Compress repeated characters to a maximum count.
 * Helps detect stretched text like "heeeeello" -> "heello"
 * @param {string} str - Input string
 * @param {number} maxRepeats - Maximum allowed consecutive repeats (default: 2)
 * @returns {string} Compressed string
 */
function compressRepeats(str, maxRepeats = 2) {
  return (str || "").replace(/(.)\1+/g, (match, ch) => {
    if (match.length === 2) return ch;
    if (match.length >= 5) return ch.repeat(Math.max(maxRepeats, 3));
    return ch.repeat(maxRepeats);
  });
}

/**
 * Full content normalization for spam detection.
 * Applies all normalization steps including leetspeak conversion.
 * @param {string} text - Input text
 * @returns {string} Fully normalized text
 */
function normalizeContentForSpam(text) {
  const lowered = (text || "").toLowerCase();
  const noDiacritics = stripDiacritics(lowered);
  const noSymbols = normalizeSymbols(noDiacritics);
  const leetFixed = normalizeLeetspeak(noSymbols);
  return compressRepeats(leetFixed).trim();
}

/**
 * Content normalization for badword detection.
 * Does NOT apply leetspeak conversion to reduce false positives.
 * @param {string} text - Input text
 * @returns {string} Normalized text
 */
function normalizeContentForBadwords(text) {
  const lowered = (text || "").toLowerCase();
  const withoutDiacritics = stripDiacritics(lowered);
  const withoutSymbols = normalizeSymbols(withoutDiacritics);
  return withoutSymbols;
}

/**
 * Build a Telegram message respecting the 4096 character limit.
 * Truncates content intelligently to fit within bounds.
 * @param {Object} parts - Message parts with metadata and content
 * @param {string} parts.prefix - Message prefix/title
 * @param {string} parts.author - Author name
 * @param {string} parts.authorId - Author Discord ID
 * @param {string} parts.channel - Channel name
 * @param {string} [parts.words] - Detected bad words (for badwords handler)
 * @param {string} [parts.violations] - Violation list (for spam handler)
 * @param {string} [parts.action] - Action taken
 * @param {string} parts.content - Message content
 * @returns {string} Message guaranteed to be under TELEGRAM_MAX_LENGTH
 */
function buildTelegramMessage(parts) {
  const {
    prefix = "",
    author = "",
    authorId = "",
    channel = "",
    words = "",
    violations = "",
    action = "",
    content = "",
  } = parts;

  const safeAuthor = escapeTelegramMarkdown(author.slice(0, 50));
  const safeAuthorId = escapeTelegramMarkdown(authorId);
  const safeChannel = escapeTelegramMarkdown(channel.slice(0, 50));
  const safePrefix = escapeTelegramMarkdown(prefix);

  let metadata = `${safePrefix}\n👤 ${safeAuthor} (${safeAuthorId})\n#️⃣ #${safeChannel}`;

  if (words) {
    metadata += `\n🔴 Words: ${escapeTelegramMarkdown(words.slice(0, 150))}`;
  }
  if (violations) {
    metadata += `\n⚠️ ${escapeTelegramMarkdown(violations.slice(0, 200))}`;
  }
  if (action) {
    metadata += `\n📝 Action: ${escapeTelegramMarkdown(action.slice(0, 100))}`;
  }

  metadata += "\n📄 ";

  // Calculate remaining space for content
  const safeContent = escapeTelegramMarkdown(content);
  const remainingSpace = TELEGRAM_MAX_LENGTH - metadata.length - 10; // 10 char safety

  // Truncate content to fit
  const truncatedContent =
    remainingSpace > 50
      ? safeContent.slice(0, remainingSpace) + (safeContent.length > remainingSpace ? "…" : "")
      : "(message too long)";

  return metadata + (truncatedContent || "(empty)");
}

/**
 * Escape special characters for Telegram Markdown.
 * @param {string} text - Input text
 * @returns {string} Escaped text
 */
function escapeTelegramMarkdown(text) {
  return String(text || "").replace(/([_*\[\]()`~>#+=|{}.!-])/g, "\\$1");
}

module.exports = {
  TELEGRAM_MAX_LENGTH,
  ZERO_WIDTH_REGEX,
  stripDiacritics,
  normalizeSymbols,
  normalizeLeetspeak,
  compressRepeats,
  normalizeContentForSpam,
  normalizeContentForBadwords,
  buildTelegramMessage,
  escapeTelegramMarkdown,
};
