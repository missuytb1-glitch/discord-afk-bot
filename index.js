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

// ====== CONFIG DARI SECRETS ======
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) console.error("TOKEN belum di-set di Secrets.");
if (!CLIENT_ID) console.error("CLIENT_ID belum di-set di Secrets.");
if (!GUILD_ID) console.error("GUILD_ID belum di-set di Secrets.");

// ====== CLIENT DISCORD ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ====== SILENCE STREAM (BIAR GA DIKICK) ======
class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]));
  }
}

// map per guild
const voicePlayers = new Map(); // guildId -> AudioPlayer
const playModes = new Map();    // guildId -> "afk" | "sing" | "none"

// helper bikin resource
function createSilenceResource() {
  return createAudioResource(new Silence(), {
    inputType: StreamType.Opus
  });
}

// ganti "song.mp3" kalau nama filenya beda
function createSongResource() {
  return createAudioResource("song.mp3");
}

// bikin / ambil player per guild dan pasang listener loop
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

    player.on(AudioPlayerStatus.Idle, () => {
      const mode = playModes.get(guildId);
      try {
        if (mode === "sing") {
          // loop lagu
          player.play(createSongResource());
        } else if (mode === "afk") {
          // loop silence afk
          player.play(createSilenceResource());
        } else {
          // none: diem aja
        }
      } catch (err) {
        console.error(`Error waktu handle Idle di guild ${guildId}:`, err);
      }
    });
  }
  return player;
}

// ====== SLASH COMMANDS ======
const commands = [
  {
    name: "afk",
    description: "Suruh bot join ke voice kamu dan AFK 24/7 (silent loop)"
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

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guild.id;
  const voiceChannel = interaction.member?.voice?.channel;

  console.log(`📥 Command: ${interaction.commandName} dari ${interaction.user.tag}`);

  // semua command butuh user lagi di voice
  if (interaction.commandName !== "stop") {
    if (!voiceChannel) {
      return interaction.reply({
        content: "Kamu harus lagi di voice channel dulu, sen 😆",
        ephemeral: true
      });
    }
  }

  try {
    if (interaction.commandName === "afk") {
      // pastiin ada connection
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

    if (interaction.commandName === "sing") {
      // pastiin ada connection
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

      await interaction.reply("Yow! Gua lagi **nyanyi dan bakal loop terus** 🎵");
    }

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
