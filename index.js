
require("./server.js");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  console.error("TOKEN belum di-set di Secrets Replit.");
}
if (!CLIENT_ID) {
  console.error("CLIENT_ID (Application ID) belum di-set di Secrets Replit.");
}
if (!GUILD_ID) {
  console.error("GUILD_ID (Server ID) belum di-set di Secrets Replit.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const commands = [
  {
    name: "afk",
    description: "Suruh bot join ke voice kamu dan AFK 24/7"
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
    console.log("✅ Slash command /afk terdaftar di guild.");
  } catch (error) {
    console.error("❌ Gagal register command:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "afk") {
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: "Kamu harus lagi di voice channel dulu, sen 😆",
        ephemeral: true
      });
    }

    try {
      joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      await interaction.reply(
        `Yow!! Gw udah join **${voiceChannel.name}** dan bakal AFK di sini selamanya!!😴`
      );
    } catch (error) {
      console.error("Error waktu join voice:", error);
      if (!interaction.replied) {
        await interaction.reply("Ada error waktu coba join voice 😢");
      }
    }
  }
});

client.login(TOKEN);
