require("libsodium-wrappers");
require("./server.js");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  NoSubscriberBehavior,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  getVoiceConnection
} = require("@discordjs/voice");

const { Readable } = require("stream");

// =================== CONFIG ===================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// =================== SILENCE ===================

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]));
  }
}

function silenceResource() {
  return createAudioResource(new Silence(), {
    inputType: StreamType.Opus
  });
}

function songResource() {
  return createAudioResource("song.mp3");
}

// ==========================================

const players = new Map();
const modes = new Map();

// ==========================================
// ANTI ERROR: SAFE REPLY
// ==========================================

async function safeReply(interaction, options) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(options);
    } else {
      return await interaction.reply(options);
    }
  } catch (err) {
    if (err.code === 10062) {
      console.warn("Ignored Unknown Interaction (10062)");
    } else {
      console.error("Reply error:", err);
    }
  }
}

// ==========================================
// CREATE PLAYER
// ==========================================

function getOrCreatePlayer(guildId, connection) {
  let player = players.get(guildId);

  if (!player) {
    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
      }
    });

    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      const mode = modes.get(guildId);
      if (mode === "sing") return player.play(songResource());
      if (mode === "afk") return player.play(silenceResource());
    });

    player.on("error", (err) => {
      console.error("Player error:", err);
    });

    players.set(guildId, player);
  }

  return player;
}

// ==========================================
// CLIENT
// ==========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once("ready", async () => {
  console.log(`Bot online sebagai ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: [
        { name: "afk", description: "AFK 24/7" },
        { name: "sing", description: "Play song.mp3 (loop)" },
        { name: "stop", description: "Stop audio" }
      ]
    }
  );

  console.log("Commands registered ✔️");
});

// ==========================================
// MAIN INTERACTION HANDLER
// ==========================================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guild.id;
  const vc = interaction.member.voice.channel;

  if (interaction.commandName !== "stop" && !vc) {
    return safeReply(interaction, {
      content: "Masuk voice dulu sen 😭❤️",
      ephemeral: true
    });
  }

  try {
    if (interaction.commandName === "afk") {
      let conn = getVoiceConnection(guildId);

      if (!conn) {
        conn = joinVoiceChannel({
          channelId: vc.id,
          guildId: guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfMute: false,
          selfDeaf: true
        });
      }

      const player = getOrCreatePlayer(guildId, conn);
      modes.set(guildId, "afk");
      player.play(silenceResource());

      return safeReply(interaction, {
        content: `Aku AFK 24/7 di **${vc.name}** 😴`
      });
    }

    if (interaction.commandName === "sing") {
      let conn = getVoiceConnection(guildId);

      if (!conn) {
        conn = joinVoiceChannel({
          channelId: vc.id,
          guildId: guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfMute: false,
          selfDeaf: true
        });
      }

      const player = getOrCreatePlayer(guildId, conn);
      modes.set(guildId, "sing");
      player.play(songResource());

      return safeReply(interaction, {
        content: "🎤 Lagi nyanyi **song.mp3** buat kamu sen ❤️"
      });
    }

    if (interaction.commandName === "stop") {
      const player = players.get(guildId);
      modes.set(guildId, "none");

      if (player) player.stop(true);

      return safeReply(interaction, {
        content: "Oke sen, aku berhenti dulu 😌"
      });
    }

  } catch (e) {
    console.error("Interaction error:", e);
    safeReply(interaction, { content: "Error sen 😭", ephemeral: true });
  }
});

// ==========================================
// GLOBAL ERROR HANDLER (ANTI MATI)
// ==========================================

client.on("error", (err) => {
  console.error("Client error:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// ==========================================

client.login(TOKEN);
