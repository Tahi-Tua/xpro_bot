const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const projectRoot = path.join(__dirname, "..");
const commandsRoot = path.join(projectRoot, "commands");

function clearCommandCache(filePath) {
  const resolved = require.resolve(filePath);
  delete require.cache[resolved];
}

function loadSlashCommandPayloads() {
  const commands = [];

  if (!fs.existsSync(commandsRoot)) return commands;

  const commandFolders = fs
    .readdirSync(commandsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const folder of commandFolders) {
    const folderPath = path.join(commandsRoot, folder);
    const commandFiles = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith(".js"))
      .sort((a, b) => a.localeCompare(b));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      clearCommandCache(filePath);
      const command = require(filePath);

      if (!command?.data?.toJSON) {
        console.warn(`[SlashDeploy] Skipping ${filePath}: missing data.toJSON().`);
        continue;
      }

      commands.push(command.data.toJSON());
    }
  }

  return commands;
}

async function deployGuildSlashCommands(client, options = {}) {
  const token = process.env.DISCORD_TOKEN || process.env.TOKEN || client.token;
  const clientId = process.env.CLIENT_ID || client.application?.id || client.user?.id;
  const guildId = options.guildId || process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    console.warn("[SlashDeploy] Skipped: DISCORD_TOKEN, CLIENT_ID, or GUILD_ID is missing.");
    return { deployed: false, reason: "missing_config", count: 0 };
  }

  const commands = loadSlashCommandPayloads();
  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands },
  );

  console.log(`[SlashDeploy] Deployed ${commands.length} guild slash command(s) to ${guildId}.`);
  return { deployed: true, count: commands.length, guildId };
}

module.exports = {
  commandsRoot,
  deployGuildSlashCommands,
  loadSlashCommandPayloads,
};
