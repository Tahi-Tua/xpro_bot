require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Get token from environment (Render) or .env (local)
const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error(
    "❌ Missing DISCORD_TOKEN in environment. Add it to Render Environment Variables or .env file.",
  );
  process.exit(1);
}

if (!clientId || !guildId) {
  console.error(
    [
      "❌ Missing CLIENT_ID and/or GUILD_ID.",
      "• CLIENT_ID = your application's ID",
      "• GUILD_ID  = the target server ID",
      "Add them to Render Environment Variables or .env file",
    ].join("\n"),
  );
  process.exit(1);
}

const commands = [];
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(
      `Deploying ${commands.length} command(s) to guild ${guildId} for application ${clientId}...`,
    );

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log("✅ Slash commands deployed successfully!");
  } catch (error) {
    console.error(error);
  }
})();
