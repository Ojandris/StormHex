const { PermissionsBitField } = require("discord.js");

const baseChannelId = "1373758263547531467";
const tempVoiceChannels = new Map(); // userId -> channelId

module.exports = (client) => {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const member = newState.member;

    // Création salon temporaire quand utilisateur rejoint le canal de base
    if (newState.channelId === baseChannelId) {
      const guild = newState.guild;

      // Ne pas créer plusieurs salons pour le même user
      if (tempVoiceChannels.has(member.id)) return;

      try {
        const channel = await guild.channels.create({
          name: `Salon de ${member.displayName}`,
          type: 2, // ChannelType.GuildVoice
          parent: newState.channel.parent,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionsBitField.Flags.Connect]
            },
            {
              id: member.id,
              allow: [
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.MoveMembers
              ]
            }
          ]
        });

        await member.voice.setChannel(channel);
        tempVoiceChannels.set(member.id, channel.id);
        console.log(`[Voice] Salon créé pour ${member.displayName}`);
      } catch (err) {
        console.error(`[Voice] Erreur lors de la création du salon pour ${member.displayName}:`, err);
      }
    }

    // Suppression salon vide du propriétaire qui quitte
    const ownedChannelId = tempVoiceChannels.get(oldState.member?.id);
    if (
      ownedChannelId &&
      oldState.channelId === ownedChannelId &&
      oldState.channel?.members?.size === 0
    ) {
      try {
        const channel = oldState.guild.channels.cache.get(ownedChannelId);
        if (channel) await channel.delete();
        tempVoiceChannels.delete(oldState.member.id);
        console.log(`[Voice] Salon supprimé pour ${oldState.member.displayName}`);
      } catch (err) {
        console.error(`[Voice] Erreur lors de la suppression du salon pour ${oldState.member?.displayName}:`, err);
        tempVoiceChannels.delete(oldState.member?.id);
      }
    }
  });

  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim();
    if (!content.startsWith("!vocal ")) return;

    const [cmd, sub, ...args] = content.split(/\s+/);

    // Récupérer le salon vocal temporaire de l'utilisateur
    const userChannelId = tempVoiceChannels.get(message.author.id);
    if (!userChannelId) return; // Pas de salon temporaire

    const userChannel = message.guild.channels.cache.get(userChannelId);
    if (!userChannel) {
      tempVoiceChannels.delete(message.author.id);
      return;
    }

    // Vérifier que l'utilisateur a bien les droits de gérer son salon
    const isOwner = userChannel
      .permissionsFor(message.member)
      ?.has(PermissionsBitField.Flags.ManageChannels);

    if (!isOwner) {
      return message.reply("Vous n'avez pas les permissions de faire cette commande.");
    }

    switch (sub) {
      case "rename": {
        const newName = args.join(" ");
        if (!newName) return message.reply("Spécifie un nom.");
        try {
          await userChannel.setName(newName);
          return message.reply(`Salon renommé en **${newName}**.`);
        } catch (err) {
          console.error(`[Voice] Erreur lors du renommage du salon de ${message.author.tag}:`, err);
          return message.reply("❌ Une erreur est survenue lors du renommage du salon.");
        }
      }
      case "help": {
        return message.reply(
          "**Commandes disponibles :**\n" +
            "`!vocal rename [nom]` — Renomme ton salon vocal personnel.\n" +
            "`!vocal kick [@utilisateur]` — Expulse un utilisateur de ton salon vocal.\n" +
            "`!vocal transfert [@utilisateur]` — Transfère la propriété du salon.\n" +
            "`!vocal limit [nombre]` — Limite le nombre de participants dans ton salon.\n" +
            "`!vocal lock` — Verrouille l'accès à ton salon.\n" +
            "`!vocal unlock` — Déverrouille l'accès à ton salon.\n" +
            "`!vocal help` — Affiche cette aide."
        );
      }
      case "kick": {
        const member = message.mentions.members.first();
        if (!member || member.voice.channelId !== userChannel.id) {
          return message.reply("Ce membre n'est pas dans ton salon.");
        }

        if (
          member.permissions.has(PermissionsBitField.Flags.Administrator) ||
          member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
          member.permissions.has(PermissionsBitField.Flags.ManageGuild)
        ) {
          return message.reply("Tu ne peux pas expulser un modérateur ou un administrateur.");
        }

        try {
          await member.voice.disconnect();
          return message.reply(`${member.displayName} a été exclu du salon.`);
        } catch (err) {
          console.error(`[Voice] Erreur lors du kick vocal de ${member.displayName}:`, err);
          return message.reply("❌ Une erreur est survenue lors de l'expulsion du membre.");
        }
      }
      case "transfert": {
        const member = message.mentions.members.first();
        if (!member || member.voice.channelId !== userChannel.id) {
          return message.reply("Ce membre n'est pas dans ton salon.");
        }

        try {
          // Retirer les permissions au proprio actuel
          await userChannel.permissionOverwrites.edit(message.author.id, {
            Connect: false,
            ManageChannels: false,
            MoveMembers: false
          });

          // Donner les permissions au nouveau proprio
          await userChannel.permissionOverwrites.edit(member.id, {
            Connect: true,
            ManageChannels: true,
            MoveMembers: true
          });

          // Mettre à jour le propriétaire dans la map
          tempVoiceChannels.set(member.id, userChannel.id);
          tempVoiceChannels.delete(message.author.id);

          return message.reply(`Tu as transféré la propriété à ${member.displayName}.`);
        } catch (err) {
          console.error(`[Voice] Erreur lors du transfert du salon de ${message.author.tag} à ${member.displayName}:`, err);
          return message.reply("❌ Une erreur est survenue lors du transfert de propriété.");
        }
      }
      case "limit": {
        const limit = parseInt(args[0]);
        if (isNaN(limit) || limit < 0 || limit > 99) {
          return message.reply("Indique une limite valide entre 0 et 99.");
        }

        try {
          await userChannel.setUserLimit(limit);
          return message.reply(`Limite du salon définie à **${limit}** utilisateur(s).`);
        } catch (err) {
          console.error(`[Voice] Erreur lors de la définition de la limite du salon de ${message.author.tag}:`, err);
          return message.reply("❌ Une erreur est survenue lors de la définition de la limite.");
        }
      }
      case "lock": {
        try {
          await userChannel.permissionOverwrites.edit(message.guild.id, {
            Connect: false
          });
          return message.reply("Ton salon vocal est maintenant **verrouillé**.");
        } catch (err) {
          console.error(`[Voice] Erreur lors du verrouillage du salon de ${message.author.tag}:`, err);
          return message.reply("❌ Une erreur est survenue lors du verrouillage du salon.");
        }
      }
      case "unlock": {
        try {
          await userChannel.permissionOverwrites.edit(message.guild.id, {
            Connect: null
          });
          return message.reply("Ton salon vocal est maintenant **déverrouillé**.");
        } catch (err) {
          console.error(`[Voice] Erreur lors du déverrouillage du salon de ${message.author.tag}:`, err);
          return message.reply("❌ Une erreur est survenue lors du déverrouillage du salon.");
        }
      }
      default:
        return message.reply("Commande inconnue. Utilise `!vocal help` pour la liste des commandes.");
    }
  });
};
