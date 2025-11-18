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

// =============== CONFIG ===============

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// =============== SILENCE ===============

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xf8, 0xff, 0xfe]));
  }
}

function silenceResource() {
  return createAudioResource(new Silence(), { inputType: StreamType.Opus });
}

function songResource() {
  return createAudioResource("song.mp3");
}

// ======================================

const players = new Map();
const modes = new Map();

// ======================================

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
      if (mode === "sing") player.play(songResource());
      if (mode === "afk") player.play(silenceResource());
    });

    player.on("error", (e) => {
      console.error("Player error:", e);
    });

    players.set(guildId, player);
  }

  return player;
}

// ======================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once("ready", async () => {
  console.log("Bot online:", client.user.tag);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: [
        { name: "afk", description: "AFK 24/7" },
        { name: "sing", description: "Nyanyi song.mp3 loop" },
        { name: "stop", description: "Stop audio" }
      ]
    }
  );

  console.log("Commands registered.");
});

// ======================================

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guild.id;
  const vc = interaction.member.voice.channel;

  console.log("Command:", interaction.commandName);

  if (interaction.commandName !== "stop" && !vc) {
    return interaction.reply({ content: "Masuk voice dulu sen ❤️", ephemeral: true });
  }

  try {

    if (interaction.commandName === "afk") {
      let conn = getVoiceConnection(guildId);
      if (!conn) {
        conn = joinVoiceChannel({
          channelId: vc.id,
          guildId: guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator
        });
      }

      const player = getOrCreatePlayer(guildId, conn);
      modes.set(guildId, "afk");
      player.play(silenceResource());

      return interaction.reply(`Aku AFK 24/7 di **${vc.name}** 😴`);
    }

    if (interaction.commandName === "sing") {
      let conn = getVoiceConnection(guildId);
      if (!conn) {
        conn = joinVoiceChannel({
          channelId: vc.id,
          guildId: guildId,
          adapterCreator: interaction.guild.voiceAdapterCreator
        });
      }

      const player = getOrCreatePlayer(guildId, conn);
      modes.set(guildId, "sing");
      player.play(songResource());

      return interaction.reply("🎤 Lagi nyanyi **song.mp3** buat kamu sen ❤️");
    }

    if (interaction.commandName === "stop") {
      const player = players.get(guildId);
      modes.set(guildId, "none");

      if (player) player.stop(true);
      return interaction.reply("Oke aku berhenti nyanyi/AFK dulu 😌");
    }

  } catch (err) {
    console.error("Interaction error:", err);

    if (!interaction.replied) {
      interaction.reply({ content: "Error sen 😭", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);
