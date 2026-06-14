const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require("discord.js");

function getHubUrl() {
  const url = process.env.MEMBER_HUB_URL || "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hub")
    .setDescription("Open the private XPRO Member Hub."),

  async execute(interaction) {
    const hubUrl = getHubUrl();
    if (!hubUrl) {
      return interaction.reply({
        content: "❌ XPRO Member Hub is not configured yet. Set `MEMBER_HUB_URL` in Render.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("XPRO Member Hub")
      .setDescription("Private space for accepted XPRO members: profile, guides, events, leaderboard, and useful links.")
      .setColor("#38BDF8")
      .addFields(
        {
          name: "How to use it",
          value: [
            "1. Open the hub and sign in with your member email.",
            "2. Complete your member profile.",
            "3. Check guides, events, links, and the current leaderboard.",
          ].join("\n"),
        },
        {
          name: "Access",
          value: "Reserved for accepted XPRO members. If you cannot enter, contact staff.",
        },
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Open Member Hub")
        .setStyle(ButtonStyle.Link)
        .setURL(hubUrl),
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
