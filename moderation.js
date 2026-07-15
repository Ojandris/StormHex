const { PermissionsBitField } = require('discord.js');
const { addInfraction, getInfractions, clearInfractions } = require('./BanqueDonnees');

const SUPPORT_GUILD_ID = '1329487026243764244';
const SUPPORT_CHANNEL_ID = '1342763170389032980';
const prefix = '!';

const ALLOWED_ROLES = [
  "1329488441712443505", // perm *
  "1373725542708412506", // LE CHEF
  "1374162193502834718"  // BOT StormHex
];

const BLOCKED_ROLE = [
  "1329488914192535584", // Members
  "1342740614537805834" // MUTED
];

function isAllowed(member) {
  return ALLOWED_ROLES.some(r => member.roles.cache.has(r));
}

/**
 * Validates that a string looks like a Discord snowflake ID (17-19 digits).
 * @param {string} id
 * @returns {boolean}
 */
function isValidDiscordId(id) {
  return /^\d{17,19}$/.test(id);
}

function parseDuration(str) {
  const match = str.match(/(\d+)([smhd])/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * map[unit];
}

async function ensureMuteRole(guild) {
  let muteRole = guild.roles.cache.find(r => r.name === 'Muted');
  if (!muteRole) {
    muteRole = await guild.roles.create({ name: 'Muted', permissions: [] });
    guild.channels.cache.forEach(channel => {
      channel.permissionOverwrites.edit(muteRole, {
        SendMessages: false,
        Speak: false,
        AddReactions: false
      });
    });
  }
  return muteRole;
}

function hasPermission(member, perm) {
  return member.permissions.has(perm);
}

function noPermReply(message, permName) {
  return message.reply(`Vous n'avez pas la permission : **${permName}**.`);
}

function isModerator(member) {
  return hasPermission(member, PermissionsBitField.Flags.ModerateMembers);
}

// ------------------ Anti-double-message ------------------
const handledMessages = new Set();

function setupModeration(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (handledMessages.has(message.id)) return;
    handledMessages.add(message.id);
    setTimeout(() => handledMessages.delete(message.id), 5000);

    // Gestion DM support
    if (message.channel.type === 1) {
      const guild = client.guilds.cache.get(SUPPORT_GUILD_ID);
      if (!guild) return;
      const supportChannel = guild.channels.cache.get(SUPPORT_CHANNEL_ID);
      if (!supportChannel) return;

      try {
        await supportChannel.send(`**Demande d'aide de ${message.author.tag} (${message.author.id}) :**\n${message.content}`);
        await message.author.send("Votre demande d'aide a bien été enregistrée. Un modérateur va vous répondre dans les plus brefs délais.");
      } catch {}
      return;
    }

    if (!message.content.startsWith(prefix)) return;

    // Blocage rôle Members
    if (BLOCKED_ROLE.some(r => message.member.roles.cache.has(r))) {
      return message.reply("🚫 vous n'avez pas la permission d'utiliser les commandes du bot.");
    }
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const target = message.mentions.members.first();

    switch (cmd) {
      case 'ban':
        if (!hasPermission(message.member, PermissionsBitField.Flags.BanMembers)) return noPermReply(message, 'BanMembers');
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
          return message.reply("❌ Je n'ai pas la permission de bannir des membres.");
        }
        if (!target) return message.reply("Mentionne un utilisateur à bannir.");
        {
          const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
          console.log(`[Moderation] ban: ${message.author.tag} bans ${target.user.tag} — raison: ${reason}`);
          try {
            await target.send(`Vous avez été banni du serveur par un modérateur pour la raison suivante : ${reason}`).catch(() => {});
            await target.ban({ reason });
            await addInfraction(target.id, 'ban', reason, message.author.id).catch(console.error);
            message.channel.send(`${target.user.tag} a été banni pour la raison suivante : ${reason}.`);
          } catch (err) {
            console.error(`[Moderation] Erreur lors du ban de ${target.user.tag}:`, err);
            message.reply("❌ Une erreur est survenue lors du ban.");
          }
        }
        break;
        
      case 'kick':
        if (!hasPermission(message.member, PermissionsBitField.Flags.KickMembers)) return noPermReply(message, 'KickMembers');
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.KickMembers)) {
          return message.reply("❌ Je n'ai pas la permission d'expulser des membres.");
        }
        if (!target) return message.reply("Mentionne un utilisateur à kick.");
        {
          const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
          console.log(`[Moderation] kick: ${message.author.tag} kick ${target.user.tag} — raison: ${reason}`);
          try {
            await target.send(`Vous avez été expulsé du serveur par un modérateur pour la raison suivante : ${reason}`).catch(() => {});
            await target.kick(reason);
            message.channel.send(`${target.user.tag} a été expulsé pour la raison suivante: ${reason}.`);
          } catch (err) {
            console.error(`[Moderation] Erreur lors du kick de ${target.user.tag}:`, err);
            message.reply("❌ Une erreur est survenue lors du kick.");
          }
        }
        break;

      case 'mute':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) return noPermReply(message, 'ModerateMembers');
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          return message.reply("❌ Je n'ai pas la permission de mute des membres.");
        }
        if (!target) return message.reply("Mentionne un utilisateur à mute.");
        {
          const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
          console.log(`[Moderation] mute: ${message.author.tag} mute ${target.user.tag} — raison: ${reason}`);
          try {
            const muteRole = await ensureMuteRole(message.guild);
            await target.roles.add(muteRole);
            const memberRole = message.guild.roles.cache.get("1329488914192535584");
        if (memberRole && target.roles.cache.has(memberRole.id)) {
            await target.roles.remove(memberRole);
        }
            await target.send(`Vous avez été mute du serveur par un modérateur pour la raison suivante : ${reason}`).catch(() => {});
            await addInfraction(target.id, 'mute', reason, message.author.id).catch(console.error);
            message.channel.send(`${target.user.tag} a été mute pour la raison suivante : ${reason}.`);
          } catch (err) {
            console.error(`[Moderation] Erreur lors du mute de ${target.user.tag}:`, err);
            message.reply("❌ Une erreur est survenue lors du mute.");
          }
        }
        break;

      case 'tempmute':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) return noPermReply(message, 'ModerateMembers');
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          return message.reply("❌ Je n'ai pas la permission de mute des membres.");
        }
        if (!target || !args[1]) return message.reply("Utilisation : !tempmute @user 10m");
        {
          const duration = parseDuration(args[1]);
          if (!duration) return message.reply("Durée invalide.");
          const reason = args.slice(2).join(' ') || 'Aucune raison fournie';
          console.log(`[Moderation] tempmute: ${message.author.tag} tempmute ${target.user.tag} ${args[1]} — raison: ${reason}`);
          try {
            const muteRole = await ensureMuteRole(message.guild);
            await target.roles.add(muteRole);
            const memberRole = message.guild.roles.cache.get("1329488914192535584");
        if (memberRole && target.roles.cache.has(memberRole.id)) {
            await target.roles.remove(memberRole);
        }
            await target.send(`Vous avez été temporairement mute du serveur par un modérateur pour la raison suivante : ${reason}`).catch(() => {});
            await addInfraction(target.id, 'mute', `[${args[1]}] ${reason}`, message.author.id).catch(console.error);
            message.channel.send(`${target.user.tag} est mute pour ${args[1]} pour la raison suivante : ${reason}.`);
            setTimeout(async () => {
              try {
                await target.roles.remove(muteRole);
                const memberRole = message.guild.roles.cache.get("1329488914192535584");
        if (memberRole && !target.roles.cache.has(memberRole.id)) {
                await target.roles.add(memberRole);
        }
                await clearInfractions(target.id, 'mute').catch(console.error);
              } catch (err) {
                console.error(`[Moderation] Erreur lors du unmute automatique de ${target.user.tag}:`, err);
              }
            }, duration);
          } catch (err) {
            console.error(`[Moderation] Erreur lors du tempmute de ${target.user.tag}:`, err);
            message.reply("❌ Une erreur est survenue lors du tempmute.");
          }
        }
        break;

      case 'unmute':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) return noPermReply(message, 'ModerateMembers');
        if (!target) return message.reply("Mentionne un utilisateur à unmute.");
        {
          console.log(`[Moderation] unmute: ${message.author.tag} unmute ${target.user.tag}`);
          try {
            const muteRole = await ensureMuteRole(message.guild);
        if (!target.roles.cache.has(muteRole.id)) {
            return message.reply("❌ Cet utilisateur n'est pas mute.");
        }
            await target.roles.remove(muteRole);
            const memberRole = message.guild.roles.cache.get("1329488914192535584");
        if (memberRole && !target.roles.cache.has(memberRole.id)) {
            await target.roles.add(memberRole);
        }
            await clearInfractions(target.id, 'mute').catch(console.error);
            await target.send("Vous avez été unmute du serveur.").catch(() => {});
            message.channel.send(`${target.user.tag} a été unmute.`);
          } catch (err) {
            console.error(`[Moderation] Erreur lors du unmute de ${target.user.tag}:`, err);
            message.reply("❌ Une erreur est survenue lors du unmute.");
          }
        }
        break;

      case 'tempban':
        if (!hasPermission(message.member, PermissionsBitField.Flags.BanMembers)) return noPermReply(message, 'BanMembers');
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
          return message.reply("❌ Je n'ai pas la permission de bannir des membres.");
        }
        if (!target || !args[1]) return message.reply("Utilisation : !tempban @user 10m [raison]");
        {
          const duration = parseDuration(args[1]);
          if (!duration) return message.reply("Durée invalide.");
          const reason = args.slice(2).join(' ') || 'Aucune raison fournie';
          console.log(`[Moderation] tempban: ${message.author.tag} tempban ${target.user.tag} ${args[1]} — raison: ${reason}`);
          try {
            await target.send(`Vous avez été temporairement banni du serveur par un modérateur pour la raison suivante : ${reason}`).catch(() => {});
            await target.ban({ reason });
            await addInfraction(target.id, 'ban', `[${args[1]}] ${reason}`, message.author.id).catch(console.error);
            message.channel.send(`${target.user.tag} a été tempbanni pendant ${args[1]} pour la raison suivante : ${reason}.`);
            setTimeout(async () => {
              try {
                await message.guild.members.unban(target.id);
                await clearInfractions(target.id, 'ban').catch(console.error);
              } catch (err) {
                console.error(`[Moderation] Erreur lors du unban automatique de ${target.user.tag}:`, err);
              }
            }, duration);
          } catch (err) {
            console.error(`[Moderation] Erreur lors du tempban de ${target.user.tag}:`, err);
            message.reply("❌ Une erreur est survenue lors du tempban.");
          }
        }
        break;

      case 'warn':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) return noPermReply(message, 'ModerateMembers');
        if (!target) return message.reply("Mentionne un utilisateur à avertir.");
        {
          const reason = args.slice(1).join(' ') || 'Aucune raison';
          console.log(`[Moderation] warn: ${message.author.tag} warn ${target.user.tag} — raison: ${reason}`);
          try {
            await addInfraction(target.id, 'warn', reason, message.author.id);
            await target.send(`Vous avez reçu un avertissement : ${reason}`).catch(() => {});
            message.channel.send(`${target.user.tag} a été averti.`);
          } catch (err) {
            console.error(`[Moderation] Erreur lors du warn de ${target.user.tag}:`, err);
            message.reply("❌ Une erreur est survenue lors de l'avertissement.");
          }
        }
        break;

      case 'warnings':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ModerateMembers)) return noPermReply(message, 'ModerateMembers');
        if (!target) return message.reply("Mentionne un utilisateur.");
        {
          console.log(`[Moderation] warnings: ${message.author.tag} consulte les warns de ${target.user.tag}`);
          try {
            const infractions = await getInfractions(target.id);
            const warns = infractions.filter(i => i.type === 'warn' && !i.resolved);
            if (warns.length === 0) {
              message.channel.send(`${target.user.tag} n'a aucun avertissement actif.`);
            } else {
              const list = warns.map(w => `- ${w.reason} (le ${new Date(w.timestamp).toLocaleDateString('fr-FR')})`).join('\n');
              message.channel.send(`${target.user.tag} a **${warns.length}** avertissement(s) actif(s) :\n${list}`);
            }
          } catch (err) {
            console.error(`[Moderation] Erreur lors de la récupération des warns de ${target.user.tag}:`, err);
            message.reply("❌ Une erreur est survenue lors de la récupération des avertissements.");
          }
        }
        break;

      case 'clear':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) return noPermReply(message, 'ManageMessages');
        {
          const amount = parseInt(args[0], 10);
          if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Nombre invalide (1-100).');
          await message.channel.bulkDelete(amount + 1, true);
          const sent = await message.channel.send(`Supprimé ${amount} messages.`);
          setTimeout(() => sent.delete(), 3000);
        }
        break;

      case 'lock':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) return noPermReply(message, 'ManageChannels');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        message.channel.send('Le salon est verrouillé.');
        break;
        
      case 'unlock':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) return noPermReply(message, 'ManageChannels');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        message.channel.send('Le salon est déverrouillé.');
        break;

      case 'slow':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageChannels)) return noPermReply(message, 'ManageChannels');
        {
          if (!args[0]) return message.reply('Utilisation : !slow <secondes|off>');
          const value = args[0].toLowerCase() === 'off' ? 0 : parseInt(args[0], 10);
          if (isNaN(value) || value < 0 || value > 21600) return message.reply('Temps invalide (entre 0 et 21600 secondes).');
          await message.channel.setRateLimitPerUser(value);
          message.channel.send(value === 0 ? 'Slowmode désactivé.' : `Slowmode activé à ${value}s.`);
        }
        break;

      case 'reply':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) return noPermReply(message, 'ManageMessages');
        {
          const userId = args[0];
          const reply = args.slice(1).join(' ');
          if (!userId || !reply) return message.reply('Utilisation : !reply <userID> message');
          if (!isValidDiscordId(userId)) return message.reply("❌ L'ID fourni n'est pas un identifiant Discord valide.");
          console.log(`[Moderation] reply: ${message.author.tag} envoie un message à l'utilisateur ${userId}`);
          try {
            const user = await client.users.fetch(userId);
            await user.send(`Support : ${reply}`);
            message.channel.send(`Réponse envoyée à ${user.tag}.`);
          } catch (err) {
            console.error(`[Moderation] Erreur lors de l'envoi du message à ${userId}:`, err);
            message.reply("Impossible d'envoyer un message à cet utilisateur. Vérifie l'ID.");
          }
        }
        break;

      case 'say':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) return noPermReply(message, 'ManageMessages');
        {
          const sayMessage = args.join(' ');
          if (!sayMessage) return message.reply("Tu dois écrire un message après `!say`.");
          await message.delete().catch(() => {});
          message.channel.send(sayMessage);
        }
        break;

      case 'purgeuser':
        if (!hasPermission(message.member, PermissionsBitField.Flags.ManageMessages)) return noPermReply(message, 'ManageMessages');
        if (!target) return message.reply("Mentionne un utilisateur à purger.");

        await message.reply(`🔎 Recherche des messages récents de ${target.user.tag}…`);

        for (const [, channel] of message.guild.channels.cache) {
          if (!channel.isTextBased()) continue;
          try {
            const fetched = await channel.messages.fetch({ limit: 30 });
            const toDelete = fetched.filter(m => m.author.id === target.id);
            if (toDelete.size > 0) {
              await channel.bulkDelete(toDelete, true);
            }
          } catch {}
        }

        message.channel.send(`✅ Purge terminée pour ${target.user.tag}.`);
        break;

      case 'help':
        if (!isModerator(message.member)) return noPermReply(message, 'ModerateMembers');
        message.channel.send({
          embeds: [{
            title: 'Commandes disponibles',
            color: 0x3498db,
            description: `
Modération:
!ban @user [raison]
!kick @user [raison]
!mute @user
!tempmute @user 10m
!unmute @user
!tempban @user 10m [raison]
!warn @user [raison]
!warnings @user
!clear 10
!purgeuser @user

Canal:
!lock
!unlock
!slow 10 / !slow off
!say

Support:
!reply userID message (répondre à une demande d'aide)

Merci de faire cette commande seulement dans le channel aide-mod.`
          }]
        });
        break;

      default:
        break;
    }
  });
}

module.exports = setupModeration;
