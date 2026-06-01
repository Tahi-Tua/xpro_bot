require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { loadSlashCommandPayloads } = require("./utils/slashCommandDeployer");

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

const commands = loadSlashCommandPayloads();

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
