const { Events, EmbedBuilder } = require("discord.js");
const { HALL_OF_FAME_CHANNEL_ID } = require("../config/channels");

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author?.bot || !message.inGuild()) return;
    
    // Only listen to Hall of Fame channel
    if (message.channel.id !== HALL_OF_FAME_CHANNEL_ID) return;
    
    // Check if message mentions any users
    const mentionedUsers = message.mentions.users;
    if (mentionedUsers.size === 0) return;

    // Send congratulations DM to each mentioned user
    for (const [userId, user] of mentionedUsers) {
      // Don't send DM to bots or to the message author
      if (user.bot || user.id === message.author.id) continue;

      const embed = new EmbedBuilder()
        .setColor(0xFFD700) // Gold color
        .setTitle("🏆 CONGRATULATIONS! 🏆")
        .setDescription(
          `   \n\n` +
          `🎖️ Your exceptional skills and dedication to the development of the syndicate have earned you a place among the **BEST** of **Xavier Pro**!\n\n`
        )
        .addFields({ name: "📍 Channel", value: `<#${HALL_OF_FAME_CHANNEL_ID}>`, inline: true },
          { name: "🎯 Added by", value: `${message.author}`, inline: false }
        )
        .setThumbnail(message.guild.iconURL({ dynamic: true }))
        .setFooter({ text: "Xavier Pro • Hall of Fame", iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      try {
        await user.send({ embeds: [embed] });
        console.log(`✅ Hall of Fame congratulations sent to ${user.tag}`);
      } catch (error) {
        console.log(`❌ Could not send DM to ${user.tag} (DMs might be disabled)`);
      }
    }
  });
};
