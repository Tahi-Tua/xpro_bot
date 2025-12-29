/**
 * Script to configure the Guest role channel permissions
 * Guests can view, read history, and react to messages in all public channels
 * Guests CANNOT send messages (read-only access + reactions)
 * 
 * Usage: node setup-guest-channels.js
 */

require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require("discord.js");
const { GUEST_ROLE_ID, PRIVATE_CHANNEL_IDS, PRIVATE_CATEGORY_IDS } = require("./config/channels");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Channels to skip (system/rules channels)
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

    console.log(`\n📋 Configuring Guest role permissions for guild: ${guild.name}\n`);

    // Find Guest role
    const guestRole = guild.roles.cache.get(GUEST_ROLE_ID);
    if (!guestRole) {
      console.error(`❌ Guest role with ID "${GUEST_ROLE_ID}" not found!`);
      process.exit(1);
    }

    console.log(`✅ Found Guest role: ${guestRole.name} (ID: ${guestRole.id})\n`);

    // Collect all private channels and categories to exclude
    const privateChannels = new Set(PRIVATE_CHANNEL_IDS || []);
    const privateCategories = new Set(PRIVATE_CATEGORY_IDS || []);

    // Get all text channels
    const textChannels = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement
    );

    console.log(`🔧 Configuring Guest access on ${textChannels.size} text channels...\n`);

    let configured = 0;
    let skipped = 0;

    for (const [, channel] of textChannels) {
      const name = channel.name.toLowerCase();

      // Skip system/rules channels
      if (SKIP_CHANNELS.has(name)) {
        console.log(`⏭️  Skipped #${channel.name} (system channel)`);
        skipped++;
        continue;
      }

      // Skip private channels
      if (privateChannels.has(channel.id)) {
        console.log(`⏭️  Skipped #${channel.name} (private channel)`);
        skipped++;
        continue;
      }

      // Skip channels in private categories
      if (channel.parentId && privateCategories.has(channel.parentId)) {
        console.log(`⏭️  Skipped #${channel.name} (in private category)`);
        skipped++;
        continue;
      }

      try {
        // Apply Guest permissions: view, read history, react; NO messages
        await channel.permissionOverwrites.edit(guestRole, {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.ReadMessageHistory]: true,
          [PermissionFlagsBits.AddReactions]: true,

          [PermissionFlagsBits.SendMessages]: false,
          [PermissionFlagsBits.AttachFiles]: false,
          [PermissionFlagsBits.EmbedLinks]: false,
          [PermissionFlagsBits.CreatePublicThreads]: false,
          [PermissionFlagsBits.CreatePrivateThreads]: false,
          [PermissionFlagsBits.SendMessagesInThreads]: false,
        });

        console.log(`✅ #${channel.name} - Guest access configured (view only)`);
        configured++;
      } catch (error) {
        console.log(`⚠️  #${channel.name} - Error: ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ GUEST CONFIGURATION COMPLETE!");
    console.log("=".repeat(60));
    console.log(`\n📊 Results:`);
    console.log(`   ✅ Configured: ${configured} channels`);
    console.log(`   ⏭️  Skipped: ${skipped} channels`);
    console.log("\n📌 Guest role permissions:");
    console.log("   ✅ Can view all public channels");
    console.log("   ✅ Can read message history");
    console.log("   ✅ Can add reactions");
    console.log("   ❌ Cannot send messages");
    console.log("   ❌ Cannot create/reply to threads");
    console.log("   ❌ Cannot upload files or embed links");
    console.log("\n💡 To exclude more channels from Guest access:");
    console.log("   - Add their IDs to PRIVATE_CHANNEL_IDS in config/channels.js");
    console.log("   - Or add category IDs to PRIVATE_CATEGORY_IDS\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during setup:", error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
