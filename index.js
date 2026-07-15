const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const keepalive = require('./keepalive');
const setupVocal = require('./vocal');
const moderation = require('./moderation');
const { connectDB } = require('./BanqueDonnees');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID || '1373731984903376976';
const guildId = process.env.GUILD_ID || '1329487026243764244';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages // Intent pour les messages privés
    ],
    partials: [
        Partials.Channel, // Nécessaire pour les salons en DM
        Partials.Message, // Pour recevoir les messages partiels
        Partials.User     // Pour accéder à l'auteur dans les DMs
    ]
});

// ----------- Message et Role de bienvenue -----------

const welcomeChannelId = '1373478238562680832'; // Salon de bienvenue
const memberRoleId = '1329488914192535584';     // Rôle "membre"

client.on('guildMemberAdd', async (member) => {
  try {
    // Ajoute le rôle "membre"
    const role = member.guild.roles.cache.get(memberRoleId);
    if (role) {
      await member.roles.add(role);
    }

    // Message de bienvenue
    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (channel) {
      channel.send(`Bienvenue sur le serveur, ${member} ! Je t'invite à lire le règlement :) `);
    }
  } catch (err) {
    console.error('Erreur lors de l’ajout du rôle ou du message de bienvenue :', err);
  }
});

// ----------- Chargement des commandes -----------

client.commands = new Collection();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

// ----------- Enregistrement des commandes slash -----------

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Mise à jour des commandes slash...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log('Commandes mises à jour.');
    } catch (error) {
        console.error(error);
    }
})();

// ----------- Event Ready -----------

client.once('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
});

// ----------- Gérer les interactions slash -----------

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: 'Erreur lors de l\'exécution de la commande.',
            ephemeral: true
        });
    }
});

// ----------- Initialisation des modules -----------

setupVocal(client);
moderation(client);
keepalive();

client.login(token);
