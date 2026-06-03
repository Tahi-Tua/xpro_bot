const { Events, EmbedBuilder, PermissionsBitField, ChannelType } = require("discord.js");
const { HELLO_CHANNEL_ID, MOD_ROLE_NAME } = require("../config/channels");

async function getHelloChannel(guild) {
  const cachedChannel = guild.channels.cache.get(HELLO_CHANNEL_ID);
  if (cachedChannel) return cachedChannel;

  try {
    return await guild.channels.fetch(HELLO_CHANNEL_ID);
  } catch (err) {
    console.warn(
      `[memberLeave] Impossible de fetch HELLO_CHANNEL_ID=${HELLO_CHANNEL_ID}:`,
      err?.message || err,
    );
    return null;
  }
}

module.exports = (client) => {
  console.log(`[memberLeave] Handler chargé | HELLO_CHANNEL_ID=${HELLO_CHANNEL_ID}`);

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      console.log(
        `[memberLeave] Départ détecté: ${member.user?.tag || member.id} (${member.user?.id || member.id})`,
      );

      const helloChannel = await getHelloChannel(member.guild);

      if (!helloChannel) {
        console.warn(
          `[memberLeave] Salon welcome introuvable après cache+fetch: ${HELLO_CHANNEL_ID}`,
        );
        return;
      }

      if (helloChannel.type !== ChannelType.GuildText) {
        console.warn(
          `[memberLeave] Le salon configuré n'est pas un salon texte: ${helloChannel.id}`,
        );
        return;
      }

      const me = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
      const permissions = me?.permissionsIn(helloChannel);
      const canSend = permissions?.has(PermissionsBitField.Flags.SendMessages);
      const canEmbed = permissions?.has(PermissionsBitField.Flags.EmbedLinks);
      const canView = permissions?.has(PermissionsBitField.Flags.ViewChannel);

      if (!canView) {
        console.warn(
          `[memberLeave] Permission ViewChannel manquante dans le salon ${helloChannel.id}`,
        );
        return;
      }

      if (!canSend) {
        console.warn(
          `[memberLeave] Permission SendMessages manquante dans le salon ${helloChannel.id}`,
        );
        return;
      }

      if (!canEmbed) {
        console.warn(
          `[memberLeave] Permission EmbedLinks manquante dans le salon ${helloChannel.id}`,
        );
        return;
      }

      const staffRole = member.guild.roles.cache.find(
        (r) => r.name === MOD_ROLE_NAME,
      );

      if (!staffRole) {
        console.warn(`[memberLeave] Rôle staff introuvable: ${MOD_ROLE_NAME}`);
      }

      const diffDays = member.joinedTimestamp
        ? Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24))
        : null;

      const timeInServer = diffDays === null ? "Unknown" : `${diffDays} days`;

      const roles =
        member.roles.cache
          .filter((r) => r.id !== member.guild.id)
          .map((r) => r.name)
          .join(", ") || "No roles";

      const embed = new EmbedBuilder()
        .setColor(0xff3b3b)
        .setTitle("❌ Member Left the Server")
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "👤 User", value: `${member.user.tag}`, inline: true },
          { name: "🆔 ID", value: `${member.user.id}`, inline: true },
          { name: "🕒 Time in server", value: timeInServer, inline: true },
          { name: "🎭 Previous roles", value: roles.slice(0, 1024) },
        )
        .setFooter({ text: "Xavier Pro • Departure Log" })
        .setTimestamp();

      await helloChannel.send({
        content: staffRole ? `${staffRole}` : undefined,
        embeds: [embed],
      });

      console.log(
        `[memberLeave] Notification envoyée dans ${helloChannel.name} (${helloChannel.id})`,
      );
    } catch (err) {
      console.error("[memberLeave] Erreur notification départ:", err);
    }
  });
};
