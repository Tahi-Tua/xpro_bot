const {
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");

const { createSurvey } = require("../../handlers/surveyManager");

// Only these roles can create surveys (Leaders + Moderators)
const SURVEY_ALLOWED_ROLE_IDS = [
  "1380247716596023317", // ҲƤƦƠ ԼЄƛƊЄƦ 🌟
  "1380194646155726940", // Moderators
];

function isSupportedImageAttachment(attachment) {
  const contentType = attachment.contentType?.split(";")[0]?.toLowerCase();
  if (contentType) {
    return ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(contentType);
  }

  return /\.(png|jpe?g|gif|webp)$/i.test(attachment.name || attachment.url || "");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("survey")
    .setDescription("Create an open-answer survey. Responses are sent to the staff results channel.")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("The question to ask members.")
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration before auto-close (e.g. 1h, 24h, 7d, 2h30m). Default: 24h")
        .setRequired(false)
        .setMaxLength(10)
    )
    .addBooleanOption((option) =>
      option
        .setName("anonymous")
        .setDescription("Hide respondent names in the results channel? Default: false")
        .setRequired(false)
    )
    .addAttachmentOption((option) =>
      option
        .setName("image")
        .setDescription("Optional image to illustrate the question.")
        .setRequired(false)
    ),

  async execute(interaction) {
    // ── Permission check: Leaders or Moderators only ─────────────────
    const member = interaction.member;
    const hasPermission = SURVEY_ALLOWED_ROLE_IDS.some((id) => member.roles.cache.has(id));

    if (!hasPermission) {
      return interaction.reply({
        content: "❌ You do not have permission to create surveys. Leader or Moderator role required.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Collect options ──────────────────────────────────────────────
    const question = interaction.options.getString("question");
    const durationChoice = interaction.options.getString("duration") || "24h";
    const anonymous = interaction.options.getBoolean("anonymous") ?? false;
    const imageAttachment = interaction.options.getAttachment("image") || null;

    // ── Validate image format if provided ────────────────────────────
    if (imageAttachment && !isSupportedImageAttachment(imageAttachment)) {
      return interaction.reply({
        content: "❌ Invalid file type. Please attach an image (PNG, JPG, GIF, or WEBP).",
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Validate duration format ─────────────────────────────────────
    const durationRegex = /^(\d+\s*h(?:\s*\d+\s*m)?|\d+\s*m)$/i;
    const validPresets = ["1h", "6h", "12h", "24h", "48h", "7d"];
    if (!durationRegex.test(durationChoice) && !validPresets.includes(durationChoice)) {
      return interaction.reply({
        content: "❌ Invalid duration format. Use formats like: `1h`, `24h`, `7d`, `2h30m`, `30m`.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ── Create the survey ────────────────────────────────────────────
    await createSurvey(interaction, question, durationChoice, anonymous, imageAttachment);
  },
};
