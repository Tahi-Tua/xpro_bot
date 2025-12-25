const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");
const { JOIN_US_CHANNEL_ID, LEADER_ROLE_ID, STAFF_ROLE_ID, PENDING_ROLE_ID, ADMIN_USER_ID } = require("../config/channels");
const { sendToTelegram } = require("../utils/telegram");
const { runJoinUsTicketDecision } = require("../utils/joinUsDecision");

// Track ticket creation in progress for each user to prevent race conditions
const creatingTickets = new Set();

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || !message.inGuild()) return;
      if (message.channel.id !== JOIN_US_CHANNEL_ID) return;

      // Prevent concurrent ticket creation for the same user.  If a ticket
      // creation is already underway, ignore subsequent messages until it
      // completes.  This helps avoid multiple tickets being created for the
      // same applicant due to race conditions.  We *only* add the user to
      // the `creatingTickets` set once we know we actually need to create
      // a ticket (i.e. after validation and duplicate checks) to avoid
      // blocking legitimate follow‑up messages when the first message was
      // invalid.
      if (creatingTickets.has(message.author.id)) {
        // Optionally notify the user that their application is being processed
        await message.author
          .send(
            "⚠️ Your application is already being processed. Please wait a moment."
          )
          .catch(() => {});
        return;
      }

      const hasAttachment = message.attachments.size > 0;
      const hasHttpLink = /(https?:\/\/[\S]+)/gi.test(message.content);
      const hasImageEmbed =
        message.embeds.length > 0 &&
        message.embeds.some((e) => e.type === "image" || e.thumbnail || e.image);

      const isValid = hasAttachment || hasHttpLink || hasImageEmbed;
      if (!isValid) {
        // If the message is invalid we don't want to lock the user in the
        // `creatingTickets` set.  Just delete the message and notify the user.
        await message.delete().catch(() => {});
        return message.author
          .send(
            "❌ Your message in **Join-Us** was removed.\n" +
              "Please send **screenshots** or an **official stats link** only.",
          )
          .catch(() => {});
      }

      const botReply = await message.reply(
        "🙏 Thank you for your information!\n" +
          "**Our administrators are now reviewing your application.**",
      );

      const admin = await client.users.fetch(ADMIN_USER_ID).catch(() => null);
      if (admin) {
        await admin
          .send(
            `📥 **New Join-Us Application**\n` +
              `From: **${message.author.tag}**\n` +
              `Channel: ${message.channel}\n` +
              `Time: ${new Date().toLocaleString()}`,
          )
          .catch(() => {});
      }

      const originalMessageId = message.id;
      const botReplyId = botReply.id;

      const existingTicket = message.guild.channels.cache.find((c) => c.topic === message.author.id);
      if (existingTicket) {
        return message.author
          .send(`⚠️ You already have an open ticket: ${existingTicket}.`)
          .catch(() => {});
      }

      // At this point we know we need to create a new ticket.  Add the
      // applicant to the set to prevent concurrent creation.  Use a try/finally
      // to ensure the lock is always released.
      creatingTickets.add(message.author.id);

      const guild = message.guild;
      const member = message.member;

      const pendingRole = guild.roles.cache.get(PENDING_ROLE_ID);
      if (pendingRole && !member.roles.cache.has(pendingRole.id)) {
        await member.roles.add(pendingRole).catch(() => {});
      }

      const leaderRole = guild.roles.cache.get(LEADER_ROLE_ID);
      const staffRole = guild.roles.cache.get(STAFF_ROLE_ID);
      if (!leaderRole && !staffRole) {
        console.log("❌ ERROR: Neither Leader nor Staff role found");
        creatingTickets.delete(message.author.id);
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("accept_app").setLabel("ACCEPT").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("deny_app").setLabel("DECLINE").setStyle(ButtonStyle.Danger),
      );

      // Build permission overwrites for the ticket
      const permissionOverwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        // Explicitly deny the applicant from viewing the ticket
        { 
          id: message.author.id, 
          deny: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ] 
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
          ],
        },
      ];
      // Add leader role permissions if exists
      if (leaderRole) {
        permissionOverwrites.push({
          id: leaderRole.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        });
      }
      // Add staff role permissions if exists
      if (staffRole) {
        permissionOverwrites.push({
          id: staffRole.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        });
      }

      const ticket = await guild.channels.create({
        name: `ticket-${message.author.username.slice(0, 10)}`,
        type: ChannelType.GuildText,
        topic: message.author.id,
        permissionOverwrites,
      });

      const roleMentions = [leaderRole ? `<@&${LEADER_ROLE_ID}>` : '', staffRole ? `<@&${STAFF_ROLE_ID}>` : ''].filter(Boolean).join(' ');
      const decisionMessage = await ticket.send({
        content: `📥 New application from **${message.author.tag}**\n${roleMentions} <@${ADMIN_USER_ID}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle("📝 New Application")
            .setDescription(
              "Review the candidate's screenshots and/or stats.\n\n" +
                "Once a decision is made, click **ACCEPT** or **DECLINE**.",
            ),
        ],
        components: [row],
      });

      // Send attachments or stats link (no automatic image analysis)
      if (message.attachments.size > 0) {
        await ticket.send({ files: [...message.attachments.values()] });
      } else {
        await ticket.send(`🔗 Stats link: ${message.content}`);
      }

      await ticket.send({
        content: `META_JOINUS:${message.channel.id}:${originalMessageId}:${botReplyId}`,
        allowedMentions: { parse: [] },
      });

      // Note: AI analysis and auto-acceptance removed. Decisions are manual via buttons.
    } catch (err) {
      console.log("❌ Error in Join-Us Ticket System:", err);
    } finally {
      // Always release the lock when finishing, regardless of success/failure
      creatingTickets.delete(message.author.id);
    }
  });
};
