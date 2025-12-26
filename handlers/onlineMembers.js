const {
  Events,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");
const { ONLINE_CATEGORY_ID } = require("../config/channels");

const ONLINE_CHANNEL_NAME = "online-members";
const MARKER = "[ONLINE_MEMBER_LIST]";
const UPDATE_INTERVAL_MS = 2 * 60 * 1000; // refresh every 2 minutes
const DEBOUNCE_MS = 15 * 1000;
const MAX_CARDS = 10; // max embeds per message (Discord limit)

const state = {
  channel: null,
  message: null,
  debounce: null,
  interval: null,
  nextFetchAt: 0,
};

function formatTag(member) {
  if (member.user?.discriminator && member.user.discriminator !== "0") {
    return `${member.user.username}#${member.user.discriminator}`;
  }
  return member.user?.tag || member.user?.username || "User";
}

async function ensureChannel(guild) {
  const category = await guild.channels.fetch(ONLINE_CATEGORY_ID).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    console.log("? ONLINE: Category not found or invalid:", ONLINE_CATEGORY_ID);
    return null;
  }

  let channel = guild.channels.cache.find(
    (ch) =>
      ch.parentId === category.id &&
      ch.type === ChannelType.GuildText &&
      ch.name === ONLINE_CHANNEL_NAME,
  );

  if (!channel) {
    channel = await guild.channels.create({
      name: ONLINE_CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: "List of members currently online",
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
          deny: [PermissionsBitField.Flags.SendMessages],
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
      ],
    });
    console.log(`? ONLINE: Channel created under the category ${category.name}`);
  }

  return channel;
}

async function findOrCreateMessage(channel) {
  const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
  let target =
    messages &&
    messages.find((m) => m.author.id === channel.client.user.id && m.content.includes(MARKER));

  if (!target) {
    target = await channel
      .send({ content: MARKER, embeds: [new EmbedBuilder().setDescription("Initializing...")] })
      .catch(() => null);
  }

  return target;
}

async function updateOnlineMessage(guild) {
  if (!state.channel) return;
  if (Date.now() < state.nextFetchAt) return;

  try {
    const members = guild.members.cache;

    // If cache is empty (e.g., right after startup), avoid forcing a fetch (which triggers opcode 8)
    if (members.size === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("Online members")
        .setDescription("? Presence data not yet available. Try again in a few seconds.")
        .setTimestamp();

      state.message = state.message || (await findOrCreateMessage(state.channel));
      if (state.message) {
        await state.message.edit({ content: MARKER, embeds: [embed] });
      }

      state.nextFetchAt = Date.now() + 15_000; // wait 15s before next attempt
      return;
    }

    const onlineMembers = members
      .filter(
        (m) =>
          !m.user.bot &&
          m.presence &&
          ["online", "dnd", "idle"].includes(m.presence.status),
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));

    const embeds = [];

    if (onlineMembers.size === 0) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("Online members (0)")
          .setDescription("No one is online at the moment.")
          .setTimestamp(),
      );
    } else {
      const membersArr = Array.from(onlineMembers.values());
      const hasOverflow = membersArr.length > MAX_CARDS;
      const cardsLimit = hasOverflow ? MAX_CARDS - 1 : MAX_CARDS; // keep one slot for overflow notice
      const cards = membersArr.slice(0, cardsLimit).map((member) => {
        const avatarUrl = member.displayAvatarURL({ dynamic: true, size: 64 });
        const name = member.displayName || member.user.username;
        const tag = formatTag(member);
        return new EmbedBuilder()
          .setColor(0x2ecc71)
          .setAuthor({ name: `🟢 ${name}`, iconURL: avatarUrl })
          .setDescription(tag);
      });

      if (cards.length > 0) {
        cards[0].setFooter({ text: `Total online: ${membersArr.length}` });
      }

      embeds.push(...cards);

      if (hasOverflow) {
        const remaining = membersArr.length - cardsLimit;
        embeds.push(
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setDescription(`🟢 ... et ${remaining} autres Online members`)
            .setTimestamp(),
        );
      }
    }

    state.message = state.message || (await findOrCreateMessage(state.channel));
    if (state.message) {
      await state.message.edit({ content: MARKER, embeds });
    }
  } catch (err) {
    const retry =
      (err?.retry_after || err?.retryAfter || 10000) +
      (Math.random() * 2000); // jitter
    state.nextFetchAt = Date.now() + retry;
    console.log(
      `? ONLINE: Error updating presences (${err?.message || err}); nouvelle tentative dans ${Math.round(retry / 1000)}s`,
    );
  }
}

function scheduleUpdate() {
  if (state.debounce) return;
  state.debounce = setTimeout(() => {
    state.debounce = null;
    if (state.channel) {
      updateOnlineMessage(state.channel.guild);
    }
  }, DEBOUNCE_MS);
}

async function init(client) {
  const category = await client.channels.fetch(ONLINE_CATEGORY_ID).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    console.log("? ONLINE: Category not found or invalid:", ONLINE_CATEGORY_ID);
    return;
  }

  const guild = category.guild;
  state.channel = await ensureChannel(guild);
  if (!state.channel) return;

  state.message = await findOrCreateMessage(state.channel);
  await updateOnlineMessage(guild);

  if (!state.interval) {
    state.interval = setInterval(() => updateOnlineMessage(guild), UPDATE_INTERVAL_MS);
  }
}

module.exports = (client) => {
  client.on(Events.ClientReady, () => {
    init(client);
  });

  client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
    if (!state.channel || !newPresence || !newPresence.guild) return;
    if (newPresence.guild.id !== state.channel.guild.id) return;
    scheduleUpdate();
  });
};
