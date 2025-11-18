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

// ==================== CONFIG DARI ENV ====================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) console.error("TOKEN belum di-set di Environment.");
if (!CLIENT_ID) console.error("CLIENT_ID belum di-set di Environment.");
if (!GUILD_ID) console.error("GUILD_ID belum di-set di Environment.");

// ==================== DISCORD CLIENT ====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ==================== SILENCE STREAM ====================

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]));
  }
}

// guildId -> AudioPlayer
const voicePlayers = new Map();
// guildId -> "afk" | "sing" | "none"
const playModes = new Map();

// helper bikin resource
function createSilenceResource() {
  return createAudioResource(new Silence(), {
    inputType: StreamType.Opus
  });
}

// ganti nama file ini kalau lagunya beda
function createSongResource() {
  // pastiin file ini ada di root project: song.mp3
  return createAudioResource("song.mp3");
}

// bikin / ambil player per guild + set loop behavior
function getOrCreatePlayer(guildId, connection) {
  let player = voicePlayers.get(guildId);

  if (!player) {
    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
      }
    });

    voicePlayers.set(guildId, player);
    connection.subscribe(player);

    player.on("error", (err) => {
      console.error(`Player error di guild ${guildId}:`, err);
    });

    // loop sesuai mode
    player.on(AudioPlayerStatus.Idle, () => {
      const mode = playModes.get(guildId);

      try {
        if (mode === "sing") {
          player.play(createSongResource());
        } else if (mode === "afk") {
          player.play(createSilenceResource());
        } else {
          // mode "none" -> diem aja
        }
      } catch (err) {
        console.error(`Error waktu handle Idle di guild ${guildId}:`, err);
      }
    });
  }

  return player;
}

// ==================== SLASH COMMANDS ====================

const commands = [
  {
    name: "afk",
    description: "Bot join ke voice kamu dan AFK 24/7 (silent loop)"
  },
  {
    name: "sing",
    description: "Bot nyanyi (muter song.mp3) dan loop terus sampai di /stop"
  },
  {
    name: "stop",
    description: "Berhentiin semua suara (nyanyi/afk) di voice"
  }
];

// ==================== READY ====================

client.once("ready", async () => {
  console.log(`✅ Login sebagai ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash command /afk, /sing, /stop terdaftar di guild.");
  } catch (error) {
    console.error("❌ Gagal register command:", error);
  }
});

// ==================== INTERACTION HANDLER ====================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guild.id;
  const voiceChannel = interaction.member?.voice?.channel;

  console.log(`📥 Command: ${interaction.commandName} dari ${interaction.user.tag}`);

  // semua command kecuali /stop butuh user di voice
  if (interaction.commandName !== "stop") {
    if (!voiceChannel) {
      return interaction.reply({
        content: "Kamu harus lagi di voice channel dulu, sen 😆",
        ephemeral: true
      });
    }
  }

  try {
    // ---------- /afk ----------
    if (interaction.commandName === "afk") {
      let connection = getVoiceConnection(guildId);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false
        });
      }

      const player = getOrCreatePlayer(guildId, connection);
      playModes.set(guildId, "afk");
      player.play(createSilenceResource());

      await interaction.reply(
        `Oke sen, aku udah join **${voiceChannel.name}** dan bakal AFK di sini 24/7 😴`
      );
    }

    // ---------- /sing ----------
    if (interaction.commandName === "sing") {
      let connection = getVoiceConnection(guildId);
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false
        });
      }

      const player = getOrCreatePlayer(guildId, connection);
      playModes.set(guildId, "sing");
      player.play(createSongResource());

      await interaction.reply("Oke sen, aku lagi **nyanyi dan bakal loop terus** 🎵");
    }

    // ---------- /stop ----------
    if (interaction.commandName === "stop") {
      const player = voicePlayers.get(guildId);
      playModes.set(guildId, "none");

      if (player) {
        player.stop(true);
        await interaction.reply("Oke, aku **berhenti nyanyi / AFK** dulu 😴");
      } else {
        await interaction.reply({
          content: "Aku lagi gak nyanyi / AFK di voice, sen 🤔",
          ephemeral: true
        });
      }
    }
  } catch (error) {
    console.error("🔥 Error di interaction handler:", error);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "Ada error waktu proses command ini 😭",
          ephemeral: true
        });
      } catch (e) {
        console.error("Gagal kirim error reply:", e);
      }
    }
  }
});

client.login(TOKEN);
