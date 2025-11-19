// ==========================
// INIT LIBSODIUM PROPERLY
// ==========================
const sodium = require("libsodium-wrappers");

(async () => {
  await sodium.ready;
  console.log("Sodium initialized!");
  startBot();
})();

function startBot() {

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

function songPick(name) {
  return createAudioResource(`${name}.mp3`);
}

// ==========================================

const players = new Map();
const modes = new Map();

// ==========================================
// SUPER SAFE REPLY
// ==========================================

async function safeReply(interaction, options) {
  try {
    if (!interaction.replied && !interaction.deferred) {
      return await interaction.reply(options);
    } else {
      return await interaction.followUp(options);
    }
  } catch (err) {
    if (err.code === 10062 || err.code === 40060) {
      console.warn("Ignored interaction error:", err.code);
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
      behaviors: { noSubscriber: NoSubscriberBehavior.Play }
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

        { name: "lagu1", description: "Putar song1.mp3" },
        { name: "lagu2", description: "Putar song2.mp3" },
        { name: "lagu3", description: "Putar song3.mp3" },
        { name: "lagu4", description: "Putar song4.mp3" },
        { name: "lagu5", description: "Putar song5.mp3" },

        { name: "kocok", description: "Putar lagu acak" },
        { name: "leave", description: "Keluarkan bot dari voice channel" },

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

  if (interaction.commandName !== "stop" && interaction.commandName !== "leave" && !vc) {
    return safeReply(interaction, {
      content: "Masuk voice dulu sen 😭❤️",
      ephemeral: true
    });
  }

  try {
    // ===========================
    // /afk
    // ===========================
    if (interaction.commandName === "afk") {
      let conn = getVoiceConnection(guildId);

      if (!conn) {
        conn = joinVoiceChannel({
          channelId: vc.id,
          guildId,
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

    // ===========================
    // /sing
    // ===========================
    if (interaction.commandName === "sing") {
      let conn = getVoiceConnection(guildId);

      if (!conn) {
        conn = joinVoiceChannel({
          channelId: vc.id,
          guildId,
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

    // ===========================
    // /lagu1 - /lagu5
    // ===========================
    const songMap = {
      lagu1: "song1",
      lagu2: "song2",
      lagu3: "song3",
      lagu4: "song4",
      lagu5: "song5"
    };

    if (songMap[interaction.commandName]) {
      let conn = getVoiceConnection(guildId);

      if (!conn) {
        conn = joinVoiceChannel({
          channelId: vc.id,
          guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfMute: false,
          selfDeaf: true
        });
      }

      const player = getOrCreatePlayer(guildId, conn);
      modes.set(guildId, "sing");

      const file = songMap[interaction.commandName];
      player.play(songPick(file));

      return safeReply(interaction, {
        content: `🎶 Lagi play **${file}.mp3** buat kamu sen ❤️`
      });
    }

    // ===========================
    // /kocok (shuffle)
    // ===========================
    if (interaction.commandName === "kocok") {
      const list = ["song1", "song2", "song3", "song4", "song5"];
      const randomSong = list[Math.floor(Math.random() * list.length)];

      let conn = getVoiceConnection(guildId);

      if (!conn) {
        conn = joinVoiceChannel({
          channelId: vc.id,
          guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfMute: false,
          selfDeaf: true
        });
      }

      const player = getOrCreatePlayer(guildId, conn);
      modes.set(guildId, "sing");
      player.play(songPick(randomSong));

      return safeReply(interaction, {
        content: `🔀 Kocok… dapet **${randomSong}.mp3** 😎🎵`
      });
    }

    // ===========================
    // /leave
    // ===========================
    if (interaction.commandName === "leave") {
      const conn = getVoiceConnection(guildId);

      modes.set(guildId, "none");

      if (conn) conn.destroy();

      return safeReply(interaction, {
        content: "Oke sen, aku keluar dulu dari voice 😌👋"
      });
    }

    // ===========================
    // /stop
    // ===========================
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
// GLOBAL ERROR HANDLER
// ==========================================

client.on("error", (err) => {
  console.error("Client error:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// ==========================================
// LOGIN
// ==========================================

client.login(TOKEN);

} // END startBot()
