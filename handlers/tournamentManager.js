const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
} = require("discord.js");

const stateFile = path.join(__dirname, "../data/tournamentState.json");
let saveQueue = Promise.resolve();
const tournamentLocks = new Map();

function loadTournamentState() {
  try {
    const data = fs.readFileSync(stateFile, "utf8");
    return JSON.parse(data || "{}");
  } catch {
    return {};
  }
}

function saveTournamentState(state) {
  saveQueue = saveQueue.then(() =>
    fsPromises.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8").catch((err) => {
      console.warn("[Tournament] Could not save state:", err.message);
    }),
  );
  return saveQueue;
}

function withTournamentLock(messageId, task) {
  const previous = tournamentLocks.get(messageId) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  const tracked = next.finally(() => {
    if (tournamentLocks.get(messageId) === tracked) {
      tournamentLocks.delete(messageId);
    }
  }).catch(() => {});

  tournamentLocks.set(messageId, tracked);
  return next;
}

function buildTournamentEmbed(tournament) {
  const participantCount = Object.keys(tournament.participants || {}).length;
  const maxPlayers = tournament.maxPlayers ? String(tournament.maxPlayers) : "No limit";
  const status = tournament.closed ? "Closed" : "Open";

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${tournament.name}`)
    .setDescription(tournament.description || "Tournament registration is open.")
    .setColor(tournament.closed ? "#777777" : "#F1C40F")
    .addFields(
      { name: "Status", value: status, inline: true },
      { name: "Registered", value: `${participantCount}/${maxPlayers}`, inline: true },
    )
    .setFooter({ text: "Use the buttons below to register or cancel your registration." })
    .setTimestamp(new Date(tournament.createdAt));

  if (tournament.dateText) {
    embed.addFields({ name: "Date", value: tournament.dateText, inline: true });
  }

  const participantNames = Object.values(tournament.participants || {})
    .slice(0, 20)
    .map((entry, index) => `${index + 1}. ${entry.displayName}`)
    .join("\n");

  if (participantNames) {
    embed.addFields({
      name: "Participants",
      value: participantNames,
      inline: false,
    });
  }

  return embed;
}

function buildTournamentButtons(messageId, closed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tournament_join_${messageId}`)
      .setLabel("Register")
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(`tournament_leave_${messageId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed),
  );
}

async function updateTournamentMessage(client, tournament) {
  const channel = await client.channels.fetch(tournament.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const message = await channel.messages.fetch(tournament.messageId).catch(() => null);
  if (!message) return;

  await message.edit({
    embeds: [buildTournamentEmbed(tournament)],
    components: [buildTournamentButtons(tournament.messageId, tournament.closed)],
  });
}

async function createTournament(interaction, { name, description, maxPlayers = 0, dateText = "" }) {
  const initialTournament = {
    name,
    description,
    maxPlayers,
    dateText,
    participants: {},
    closed: false,
    createdAt: Date.now(),
    createdBy: interaction.user.id,
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
  };

  const message = await interaction.channel.send({
    embeds: [buildTournamentEmbed(initialTournament)],
  });

  const tournament = {
    ...initialTournament,
    messageId: message.id,
  };

  await message.edit({
    embeds: [buildTournamentEmbed(tournament)],
    components: [buildTournamentButtons(message.id)],
  });

  const state = loadTournamentState();
  state[message.id] = tournament;
  await saveTournamentState(state);

  return tournament;
}

async function closeTournament(client, messageId) {
  const state = loadTournamentState();
  const tournament = state[messageId];
  if (!tournament) return null;

  tournament.closed = true;
  tournament.closedAt = Date.now();
  await saveTournamentState(state);
  await updateTournamentMessage(client, tournament);
  return tournament;
}

function listOpenTournaments() {
  return Object.values(loadTournamentState()).filter((tournament) => !tournament.closed);
}

async function handleTournamentButton(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("tournament_join_") && !interaction.customId.startsWith("tournament_leave_")) return;

  const isJoin = interaction.customId.startsWith("tournament_join_");
  const messageId = interaction.customId.replace(isJoin ? "tournament_join_" : "tournament_leave_", "");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await withTournamentLock(messageId, async () => {
    const state = loadTournamentState();
    const tournament = state[messageId];
    if (!tournament) return { error: "This tournament registration no longer exists." };
    if (tournament.closed) return { error: "This tournament registration is closed." };

    const participants = tournament.participants || {};
    const userId = interaction.user.id;

    if (isJoin) {
      if (participants[userId]) return { message: "You are already registered for this tournament." };

      const participantCount = Object.keys(participants).length;
      if (tournament.maxPlayers && participantCount >= tournament.maxPlayers) {
        return { error: "This tournament is full." };
      }

      participants[userId] = {
        userId,
        displayName: interaction.member?.displayName || interaction.user.username,
        username: interaction.user.username,
        registeredAt: Date.now(),
      };
    } else {
      if (!participants[userId]) return { message: "You were not registered for this tournament." };
      delete participants[userId];
    }

    tournament.participants = participants;
    await saveTournamentState(state);
    await updateTournamentMessage(interaction.client, tournament);

    return {
      message: isJoin
        ? "You are registered for this tournament."
        : "Your tournament registration has been cancelled.",
    };
  });

  await interaction.editReply({ content: result.error ? `❌ ${result.error}` : `✅ ${result.message}` });
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, handleTournamentButton);
};

module.exports.createTournament = createTournament;
module.exports.closeTournament = closeTournament;
module.exports.listOpenTournaments = listOpenTournaments;
module.exports.loadTournamentState = loadTournamentState;
module.exports.saveTournamentState = saveTournamentState;
