/**
 * Rules content configuration
 * Edit this file to update the server rules.
 * The bot will automatically detect changes and update the message.
 */

const RULES_BANNER_FILENAME = "rules-banner.png";

const RULES_TITLE = "📜 XAVIER PRO SERVER RULES";

const RULES_DESCRIPTION = `Welcome to our server's guidelines and rules channel 📝

These rules are in place to ensure a respectful and inclusive environment for everyone. They apply to **all messages** you post on the server and your **Discord profile**.`;

const RULES_FIELDS = [
  {
    name: "🌐 Language",
    value: "This server represents an **English-speaking community** and welcomes players from all countries. Please use English and don't try to bypass our filters; they are in place for a reason.",
    inline: false,
  },
  {
    name: "💬 Appropriate Language",
    value: "Use respectful and considerate language. Remember that some words may be offensive if used in the wrong context.",
    inline: false,
  },
  {
    name: "⚠️ Sensitive Topics",
    value: "Avoid discussing serious subjects such as **politics**, **religion**, or other sensitive topics.",
    inline: false,
  },
  {
    name: "😀 Reactions",
    value: "Be careful with reactions. Any restricted content described above, created with emoji reactions, is also prohibited. Keep in mind that some reactions may be as offensive as some words in the wrong context.",
    inline: false,
  },
  {
    name: "🔊 Voice Channels",
    value: "Maintain cleanliness in voice channels. Avoid using voice changers or playing loud sounds or music. Changing voice channels frequently to cause disturbances is also not permitted.",
    inline: false,
  },
  {
    name: "🤖 Bot Monitoring",
    value: "**Note:** Spam messages and inappropriate expressions will be automatically recorded in your server history by our bot. Repeated violations may result in warnings, mutes, or bans.",
    inline: false,
  },
];

const RULES_FOOTER = "Xavier Pro • Click the button below to accept the rules";

const RULES_COLOR = 0x2b2d31; // Dark theme color

module.exports = {
  RULES_BANNER_FILENAME,
  RULES_TITLE,
  RULES_DESCRIPTION,
  RULES_FIELDS,
  RULES_FOOTER,
  RULES_COLOR,
};
