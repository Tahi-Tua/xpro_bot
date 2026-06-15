const { Events, EmbedBuilder, MessageFlags } = require("discord.js");
const { STAFF_LOG_CHANNEL_ID, MEMBER_ROLE_NAME, LEADER_ROLE_ID, STAFF_ROLE_ID, JOIN_US_CHANNEL_ID } = require("../config/channels");

const APPLICANT_ROLE_NAME = "Applicant"; // Role for users who accepted rules but not yet approved

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "accept_rules") return;

    try {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch (err) {
        // If we missed the 3s interaction window (often due to rate limits/REST backlog),
        // we can't respond anymore; just stop so we don't crash trying again.
        if (err?.code === 10062) return;
        throw err;
      }

      const guild = interaction.guild;
      const member = interaction.member;

      // Check if already a full member
      const memberRole = guild.roles.cache.find((r) => r.name === MEMBER_ROLE_NAME);
      const alreadyHasRole = memberRole && member.roles.cache.has(memberRole.id);

      // Find or check for Applicant role (intermediate role with limited access)
      let applicantRole = guild.roles.cache.find((r) => r.name === APPLICANT_ROLE_NAME);
      
      if (!alreadyHasRole) {
        // Give Applicant role (limited access - only Join-Us channel)
        if (applicantRole && !member.roles.cache.has(applicantRole.id)) {
          try {
            await member.roles.add(applicantRole);
            console.log(`✅ Added ${APPLICANT_ROLE_NAME} role to ${member.user.tag}`);
          } catch (err) {
            console.error("❌ Cannot add Applicant role:", err.message);
          }
        } else if (!applicantRole) {
          console.log(`⚠️ Role '${APPLICANT_ROLE_NAME}' not found. Please create it in Discord.`);
        }

        // New members already receive Guest on join. Applicant only marks users
        // who accepted rules and may want to apply to the syndicate.
      }

      const logChannel = await guild.channels
        .fetch(STAFF_LOG_CHANNEL_ID)
        .catch(() => null);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(alreadyHasRole ? 0xffaa00 : 0x00ff00)
          .setTitle(
            alreadyHasRole ? "🔄 Rules Button Clicked" : "✅ Rules Accepted",
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "👤 User", value: `${member.user.tag}`, inline: true },
            { name: "🆔 ID", value: `${member.user.id}`, inline: true },
            {
              name: "📌 Status",
              value: alreadyHasRole ? "Already a member" : "Rules accepted (awaiting staff approval)",
              inline: false,
            },
          )
          .setFooter({ text: "Xavier Pro • Verification System" })
          .setTimestamp();

        const leaderRole = guild.roles.cache.get(LEADER_ROLE_ID);
        const staffRole = guild.roles.cache.get(STAFF_ROLE_ID);
        const roleMentions = [leaderRole ? `<@&${LEADER_ROLE_ID}>` : '', staffRole ? `<@&${STAFF_ROLE_ID}>` : ''].filter(Boolean).join(' ');
        await logChannel
          .send({
            content: roleMentions,
            embeds: [logEmbed],
          })
          .catch((err) => {
            console.error(
              "❌ Error sending log to moderator-only channel:",
              err.message,
            );
          });
        console.log("📋 Rules button click logged for", member.user.tag);
      } else {
        console.log(
          "❌ Cannot find moderator-only channel with ID:",
          STAFF_LOG_CHANNEL_ID,
        );
      }

      if (alreadyHasRole) {
        return interaction.editReply({
          content: "✔ You already accepted the rules!",
        });
      }

      // Send confirmation message
      await interaction.editReply({
        content:
          "✅ Rules accepted!\n\n" +
          `📋 **[JOIN-US channel](https://discord.com/channels/${guild.id}/${JOIN_US_CHANNEL_ID})**\n\n` +
          "ℹ️ If you'd like to **apply to join the syndicate**, please send your **Player ID** and **account/hero screenshots** in the Join-Us channel.\n" +
          "You **do not** need to apply just to be a member of this server.",
      });

      // Send notification to JOIN_US channel
      const joinUsChannel = guild.channels.cache.get(JOIN_US_CHANNEL_ID);
      if (joinUsChannel) {
        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x00d4ff)
          .setTitle("🎯 Syndicate Application (Optional)")
          .setDescription(
            `Welcome, **${member.user}**!\n\n` +
            `This channel is **only** for players who want to **apply to join the syndicate**.\n\n` +
            `**What to send (only if applying):**\n` +
            `🆔 Your Player ID\n` +
            `📸 Screenshots (stats/heroes) **or** a valid official stats link\n\n` +
            `**What happens next:**\n` +
            `✅ Our staff will review your submission\n` +
            `🎉 If approved, a staff member will contact you\n` +
            `⏱️ Review typically takes a few hours`
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: "Xavier Pro • Recruitment System" })
          .setTimestamp();

        await joinUsChannel
          .send({
            content: `👋 ${member}`,
            embeds: [welcomeEmbed],
          })
          .catch((err) => {
            console.error("❌ Error sending JOIN_US notification:", err.message);
          });
      }
    } catch (error) {
      console.error("Error handling accept_rules button:", error);
      // If the interaction is already expired, there's nothing we can do.
      if (error?.code === 10062) return;

      const payload = {
        content: "❌ An error occurred. Please try again.",
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });
};
