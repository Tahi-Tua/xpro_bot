const { AttachmentBuilder, SlashCommandBuilder } = require("discord.js");
const { getAllRankings } = require("../../utils/memberRankingStore");
const { buildScoreboardPngBuffer } = require("../../utils/memberRankingBoard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("boardpng")
    .setDescription("Send XPRO scoreboard as PNG image."),

  async execute(interaction) {
    await interaction.deferReply();
    const data = getAllRankings();
    const png = await buildScoreboardPngBuffer(data);
    const attachment = new AttachmentBuilder(png, { name: "xpro-scoreboard.png" });

    return interaction.editReply({
      content: "XPRO scoreboard",
      files: [attachment],
    });
  },
};
