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
  getVoiceConnection,
  generateDependencyReport
} = require("@discordjs/voice");

const { Readable } = require("stream");

console.log(generateDependencyReport()); // debug encryption

// ==================== CONFIG ENV ====================

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

// guild maps
const voicePlayers = new Map(); // guildId -> AudioPlayer
const playModes = new Map();    // guildId -> "afk" | "sing" | "none"

// ==================== CREATE RESOURCES ====================

function createSilenceResource() {
  return createAudioResource(new Silence(), {
    inputType: StreamType.Opus
  });
}

function createSongResource() {
  return createAudioResource("song.mp3"); // file harus ada di root
}

// ==================== FIX: CONNECT FUNCTION ====================

function connectToChannel(voiceChannel, guildId) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
    encryption: "lite" // FIX utama
  });

  connection.on("error", err => {
    console.error("Voice connection error:", err);
  });

  return connection;
}

// ==================== GET OR CREATE PLAYER ====================

function getOrCreatePlayer(guildId, connection) {
  let player = voicePlayers.get(guildId);

  if (!player) {
    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
      },
      preferredEncryptionMode: "lite" // FIX FIX FIX
    });

    voicePlayers.set(guildId, player);

    try {
      connection.subscribe(player);
    } catch (e) {
      console.error("Subscribe error:", e);
    }

    player.on("error", err => {
      console.error(`Player error di guild ${guildId}:`, err);
    });

    // Looping behaviour
    player.on(AudioPlayerStatus.Idle, () => {
      const mode = playModes.get(guildId);

      try {
        if (mode === "sing") {
          player.play(createSongResource());
        } else if (mode === "afk") {
          player.play(createSilenceResource());
        }
      } catch (err) {
        console.error(`Idle event error di guild ${guildId}:`, err);
      }
    });
  }

  return player;
}

// ==================== SLASH COMMANDS ====================

const commands = [
  {
    name: "afk",
    description: "Bot join ke voice kamu dan AFK 24/7."
  },
  {
    name: "sing",
    description: "Bot nyanyi (muter song.mp3) dan loop terus."
  },
  {
    name: "stop",
    description: "Berhentiin semua suara / AFK."
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
    console.log("✨ Slash command /afk /sing /stop aktif.");
  } catch (error) {
    console.error("❌ Gagal register command:", error);
  }
});

// ==================== INTERACTION ====================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guild.id;
  const voiceChannel = interaction.member?.voice?.channel;

  console.log(`📥 Command: ${interaction.commandName} dari ${interaction.user.tag}`);

  // semua kecuali stop butuh di voice
  if (interaction.commandName !== "stop") {
    if (!voiceChannel) {
      return interaction.reply({
        content: "Kamu harus di voice dulu sen 😆",
        ephemeral: true
      });
    }
  }

  try {
    // ================ /afk ===================
    if (interaction.commandName === "afk") {
      let connection = getVoiceConnection(guildId);
      if (!connection) {
        connection = connectToChannel(voiceChannel, guildId);
      }

      const player = getOrCreatePlayer(guildId, connection);
      playModes.set(guildId, "afk");
      player.play(createSilenceResource());

      await interaction.reply(
        `Oke sen, aku udah AFK 24/7 di **${voiceChannel.name}** 😴`
      );
    }

    // ================ /sing ===================
    if (interaction.commandName === "sing") {
      let connection = getVoiceConnection(guildId);
      if (!connection) {
        connection = connectToChannel(voiceChannel, guildId);
      }

      const player = getOrCreatePlayer(guildId, connection);
      playModes.set(guildId, "sing");
      player.play(createSongResource());

      await interaction.reply(
        `🎵 Oke sen, aku mulai **nyanyi** dan bakal loop terus!`
      );
    }

    // ================ /stop ===================
    if (interaction.commandName === "stop") {
      const player = voicePlayers.get(guildId);
      playModes.set(guildId, "none");

      if (player) {
        player.stop(true);
        await interaction.reply("👌 Oke sen, aku berhenti dulu.");
      } else {
        await interaction.reply({
          content: "Aku lagi ga nyanyi / AFK kok sen 🤔",
          ephemeral: true
        });
      }
    }

  } catch (error) {
    console.error("🔥 Error di interaction handler:", error);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "Waduh ada error waktu proses 😭",
          ephemeral: true
        });
      } catch (e) {
        console.error("Gagal kirim error reply:", e);
      }
    }
  }
});

client.login(TOKEN);
