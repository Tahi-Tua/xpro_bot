/**
 * Script to set up the Visitor role with limited channel access
 * Run this once to configure permissions for declined applicants
 * 
 * Usage: node setup-visitor-role.js
 */

require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");

const VISITOR_ROLE_NAME = "Visitor";
const VISITOR_ROLE_COLOR = 0x95a5a6; // Gray color

// Channels that Visitor role should access
const VISITOR_CHANNELS = {
  TEAM_SEARCH: "1381575870468198460",
  CLIPS: "1381581265542844496",
  SCREENSHOTS: "1381575518532534402",
  BALANCE_CHANGES: "1427088947871223848",
  MEMES: "1381575710942167101",
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error("❌ No guild found. Make sure the bot is in a server.");
      process.exit(1);
    }

    console.log(`\n📋 Configuring permissions for guild: ${guild.name}\n`);

    // Step 1: Create or find Visitor role
    let visitorRole = guild.roles.cache.find((r) => r.name === VISITOR_ROLE_NAME);
    
    if (!visitorRole) {
      console.log("🔧 Creating 'Visitor' role...");
      visitorRole = await guild.roles.create({
        name: VISITOR_ROLE_NAME,
        color: VISITOR_ROLE_COLOR,
        reason: "Role for declined applicants with limited access",
      });
      console.log(`✅ Created role: ${visitorRole.name} (ID: ${visitorRole.id})`);
    } else {
      console.log(`✅ Found existing role: ${visitorRole.name} (ID: ${visitorRole.id})`);
    }

    // Step 2: Configure permissions for each visitor channel
    console.log("\n🔧 Configuring channel permissions...\n");
    
    for (const [channelName, channelId] of Object.entries(VISITOR_CHANNELS)) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      
      if (!channel) {
        console.log(`⚠️  Channel ${channelName} (${channelId}) not found - skipping`);
        continue;
      }

      // Set permissions for Visitor role on this channel
      await channel.permissionOverwrites.edit(visitorRole, {
        [PermissionFlagsBits.ViewChannel]: true,
        [PermissionFlagsBits.SendMessages]: true,
        [PermissionFlagsBits.ReadMessageHistory]: true,
        [PermissionFlagsBits.EmbedLinks]: true,
        [PermissionFlagsBits.AttachFiles]: true,
        [PermissionFlagsBits.AddReactions]: true,
      });

      console.log(`✅ #${channel.name} - Visitor access granted`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ CONFIGURATION COMPLETE!");
    console.log("=".repeat(60));
    console.log("\n📌 Next steps:");
    console.log("1. Verify the Visitor role exists in your server");
    console.log("2. Check that the 5 channels have Visitor permissions");
    console.log("3. (IMPORTANT) Set @everyone permissions to deny 'View Channel'");
    console.log("   on channels you DON'T want visitors to access");
    console.log("4. Restart your bot with: npm start\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during setup:", error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
