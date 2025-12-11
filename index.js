require("dotenv").config();
const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  Collection
} = require("discord.js");

// =======================================================
// CLIENT INIT
// =======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Initialize command collection
client.commands = new Collection();

// Load commands from the commands folder
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property.`);
    }
  }
}

// =======================================================
// CHANNEL IDs
// =======================================================

const RULES_CHANNEL_ID = "1446260018239504569";        // ðŸŒ xpro-induction
const HELLO_CHANNEL_ID = "1446691799098724422";        // ðŸ‘‹ hello-goodbye
const WELCOME_CHANNEL_ID = "1360688633450991848";      // â”œãƒ»ðŸŽ±ãƒ»sÊÉ´á´…-Ê€á´‡Ç«á´œÉªÊ€á´‡á´á´‡É´á´›
const JOIN_US_CHANNEL_ID = "1446705932154310666";      // â””ãƒ»ðŸ’Œãƒ»á´Šá´ÉªÉ´-á´œs
const GENERAL_CHAT_ID = "1446982884949885050";         // â”Œãƒ»ðŸ—£ï¸ãƒ»general-chat
const SCREENSHOTS_CHANNEL_ID = "1446986224660250917";  // â”œãƒ»ðŸ–¼ãƒ»screenshots
const DIVINE_TIPS_CHANNEL_ID = "1447004548202893362";  // â”Œãƒ»âœŠãƒ»divine-tips

const STAFF_LOG_CHANNEL_ID = "1446962899019894915";    // ðŸ›¡ logs staff

// =======================================================
// ROLES
// =======================================================

const MEMBER_ROLE_NAME = "Membre";
const MOD_ROLE_NAME = "xpro leader";
const PENDING_ROLE_ID = "1446841690663944316"; // ðŸ•’ En attente

// Cache for frequently accessed roles and channels to reduce repeated lookups
const cache = {
  roles: {},
  channels: {}
};

// Helper function to get cached or fetch role by name
function getRoleByName(guild, roleName) {
  if (cache.roles[roleName]) return cache.roles[roleName];
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (role) cache.roles[roleName] = role;
  return role;
}

// Helper function to get cached or fetch role by ID
function getRoleById(guild, roleId) {
  if (cache.roles[roleId]) return cache.roles[roleId];
  const role = guild.roles.cache.get(roleId);
  if (role) cache.roles[roleId] = role;
  return role;
}

// =======================================================
// BADWORDS & HELPERS
// =======================================================

// Cache badwords and pre-lowercase them for performance
const badwords = JSON.parse(fs.readFileSync("./utils/badwords.json", "utf8")).words.map(w => w.toLowerCase());

// Pre-compile regex pattern for faster matching
const badwordsPattern = new RegExp(badwords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

function containsBadWord(text) {
  if (!text) return false;
  // Use pre-compiled regex for O(1) average case instead of O(n) array iteration
  return badwordsPattern.test(text);
}

async function sendStaffLog(guild, embed) {
  const channel = guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);
  if (!channel) return;
  const staffRole = getRoleByName(guild, MOD_ROLE_NAME);
  await channel
    .send({
      content: staffRole ? `${staffRole}` : "",
      embeds: [embed]
    })
    .catch(() => {});
}

// =======================================================
// WELCOME PAYLOAD (friendly welcome + server tour)
// =======================================================

function getWelcomePayload(member) {
  const joinUs = member.guild.channels.cache.get(JOIN_US_CHANNEL_ID);
  const joinUsMention = joinUs ? `${joinUs}` : `<#${JOIN_US_CHANNEL_ID}>`;

  const embed1 = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("ðŸŒŸ Welcome to Xavier Pro ðŸŒŸ")
    .setDescription(
      `Hello ${member} ðŸ‘‹\nWe're glad you're here! Here's how to get started:`
    )
    .addFields(
      {
        name: "ðŸšª Start here",
        value: [
          `â€¢ Read the rules: <#${RULES_CHANNEL_ID}>`,
          `â€¢ Say hi in introductions: <#${HELLO_CHANNEL_ID}>`
        ].join("\n")
      },
      {
        name: "ðŸŽ® Explore & share",
        value: [
          `â€¢ Chat with everyone: <#${GENERAL_CHAT_ID}>`,
          `â€¢ Post your highlights: <#${SCREENSHOTS_CHANNEL_ID}>`,
          `â€¢ Discover tips: <#${DIVINE_TIPS_CHANNEL_ID}>`
        ].join("\n")
      }
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  const embed2 = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(
      `Want to join the syndicate? Share your **screenshots & stats** anytime in ${joinUsMention}, and the team will review them.`
    );

  return {
    content: `ðŸŽ‰ Welcome ${member}! Make yourself at home.`,
    embeds: [embed1, embed2]
  };
}

// =======================================================
// READY â†’ ALL INTRO MESSAGES
// =======================================================

client.once(Events.ClientReady, async () => {
  console.log(`âœ… ${client.user.tag} is now online!`);

  // Fetch all channels in parallel for better performance
  const [rulesChannel, joinUsChannel, helloChannel, divineTipsChannel] = await Promise.all([
    client.channels.fetch(RULES_CHANNEL_ID).catch(() => null),
    client.channels.fetch(JOIN_US_CHANNEL_ID).catch(() => null),
    client.channels.fetch(HELLO_CHANNEL_ID).catch(() => null),
    client.channels.fetch(DIVINE_TIPS_CHANNEL_ID).catch(() => null)
  ]);

  // Store in cache for later use
  cache.channels.rules = rulesChannel;
  cache.channels.joinUs = joinUsChannel;
  cache.channels.hello = helloChannel;
  cache.channels.divineTips = divineTipsChannel;

  // ---------------------------
  // 1) Rules channel
  // ---------------------------
  if (!rulesChannel) {
    console.log("âŒ Cannot access rules channel.");
  } else {
    const messages = await rulesChannel.messages.fetch({ limit: 20 });
    const botMessages = messages.filter(m => m.author.id === client.user.id);
    if (botMessages.size > 0) {
      await rulesChannel.bulkDelete(botMessages).catch(() => {});
    }

    const rulesRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("accept_rules")
        .setLabel("âœ… Accept the rules")
        .setStyle(ButtonStyle.Success)
    );

    const rulesEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("ðŸ“œ Server Rules â€“ Xavier Pro")
      .setDescription(
        "**Welcome to the official Xavier Pro Discord server.**\n" +
          "Please read the rules carefully.\n\n" +
          "__General Rules__\n" +
          "â–« No insulting\n" +
          "â–« No doxxing or sharing private information\n" +
          "â–« No spam\n" +
          "â–« English only\n" +
          "â–« Discord name MUST match your in-game name\n\n" +
          "__Member Rules__\n" +
          "â–« Stay active\n" +
          "â–« More than 4 days inactive = kick\n" +
          "â–« Notify leaders if you need time off\n" +
          "â–« Must participate in SVS\n" +
          "â–« No toxic behavior\n\n" +
          "**Press the button below to accept the rules.**"
      )
      .setFooter({ text: "Xavier Pro â€¢ Verification System" })
      .setTimestamp();

    await rulesChannel.send({ embeds: [rulesEmbed], components: [rulesRow] });
    console.log("ðŸ“˜ Rules message sent.");
  }

  // ---------------------------
  // 2) Join-Us intro
  // ---------------------------
  if (!joinUsChannel) {
    console.log("âŒ Cannot access Join-Us channel.");
  } else {
    const oldMsgs = await joinUsChannel.messages.fetch({ limit: 20 });
    const botMsgs = oldMsgs.filter(msg => msg.author.id === client.user.id);
    if (botMsgs.size > 0) {
      await joinUsChannel.bulkDelete(botMsgs).catch(() => {});
    }

    const introEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("ðŸ“¥ Admission â€“ Submit your stats")
      .setDescription(
        "Welcome! To apply, please send **your game screenshots** or a **valid official stats link**.\n\n" +
          "âš  **No chatting in this channel** â€“ only admission information.\n" +
          "A private ticket will be created automatically for our staff."
      )
      .setFooter({ text: "Xavier Pro â€“ Recruitment System" })
      .setTimestamp();

    await joinUsChannel.send({ embeds: [introEmbed] });
    console.log("ðŸ“˜ Join-Us intro message sent.");
  }

  // ---------------------------
  // 3) Hello-goodbye intro
  // ---------------------------
  if (!helloChannel) {
    console.log("âŒ Cannot access hello-goodbye channel.");
  } else {
    const oldHello = await helloChannel.messages.fetch({ limit: 30 });
    const botHello = oldHello.filter(msg => msg.author.id === client.user.id);
    if (botHello.size > 0) {
      await helloChannel.bulkDelete(botHello).catch(() => {});
    }

    const helloEmbed = new EmbedBuilder()
      .setColor(0x00ff7f)
      .setTitle("ðŸ‘‹ Welcome & Goodbye")
      .setDescription(
        "Use this channel to say hello when you join and goodbye if you leave.\n" +
          "Staff will also see notifications when members leave the server."
      )
      .setFooter({ text: "Xavier Pro â€“ Hello/Goodbye" })
      .setTimestamp();

    await helloChannel.send({ embeds: [helloEmbed] });
    console.log("ðŸ“˜ Hello-goodbye intro message sent.");
  }

  // ---------------------------
  // 4) Divine-Tips strategy guide
  // ---------------------------
  if (!divineTipsChannel) {
    console.log("âŒ Cannot access divine-tips channel.");
  } else {
    const oldTips = await divineTipsChannel.messages.fetch({ limit: 10 });
    const botTips = oldTips.filter(m => m.author.id === client.user.id);
    if (botTips.size > 0) {
      await divineTipsChannel.bulkDelete(botTips).catch(() => {});
    }

    const tipsEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("ðŸ”¥ Key Strategies for Reaching Divine ðŸ”¥")
      .setDescription(
        "**Prioritize Contracts and Chests**\n" +
        "Focus on completing daily contracts and opening battle/skull chests to acquire coins, cards, and resources for upgrades.\n\n" +
        "**Join a Syndicate**\n" +
        "Team up to participate in events and sabotage modes, earning bonus points and faster progress.\n\n" +
        "**Strategically Upgrade Heroes**\n" +
        "Focus on your chosen heroes through common â†’ rare â†’ epic â†’ legendary â†’ mythic â†’ **Divine**.\n\n" +
        "**Utilize Joker Cards Wisely**\n" +
        "Use Joker cards on your preferred heroes as they apply to anyone, unlike random drops.\n\n" +
        "**Master Hero Abilities**\n" +
        "Learn effective usage of your heroes' abilities and their roles within the team.\n\n" +
        "**Develop Map Awareness**\n" +
        "Know spawn points, purple chests, hot zones, and choke points to anticipate movements.\n\n" +
        "**Practice Teamwork**\n" +
        "Coordinate, communicate, and secure objectives together.\n\n" +
        "__**Specific Hero Tips**__\n" +
        "â€¢ **Shenji**: Use grenades to zone enemies rather than just for damage.\n" +
        "â€¢ **Tess**: Use lightning balls for zoning and disrupting shields/abilities.\n" +
        "â€¢ **Raven/Cyclops**: Don't spam abilities early; save them for late-game impact.\n" +
        "â€¢ **SMG Users**: Use stimpacks offensively, not just for healing.\n" +
        "â€¢ **Drones**: Use them as shields or distractions in combat.\n\n" +
        "__**Additional Tips**__\n" +
        "â€¢ **Don't be Greedy**: Avoid risky looting or early engagements.\n" +
        "â€¢ **Learn to Disengage**: Fall back when fights are unfavorable.\n" +
        "â€¢ **Play During Events**: Maximize participation for valuable rewards.\n" +
        "â€¢ **Experiment**: Find the heroes and styles that suit you best."
      )
      .setFooter({ text: "Xavier Pro â€¢ Strategy Guide" })
      .setTimestamp();

    await divineTipsChannel.send({ embeds: [tipsEmbed] });
    console.log("ðŸ“˜ Divine-tips message sent.");
  }
});

// =======================================================
// BUTTON HANDLER â€“ ACCEPT RULES
// =======================================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "accept_rules") return;

  const guild = interaction.guild;
  const member = interaction.member;

  const role = getRoleByName(guild, MEMBER_ROLE_NAME);
  if (!role) {
    return interaction.reply({
      content: "âŒ Role 'Membre' not found. Please contact an administrator.",
      ephemeral: true
    });
  }

  if (member.roles.cache.has(role.id)) {
    return interaction.reply({
      content: "âœ” You already accepted the rules!",
      ephemeral: true
    });
  }

  return interaction.reply({
    content: "âœ… Rules accepted. Please follow the instructions in the recruitment channels.",
    ephemeral: true
  });
});

// =======================================================
// AUTO WELCOME MESSAGE IN WELCOME_CHANNEL
// =======================================================

client.on("guildMemberAdd", async member => {
  if (member.user.bot) return;
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel) return;

  const payload = getWelcomePayload(member);
  await channel.send(payload).catch(() => {});
});

// =======================================================
// JOIN-US â€“ TICKET SYSTEM WITH PENDING ROLE
// =======================================================

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot || !message.inGuild()) return;
    if (message.channel.id !== JOIN_US_CHANNEL_ID) return;

    const hasAttachment = message.attachments.size > 0;
    const hasHttpLink = /(https?:\/\/[^\s]+)/gi.test(message.content);
    const hasImageEmbed =
      message.embeds.length > 0 &&
      message.embeds.some(e => e.type === "image" || e.thumbnail || e.image);

    const isValid = hasAttachment || hasHttpLink || hasImageEmbed;

    if (!isValid) {
      await message.delete().catch(() => {});
      return message.author
        .send(
          "âŒ Your message in **Join-Us** was removed.\n" +
            "Please send **screenshots** or an **official stats link** only."
        )
        .catch(() => {});
    }

    const botReply = await message.reply(
      "ðŸ“¥ Thank you for your information!\n" +
        "**Our administrators are now reviewing your application.**"
    );

    const originalMessageId = message.id;
    const botReplyId = botReply.id;

    const existingTicket = message.guild.channels.cache.find(
      c => c.topic === message.author.id
    );
    if (existingTicket) {
      return message.author
        .send(`âŒ You already have an open ticket: ${existingTicket}.`)
        .catch(() => {});
    }

    const guild = message.guild;
    const member = message.member;

    const pendingRole = getRoleById(guild, PENDING_ROLE_ID);
    if (pendingRole && !member.roles.cache.has(pendingRole.id)) {
      await member.roles.add(pendingRole).catch(() => {});
    }

    const modRole = getRoleByName(guild, MOD_ROLE_NAME);
    if (!modRole) {
      console.log("âŒ ERROR: Moderator role not found:", MOD_ROLE_NAME);
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("accept_app")
        .setLabel("ACCEPT")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("deny_app")
        .setLabel("DECLINE")
        .setStyle(ButtonStyle.Danger)
    );

    const ticket = await guild.channels.create({
      name: `ticket-${message.author.username.slice(0, 10)}`,
      type: ChannelType.GuildText,
      topic: message.author.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: message.author.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: modRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks
          ]
        }
      ]
    });

    await ticket.send({
      content: `ðŸ“¥ New application from **${message.author.tag}**\n${modRole}`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle("ðŸ“ New Application")
          .setDescription(
            "Review the candidate's screenshots and/or stats.\n\n" +
              "Once a decision is made, click **ACCEPT** or **DECLINE**."
          )
      ],
      components: [row]
    });

    if (message.attachments.size > 0) {
      await ticket.send({ files: [...message.attachments.values()] });
    } else {
      await ticket.send(`ðŸ”— Stats link: ${message.content}`);
    }

    await ticket.send({
      content: `META_JOINUS:${message.channel.id}:${originalMessageId}:${botReplyId}`,
      allowedMentions: { parse: [] }
    });
  } catch (err) {
    console.log("âŒ Error in Join-Us Ticket System:", err);
  }
});

// =======================================================
// MOD DECISION â€“ ACCEPT / DECLINE APPLICATION
// =======================================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  if (!["accept_app", "deny_app"].includes(interaction.customId)) return;

  const moderator = interaction.user;
  const guild = interaction.guild;
  const channel = interaction.channel;
  const userId = channel.topic;

  if (!userId) {
    return interaction.reply({
      content: "âŒ No user linked to this ticket.",
      ephemeral: true
    });
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await interaction.message.edit({ components: [] }).catch(() => {});
    return interaction.reply({
      content: "âŒ The user has left the server.",
      ephemeral: true
    });
  }

  await interaction.message.edit({ components: [] }).catch(() => {});

  const pendingRole = getRoleById(guild, PENDING_ROLE_ID);
  if (pendingRole && member.roles.cache.has(pendingRole.id)) {
    await member.roles.remove(pendingRole).catch(() => {});
  }

  const metaMsg = (await channel.messages.fetch({ limit: 20 })).find(m =>
    m.content.startsWith("META_JOINUS:")
  );

  if (metaMsg) {
    const [, joinChannelId, userMsgId, botMsgId] = metaMsg.content.split(":");
    const joinChannel = guild.channels.cache.get(joinChannelId);

    if (joinChannel && joinChannel.isTextBased()) {
      // Fetch both messages in parallel for better performance
      const [userMsg, botMsg] = await Promise.all([
        joinChannel.messages.fetch(userMsgId).catch(() => null),
        joinChannel.messages.fetch(botMsgId).catch(() => null)
      ]);
      
      if (userMsg) await userMsg.delete().catch(() => {});
      if (botMsg) await botMsg.delete().catch(() => {});
    }
  }

  if (interaction.customId === "accept_app") {
    const memberRole = getRoleByName(guild, MEMBER_ROLE_NAME);
    if (memberRole && !member.roles.cache.has(memberRole.id)) {
      await member.roles.add(memberRole).catch(() => {});
    }

    await interaction.reply({
      content: `ðŸŸ© Application **ACCEPTED** by ${moderator}.`
    });

    member
      .send(
        "ðŸŽ‰ Your application has been **accepted**! Welcome to Xavier Pro!\n" +
          "You will be contacted if further steps are required."
      )
      .catch(() => {});
  }

  if (interaction.customId === "deny_app") {
    await interaction.reply({
      content: `ðŸŸ¥ Application **DECLINED** by ${moderator}.`
    });

    member
      .send(
        "âŒ Your application has been **declined**.\n" +
          "Thank you for your interest in Xavier Pro."
      )
      .catch(() => {});
  }

  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 5000);
});

// =======================================================
// HELLO-GOODBYE â€” MEMBER LEAVES
// =======================================================

client.on(Events.GuildMemberRemove, async member => {
  const helloChannel = member.guild.channels.cache.get(HELLO_CHANNEL_ID);
  if (!helloChannel) return;

  const staffRole = getRoleByName(member.guild, MOD_ROLE_NAME);

  const joinedAt = member.joinedTimestamp;
  const now = Date.now();
  const diffDays = Math.floor((now - joinedAt) / (1000 * 60 * 60 * 24));

  const roles =
    member.roles.cache
      .filter(r => r.id !== member.guild.id)
      .map(r => r.name)
      .join(", ") || "No roles";

  const embed = new EmbedBuilder()
    .setColor(0xff3b3b)
    .setTitle("âŒ Member Left the Server")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "ðŸ‘¤ User", value: `${member.user.tag}`, inline: true },
      { name: "ðŸ•’ Time in server", value: `${diffDays} days`, inline: true },
      { name: "ðŸŽ­ Previous roles", value: roles }
    )
    .setFooter({ text: "Xavier Pro â€¢ Departure Log" })
    .setTimestamp();

  await helloChannel.send({
    content: `${staffRole}`,
    embeds: [embed]
  });
});

// =======================================================
// GENERAL-CHAT : TEXTE UNIQUEMENT
// =======================================================

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.inGuild()) return;
  if (message.channel.id !== GENERAL_CHAT_ID) return;

  const hasAttachment = message.attachments.size > 0;
  const hasMediaEmbed =
    message.embeds.length > 0 &&
    message.embeds.some(e => e.type === "image" || e.video || e.thumbnail);

  if (!hasAttachment && !hasMediaEmbed) return;

  await message.delete().catch(() => {});

  message.author
    .send(
      "âš  In **general-chat**, only text discussions are allowed.\n" +
        "Please use the appropriate channels for images, screenshots or videos."
    )
    .catch(() => {});
});

// =======================================================
// SCREENSHOTS : MEDIAS OBLIGATOIRES
// =======================================================

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.inGuild()) return;
  if (message.channel.id !== SCREENSHOTS_CHANNEL_ID) return;

  const me = message.guild.members.me;
  const canDelete =
    me?.permissionsIn(message.channel).has(PermissionsBitField.Flags.ManageMessages);

  if (!canDelete) {
    console.log("Cannot enforce screenshots rule: missing ManageMessages permission.");
    return;
  }

  const hasAttachment =
    message.attachments.size > 0 &&
    message.attachments.some(att => {
      const type = att.contentType || "";
      return type.startsWith("image/") || type.startsWith("video/");
    });
  const hasMediaEmbed =
    message.embeds.length > 0 &&
    message.embeds.some(e => e.image || e.thumbnail || e.video || e.type === "image");
  const hasSticker = message.stickers?.size > 0;

  if (hasAttachment || hasMediaEmbed || hasSticker) return;

  await message.delete().catch(err => console.log("Delete failed in screenshots:", err));

  message.author
    .send(
      "âš  In **screenshots**, you must include at least one screenshot, image or video.\n" +
        "Please repost your message with the appropriate media attached."
    )
    .catch(() => {});
});

// =======================================================
// GLOBAL ANTI-INSULTES / TOXICITÃ‰
// =======================================================

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.inGuild()) return;

  const content = message.content || "";
  if (!containsBadWord(content)) return;

  await message.delete().catch(() => {});

  await message.author
    .send(
      "âš  Your message was removed because it either contained insults, inappropriate language or unapproved links\n" +
        "Please keep the chat respectful, or staff may take further action."
    )
    .catch(() => {});

  const logEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("ðŸš¨ Bad language detected")
    .addFields(
      { name: "User", value: `${message.author.tag} (${message.author.id})` },
      { name: "Channel", value: `${message.channel} (${message.channel.id})` },
      { name: "Message", value: content.slice(0, 1000) || "(empty)" }
    )
    .setTimestamp();

  await sendStaffLog(message.guild, logEmbed);

  console.log(
    `ðŸš¨ Bad word by ${message.author.tag} in #${message.channel.name}: ${content}`
  );
});

// =======================================================
// ANTI-SPAM SIMPLE (par utilisateur)
// =======================================================

const spamMap = new Map();

// Cleanup old spam entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  const windowMs = 8000;
  for (const [userId, data] of spamMap.entries()) {
    if (now - data.lastTs > windowMs * 2) {
      spamMap.delete(userId);
    }
  }
}, 300000); // 5 minutes

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.inGuild()) return;

  const now = Date.now();
  const windowMs = 8000;
  const maxMsgs = 5;

  const data = spamMap.get(message.author.id) || { count: 0, lastTs: now };
  if (now - data.lastTs > windowMs) {
    data.count = 1;
    data.lastTs = now;
  } else {
    data.count++;
    data.lastTs = now;
  }
  spamMap.set(message.author.id, data);

  if (data.count <= maxMsgs) return;

  await message.delete().catch(() => {});

  await message.author
    .send(
      "âš  You are sending messages too quickly. Please slow down.\n" +
        "Further spam may result in a mute or other sanctions."
    )
    .catch(() => {});

  const logEmbed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("ðŸš¨ Spam detected")
    .addFields(
      { name: "User", value: `${message.author.tag} (${message.author.id})` },
      { name: "Channel", value: `${message.channel} (${message.channel.id})` },
      { name: "Messages in window", value: `${data.count}` }
    )
    .setTimestamp();

  await sendStaffLog(message.guild, logEmbed);

  console.log(`ðŸš¨ Spam detected from ${message.author.tag}`);
});

// =======================================================
// SLASH COMMAND HANDLER
// =======================================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const replyMethod = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
    await interaction[replyMethod]({
      content: '❌ There was an error while executing this command!',
      ephemeral: true
    }).catch(() => {});
  }
});

// =======================================================
// LOGIN
// =======================================================

client.login(process.env.TOKEN);