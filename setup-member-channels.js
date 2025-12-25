/**
 * Script to automatically configure channel permissions for the member role
 * Gives members access to all channels and blocks @everyone
 * 
 * Usage: node setup-member-channels.js
 */

require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require("discord.js");
const { MEMBER_ROLE_NAME, MEMBER_ROLE_ID } = require("./config/channels");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Channels to skip (these should remain public or have special permissions)
const SKIP_CHANNELS = new Set([
  "rules",
  "welcome",
  "join-us",
  "join_us",
  "announcements",
]);

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error("❌ No guild found. Make sure the bot is in a server.");
      process.exit(1);
    }

    console.log(`\n📋 Configuring permissions for guild: ${guild.name}\n`);

    // Find the member role
    const memberRole = MEMBER_ROLE_ID
      ? guild.roles.cache.get(MEMBER_ROLE_ID)
      : guild.roles.cache.find((r) => r.name === MEMBER_ROLE_NAME);
    if (!memberRole) {
      console.error(`❌ Member role "${MEMBER_ROLE_NAME}" not found!`);
      process.exit(1);
    }

    console.log(`✅ Found member role: ${memberRole.name} (ID: ${memberRole.id})\n`);

    // Get all text channels
    const textChannels = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildText
    );

    console.log(`🔧 Configuring ${textChannels.size} text channels...\n`);

    let configured = 0;
    let skipped = 0;

    for (const [, channel] of textChannels) {
      // Skip certain channels
      if (SKIP_CHANNELS.has(channel.name.toLowerCase())) {
        console.log(`⏭️  Skipped #${channel.name} (system channel)`);
        skipped++;
        continue;
      }

      try {
        // Set @everyone deny
        await channel.permissionOverwrites.edit(guild.id, {
          [PermissionFlagsBits.ViewChannel]: false,
        });

        // Set member role allow
        await channel.permissionOverwrites.edit(memberRole, {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.SendMessages]: true,
          [PermissionFlagsBits.ReadMessageHistory]: true,
          [PermissionFlagsBits.EmbedLinks]: true,
          [PermissionFlagsBits.AttachFiles]: true,
          [PermissionFlagsBits.AddReactions]: true,
        });

        console.log(`✅ #${channel.name} - Configured`);
        configured++;
      } catch (error) {
        console.log(`⚠️  #${channel.name} - Error: ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ CONFIGURATION COMPLETE!");
    console.log("=".repeat(60));
    console.log(`\n📊 Results:`);
    console.log(`   ✅ Configured: ${configured} channels`);
    console.log(`   ⏭️  Skipped: ${skipped} channels`);
    console.log("\n📌 What was done:");
    console.log(`   • All text channels now deny @everyone viewing`);
    console.log(`   • All text channels now allow "${MEMBER_ROLE_NAME}" viewing`);
    console.log(`   • Accepted users will now see all channels automatically\n`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during setup:", error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
