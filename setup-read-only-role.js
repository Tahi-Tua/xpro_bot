/**
 * Script to configure the 'LECTURE SEULE' role with read-only permissions
 * Allows viewing, reading history, and reacting; denies sending messages and posting.
 *
 * Usage:
 *  1) Set DISCORD_TOKEN in your environment (.env or system env)
 *  2) Run: node setup-read-only-role.js
 */

require("dotenv" ).config();
const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require("discord.js");
const { READ_ONLY_ROLE_NAME } = require("./config/channels");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Channels to skip (optional safety list)
const SKIP_CHANNELS = new Set([
  "announcements", // often read-only already
  "rules",         // keep as-is
  "welcome",       // keep as-is
  "staff",         // avoid staff areas if named this way
]);

async function ensureReadOnlyRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === READ_ONLY_ROLE_NAME);
  if (role) {
    console.log(`✅ Found role: ${role.name} (${role.id})`);
    return role;
  }

  console.log(`🔧 Creating role '${READ_ONLY_ROLE_NAME}'...`);
  role = await guild.roles.create({
    name: READ_ONLY_ROLE_NAME,
    color: 0x808080,
    reason: "Read-only role managed by setup script",
  });
  console.log(`✅ Created role: ${role.name} (${role.id})`);
  return role;
}

async function configureTextChannel(channel, role) {
  // Allow viewing and reactions; deny message sending and common posting actions
  await channel.permissionOverwrites.edit(role, {
    [PermissionFlagsBits.ViewChannel]: true,
    [PermissionFlagsBits.ReadMessageHistory]: true,
    [PermissionFlagsBits.AddReactions]: true,

    [PermissionFlagsBits.SendMessages]: false,
    [PermissionFlagsBits.AttachFiles]: false,
    [PermissionFlagsBits.EmbedLinks]: false,

    // Threads
    [PermissionFlagsBits.CreatePublicThreads]: false,
    [PermissionFlagsBits.CreatePrivateThreads]: false,
    [PermissionFlagsBits.SendMessagesInThreads]: false,
  });
}

async function configureForumChannel(channel, role) {
  // Forum channels: allow viewing, deny creating posts/threads
  await channel.permissionOverwrites.edit(role, {
    [PermissionFlagsBits.ViewChannel]: true,
    [PermissionFlagsBits.ReadMessageHistory]: true,
    [PermissionFlagsBits.AddReactions]: true,

    [PermissionFlagsBits.SendMessages]: false,
    [PermissionFlagsBits.CreatePublicThreads]: false,
    [PermissionFlagsBits.CreatePrivateThreads]: false,
    [PermissionFlagsBits.SendMessagesInThreads]: false,
    [PermissionFlagsBits.CreatePosts]: false, // may be required on some servers
  }).catch(() => {});
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error("❌ No guild found. Make sure the bot is in a server.");
      process.exit(1);
    }

    console.log(`\n📋 Configuring read-only permissions for guild: ${guild.name}\n`);

    const readOnlyRole = await ensureReadOnlyRole(guild);

    const channels = guild.channels.cache;
    let configured = 0;
    let skipped = 0;

    for (const [, channel] of channels) {
      const name = (channel.name || "").toLowerCase();

      if (SKIP_CHANNELS.has(name)) {
        console.log(`⏭️  Skipped #${channel.name}`);
        skipped++;
        continue;
      }

      try {
        switch (channel.type) {
          case ChannelType.GuildText:
          case ChannelType.GuildAnnouncement:
            await configureTextChannel(channel, readOnlyRole);
            console.log(`✅ #${channel.name} - Read-only configured`);
            configured++;
            break;
          case ChannelType.GuildForum:
            await configureForumChannel(channel, readOnlyRole);
            console.log(`✅ 🗂️ ${channel.name} (forum) - Read-only configured`);
            configured++;
            break;
          default:
            // Skip voice, stage, categories, etc.
            break;
        }
      } catch (error) {
        console.log(`⚠️  #${channel.name} - Error: ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ READ-ONLY CONFIGURATION COMPLETE!");
    console.log("=".repeat(60));
    console.log(`\n📊 Results:`);
    console.log(`   ✅ Configured: ${configured} channels`);
    console.log(`   ⏭️  Skipped: ${skipped} channels`);
    console.log("\n📌 What was done:");
    console.log(`   • '${READ_ONLY_ROLE_NAME}' can view and react in text/forum channels`);
    console.log("   • Sending messages, attachments, links, and threads are denied");
    console.log("\nℹ️ You can adjust SKIP_CHANNELS in the script to exclude more channels.\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during setup:", error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
