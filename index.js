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
  return createAudioResource(new Silence(), { inputType: StreamType.Opus });
}

function songPick(name) {
  return createAudioResource(`${name}.mp3`);
}


// =================== STATE DATA ===================
const players = new Map();
const states = new Map(); 
// states[guildId] = { mode, playlist, currentIndex }


// =================== SAFE REPLY ===================
async function safeReply(interaction, options) {
  try {
    if (!interaction.replied && !interaction.deferred)
      return await interaction.reply(options);
    else
      return await interaction.followUp(options);

  } catch (err) {
    if (err.code === 10062 || err.code === 40060) return;
    console.error("Reply error:", err);
  }
}


// =================== CREATE PLAYER ===================
function getOrCreatePlayer(guildId, connection) {
  let player = players.get(guildId);

  if (!player) {
    player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play }
    });

    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      const state = states.get(guildId);
      if (!state) return;

      // LOOP SINGLE SONG
      if (state.mode === "single") {
        const file = state.playlist[0];
        return player.play(songPick(file));
      }

      // LOOP PLAYLIST 1→5→1→...
      if (state.mode === "shuffleLoop") {
        state.currentIndex++;
        if (state.currentIndex >= state.playlist.length)
          state.currentIndex = 0;

        const file = state.playlist[state.currentIndex];
        return player.play(songPick(file));
      }

      // AFK 
      if (state.mode === "afk") {
        return player.play(silenceResource());
      }
    });

    player.on("error", err => console.error("Player error:", err));

    players.set(guildId, player);
  }

  return player;
}


// =================== CLIENT ===================
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

        { name: "lagu1", description: "Putar song1.mp3 (loop)" },
        { name: "lagu2", description: "Putar song2.mp3 (loop)" },
        { name: "lagu3", description: "Putar song3.mp3 (loop)" },
        { name: "lagu4", description: "Putar song4.mp3 (loop)" },
        { name: "lagu5", description: "Putar song5.mp3 (loop)" },

        { name: "kocok", description: "Putar playlist song1→song5 loop" },
        { name: "leave", description: "Keluarkan bot dari voice" },
        { name: "stop", description: "Stop audio" }
      ]
    }
  );

  console.log("Commands registered ✔️");
});


// =================== INTERACTION HANDLER ===================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guild.id;
  const vc = interaction.member.voice.channel;

  if (
    interaction.commandName !== "stop" &&
    interaction.commandName !== "leave" &&
    !vc
  ) {
    return safeReply(interaction, {
      content: "Masuk voice dulu sen 😭❤️",
      ephemeral: true
    });
  }

  try {

    // ---------- AFK ----------
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

      states.set(guildId, { mode: "afk", playlist: [], currentIndex: 0 });
      player.play(silenceResource());

      return safeReply(interaction, {
        content: `Aku AFK 24/7 di **${vc.name}** 😴`
      });
    }


    // ---------- /lagu1 – /lagu5 ----------
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
      const file = songMap[interaction.commandName];

      states.set(guildId, {
        mode: "single",
        playlist: [file],
        currentIndex: 0
      });

      player.play(songPick(file));

      return safeReply(interaction, {
        content: `🎶 Lagi nge-loop **${file}.mp3** nonstop buat kamu sen ❤️`
      });
    }


    // ---------- /kocok (playlist loop 1→5→1→...) ----------
    if (interaction.commandName === "kocok") {
      const playlist = ["song1", "song2", "song3", "song4", "song5"];

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

      states.set(guildId, {
        mode: "shuffleLoop",
        playlist,
        currentIndex: 0
      });

      player.play(songPick("song1"));

      return safeReply(interaction, {
        content: `🔁 Muter playlist **song1 → song5** terus balik song1 lagi ya sen ❤️`
      });
    }


    // ---------- /leave ----------
    if (interaction.commandName === "leave") {
      const conn = getVoiceConnection(guildId);

      states.delete(guildId);

      if (conn) conn.destroy();

      return safeReply(interaction, {
        content: "Oke sen, aku keluar voice dulu 😌👋"
      });
    }


    // ---------- /stop ----------
    if (interaction.commandName === "stop") {
      const player = players.get(guildId);

      states.delete(guildId);

      if (player) player.stop(true);

      return safeReply(interaction, {
        content: "Oke sen, musiknya aku stop ya 😌"
      });
    }


  } catch (e) {
    console.error("Interaction error:", e);
    safeReply(interaction, { content: "Error sen 😭", ephemeral: true });
  }
});


// =================== GLOBAL ERROR HANDLERS ===================
client.on("error", err => console.error("Client error:", err));
process.on("unhandledRejection", reason => console.error("Unhandled Rejection:", reason));


// =================== LOGIN ===================
client.login(TOKEN);

} // END startBot()
