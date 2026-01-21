const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { SVS_REMINDER_CHANNEL_ID, SVS_ROLE_ID } = require("../config/channels");

// Desired local times (CET): 2:30, 7:30, 11:30, 16:00, 19:30, 23:30
// We use the server's local time (no UTC conversion)
const SVS_TIMES = [
  { hour: 2, minute: 30 },   // 2:30
  { hour: 6, minute: 30 },  // 06:30
  { hour: 10, minute: 30 }, // 10:30
  { hour: 15, minute: 0 },  // 15:00
  { hour: 18, minute: 30 }, // 18:30
  { hour: 22, minute: 30 }, // 22:30
];

const RESPONSE_TIMEOUT_MS = 20 * 60 * 1000;

const activePolls = new Map();
const sentToday = new Set();

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function createTeams(members, teamSize = 5) {
  const shuffled = shuffleArray(members);
  const teams = [];
  for (let i = 0; i < shuffled.length; i += teamSize) {
    teams.push(shuffled.slice(i, i + teamSize));
  }
  return teams;
}

function getTimeKey(hour, minute) {
  const today = new Date().toDateString();
  return `${today}-${hour}:${minute}`;
}

function resetDailyTracking() {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    sentToday.clear();
    console.log("🔄 SVS daily tracking reset");
  }
}

async function sendReminder(channel, customTimeout = null) {
  const timeout = customTimeout || RESPONSE_TIMEOUT_MS;
  const timeoutMinutes = Math.round(timeout / 60000);
  
  const embed = new EmbedBuilder()
    .setColor(0xff6b00)
    .setTitle("⚔️ SVS Reminder")
    .setDescription(
      "**Come on guys, get ready for the next SVS!**\n\n" +
      "Click a button to indicate your availability.\n" +
      `Teams will be formed in **${timeoutMinutes} minute${timeoutMinutes > 1 ? 's' : ''}**.`
    )
    .setFooter({ text: "Xavier Pro • SVS System" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("svs_yes")
      .setLabel("✅ Yes, I'm available")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("svs_no")
      .setLabel("❌ No, not available")
      .setStyle(ButtonStyle.Danger)
  );

  const message = await channel.send({ 
    content: `<@&${SVS_ROLE_ID}>`,
    embeds: [embed], 
    components: [row] 
  });

  const pollData = {
    messageId: message.id,
    channelId: channel.id,
    yes: new Map(),
    no: new Map(),
    startTime: Date.now(),
  };

  activePolls.set(message.id, pollData);

  setTimeout(() => finalizePoll(channel, message.id), timeout);

  console.log(`📢 SVS reminder sent in #${channel.name}`);
  return message;
}

async function finalizePoll(channel, messageId) {
  const pollData = activePolls.get(messageId);
  if (!pollData) return;

  activePolls.delete(messageId);

  const yesMembers = Array.from(pollData.yes.values());
  const noMembers = Array.from(pollData.no.values());

  try {
    const originalMessage = await channel.messages.fetch(messageId);
    if (originalMessage) {
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("svs_yes_disabled")
          .setLabel(`✅ Yes (${yesMembers.length})`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("svs_no_disabled")
          .setLabel(`❌ No (${noMembers.length})`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
      await originalMessage.edit({ components: [disabledRow] });
    }
  } catch (err) {
    console.log("Could not update original message:", err.message);
  }

  let resultEmbed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("📊 SVS Results")
    .setTimestamp();

  if (yesMembers.length === 0) {
    resultEmbed.setDescription("No members available for this SVS.");
  } else {
    const teams = createTeams(yesMembers, 5);
    
    let teamsDescription = `**${yesMembers.length} members available**\n\n`;
    
    teams.forEach((team, index) => {
      teamsDescription += `**Team ${index + 1}** (${team.length} members)\n`;
      team.forEach((member) => {
        teamsDescription += `• ${member.displayName}\n`;
      });
      teamsDescription += "\n";
    });

    if (noMembers.length > 0) {
      teamsDescription += `\n**Not available:** ${noMembers.length} member(s)`;
    }

    resultEmbed.setDescription(teamsDescription);
  }

  resultEmbed.setFooter({ text: "Xavier Pro • SVS Teams" });

  await channel.send({ embeds: [resultEmbed] });
  console.log(`📊 SVS poll finalized: ${yesMembers.length} yes, ${noMembers.length} no`);
}

function scheduleNextCheck() {
  const now = new Date();
  const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  return msUntilNextMinute;
}

function scheduleReminders(client) {
  const checkAndSend = async () => {
    resetDailyTracking();
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    for (const time of SVS_TIMES) {
      if (currentHour === time.hour && currentMinute === time.minute) {
        const timeKey = getTimeKey(time.hour, time.minute);
        
        if (sentToday.has(timeKey)) {
          console.log(`⏭️ SVS reminder already sent for ${time.hour}:${String(time.minute).padStart(2, '0')}`);
          break;
        }
        
        const channel = client.channels.cache.get(SVS_REMINDER_CHANNEL_ID);
        if (channel) {
          sentToday.add(timeKey);
          await sendReminder(channel);
          console.log(`✅ SVS sent at exactly ${currentHour}:${String(currentMinute).padStart(2, '0')}`);
        } else {
          console.log("❌ SVS reminder channel not found:", SVS_REMINDER_CHANNEL_ID);
        }
        break;
      }
    }
  };

  const startScheduler = () => {
    checkAndSend();
    
    const msUntilNextMinute = scheduleNextCheck();
    setTimeout(() => {
      checkAndSend();
      setInterval(checkAndSend, 60 * 1000);
    }, msUntilNextMinute);
  };

  startScheduler();
  
  const timesFormatted = SVS_TIMES.map(t => `${t.hour}:${String(t.minute).padStart(2, '0')}`).join(", ");
  console.log(`⏰ SVS scheduler started - Times: ${timesFormatted}`);
}

module.exports = (client) => {
  client.on(Events.ClientReady, () => {
    scheduleReminders(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user, member, message } = interaction;

    if (customId !== "svs_yes" && customId !== "svs_no") return;

    const pollData = activePolls.get(message.id);
    if (!pollData) {
      try {
        await interaction.reply({
          content: "⏰ This poll has ended.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.log("Poll interaction expired, skipping...");
      }
      return;
    }

    const memberInfo = {
      id: user.id,
      tag: user.tag,
      displayName: member?.displayName || user.username,
    };

    pollData.yes.delete(user.id);
    pollData.no.delete(user.id);

    if (customId === "svs_yes") {
      pollData.yes.set(user.id, memberInfo);
      try {
        await interaction.reply({
          content: "✅ You are registered as **available** for SVS!",
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.log("Could not reply to SVS interaction:", err.message);
      }
    } else {
      pollData.no.set(user.id, memberInfo);
      try {
        await interaction.reply({
          content: "❌ You are registered as **not available** for SVS.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        console.log("Could not reply to SVS interaction:", err.message);
      }
    }

    console.log(`📝 SVS response: ${user.tag} clicked ${customId === "svs_yes" ? "Yes" : "No"}`);
  });
};

module.exports.sendReminder = sendReminder;
