require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

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

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!process.env.TOKEN) {
      console.error(
        "❌ Missing TOKEN in environment. Add your bot token to .env (TOKEN=...).",
      );
      process.exit(1);
    }

    if (!clientId || !guildId) {
      console.error(
        [
          "❌ Missing CLIENT_ID and/or GUILD_ID.",
          "• CLIENT_ID = your application's ID (same as 'bot user' ID in Developer Portal)",
          "• GUILD_ID  = the target server ID",
          "Set them in your .env file, e.g.:",
          "CLIENT_ID=123456789012345678",
          "GUILD_ID=123456789012345678",
        ].join("\n"),
      );
      process.exit(1);
    }

    console.log(
      `Deploying ${commands.length} command(s) to guild ${guildId} for application ${clientId}...`,
    );

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log("Slash commands deployed successfully!");
  } catch (error) {
    console.error(error);
  }
})();
