/**
 * Enforce general chat policy: deny image uploads/attachments in GENERAL_CHAT_ID
 * Applies to Guest, Visitor, and Member roles; messages remain allowed.
 *
 * Usage:
 *   1) Ensure DISCORD_TOKEN is set (.env or environment)
 *   2) Run: node enforce-general-chat-policy.js
 */

require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { GENERAL_CHAT_ID, MEMBER_ROLE_NAME, MEMBER_ROLE_ID, GUEST_ROLE_ID, VISITOR_ROLE_NAME } = require("./config/channels");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error("❌ No guild found. Make sure the bot is in a server.");
      process.exit(1);
    }

    const channel = guild.channels.cache.get(GENERAL_CHAT_ID);
    if (!channel) {
      console.error(`❌ GENERAL_CHAT_ID ${GENERAL_CHAT_ID} not found in this guild.`);
      process.exit(1);
    }

    console.log(`\n📋 Enforcing policy on #${channel.name} (${channel.id})\n`);

    // Resolve roles
    const rolesToRestrict = [];

    // Member role
    const memberRole = MEMBER_ROLE_ID
      ? guild.roles.cache.get(MEMBER_ROLE_ID)
      : guild.roles.cache.find((r) => r.name === MEMBER_ROLE_NAME);
    if (memberRole) rolesToRestrict.push(memberRole);

    // Guest role
    if (GUEST_ROLE_ID) {
      const guestRole = guild.roles.cache.get(GUEST_ROLE_ID);
      if (guestRole) rolesToRestrict.push(guestRole);
    }

    // Visitor role
    const visitorRole = guild.roles.cache.find((r) => r.name === VISITOR_ROLE_NAME);
    if (visitorRole) rolesToRestrict.push(visitorRole);

    if (rolesToRestrict.length === 0) {
      console.warn("⚠️ No roles found to restrict in general chat.");
    }

    // First, allow @everyone to access the channel
    try {
      await channel.permissionOverwrites.edit(guild.id, {
        [PermissionFlagsBits.ViewChannel]: true,
        [PermissionFlagsBits.SendMessages]: true,
        [PermissionFlagsBits.ReadMessageHistory]: true,
        [PermissionFlagsBits.AddReactions]: true,
      });
      console.log(`✅ Applied access to @everyone`);
    } catch (err) {
      console.log(`⚠️ Could not update permissions for @everyone: ${err.message}`);
    }

    // Then apply restrictions to specific roles (no attachments/embeds)
    let updated = 0;
    for (const role of rolesToRestrict) {
      try {
        await channel.permissionOverwrites.edit(role, {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.ReadMessageHistory]: true,
          [PermissionFlagsBits.AddReactions]: true,
          [PermissionFlagsBits.SendMessages]: true,
          [PermissionFlagsBits.AttachFiles]: false,
          [PermissionFlagsBits.EmbedLinks]: false,
          [PermissionFlagsBits.CreatePublicThreads]: false,
          [PermissionFlagsBits.CreatePrivateThreads]: false,
          [PermissionFlagsBits.SendMessagesInThreads]: false,
        });
        console.log(`✅ Applied no-attachments to role ${role.name} (${role.id})`);
        updated++;
      } catch (err) {
        console.log(`⚠️ Could not update permissions for ${role.name}: ${err.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ GENERAL CHAT POLICY ENFORCED");
    console.log("=".repeat(60));
    console.log(`\n📊 Roles updated: ${updated}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error enforcing general chat policy:", error);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
