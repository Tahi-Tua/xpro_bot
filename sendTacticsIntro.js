require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const path = require("path");

const { TACTICS_SUBMISSIONS_CHANNEL_ID } = require("./config/channels");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(TACTICS_SUBMISSIONS_CHANNEL_ID);
    
    if (!channel) {
      console.error("❌ Tactics Submissions channel not found!");
      process.exit(1);
    }

    const introMessage = `**READ BEFORE SUBMITTING A TACTIC**

• Clearly describe the tactic (in English only)
• Add screenshots or screen recordings if possible
• Explain in detail how the tactic works in-game
• Add a tag to better describe the tactic
• One tactic per post
• Do not spam this channel`;

    // Image path for the intro
    const imagePath = path.join(__dirname, "attached_assets", "tactics_intro.png");
    const hasImage = require("fs").existsSync(imagePath);
    console.log(`Image path: ${imagePath}, exists: ${hasImage}`);

    // Check if it's a forum channel
    if (channel.type === ChannelType.GuildForum) {
      // Get available tags
      const availableTags = channel.availableTags;
      console.log("Available tags:", availableTags.map(t => `${t.name} (${t.id})`));
      
      // Use the first available tag, or create without if none required
      const appliedTags = availableTags.length > 0 ? [availableTags[0].id] : [];
      
      // Build message options with image if available
      const messageOptions = { content: introMessage };
      if (hasImage) {
        messageOptions.files = [imagePath];
      }

      // Create a post in the forum
      const thread = await channel.threads.create({
        name: "📌 READ BEFORE SUBMITTING A TACTIC",
        message: messageOptions,
        appliedTags: appliedTags,
      });
      console.log("✅ Tactics intro post created in forum successfully!");
    } else {
      // Regular text channel
      const messageOptions = { content: introMessage };
      if (hasImage) {
        messageOptions.files = [imagePath];
      }
      await channel.send(messageOptions);
      console.log("✅ Tactics intro message sent successfully!");
    }
  } catch (error) {
    console.error("❌ Error sending message:", error);
  }

  // Close the client after sending
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
