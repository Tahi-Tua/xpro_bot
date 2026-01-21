require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const path = require("path");

const { BUG_REPORTS_CHANNEL_ID } = require("./config/channels");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(BUG_REPORTS_CHANNEL_ID);
    
    if (!channel) {
      console.error("❌ Bug Reports channel not found!");
      process.exit(1);
    }

    const introMessage = `**READ BEFORE REPORTING A BUG**

• Clearly describe the bug
• Add screenshots or screen recordings if possible
• Explain how to reproduce the bug
• Mention the device
• One bug per post
• Do not spam this channel`;

    // Check if it's a forum channel
    if (channel.type === ChannelType.GuildForum) {
      // Get available tags
      const availableTags = channel.availableTags;
      console.log("Available tags:", availableTags.map(t => `${t.name} (${t.id})`));
      
      // Use the first available tag, or create without if none required
      const appliedTags = availableTags.length > 0 ? [availableTags[0].id] : [];
      
      // Create a post in the forum
      const thread = await channel.threads.create({
        name: "📌 READ BEFORE REPORTING A BUG",
        message: {
          content: introMessage,
          files: [path.join(__dirname, "attached_assets", "bug_intro.png")],
        },
        appliedTags: appliedTags,
      });
      console.log("✅ Bug intro post created in forum successfully!");
    } else {
      // Regular text channel
      await channel.send({
        content: introMessage,
        files: [path.join(__dirname, "attached_assets", "bug_intro.png")],
      });
      console.log("✅ Bug intro message sent successfully!");
    }
  } catch (error) {
    console.error("❌ Error sending message:", error);
  }

  // Close the client after sending
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
