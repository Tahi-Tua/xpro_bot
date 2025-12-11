require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs").promises;
const path = require("path");

// Use async/await for better performance and non-blocking I/O
(async () => {
  try {
    const commands = [];
    const foldersPath = path.join(__dirname, "commands");
    const commandFolders = await fs.readdir(foldersPath);

    for (const folder of commandFolders) {
      const commandsPath = path.join(foldersPath, folder);
      const commandFiles = (await fs.readdir(commandsPath)).filter(file => file.endsWith(".js"));

      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if (command.data) {
          commands.push(command.data.toJSON());
        }
      }
    }

    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    console.log("⏳ Déploiement DES COMMANDES sur TON SERVEUR…");

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log("✅ Commandes /slash installées INSTAMMENT sur ton serveur !");
  } catch (error) {
    console.error(error);
  }
})();
