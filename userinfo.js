const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getInfractions } = require('../BanqueDonnees');

// Emoji map for infraction types
const TYPE_EMOJI = { warn: '⚠️', mute: '🔇', ban: '🔨' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription("Affiche les infos de modération d'un utilisateur.")
    .addUserOption(option =>
      option.setName('utilisateur')
        .setDescription("L'utilisateur à inspecter")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.options.getUser('utilisateur');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.editReply({ content: "Utilisateur introuvable sur ce serveur." });

    // Fetch all infractions from MongoDB
    let infractions = [];
    try {
      infractions = await getInfractions(user.id);
    } catch (err) {
      console.error('Erreur lors de la récupération des infractions :', err);
    }

    // Count by type (all-time, including resolved)
    const warnCount = infractions.filter(i => i.type === 'warn').length;
    const muteCount = infractions.filter(i => i.type === 'mute').length;
    const banCount  = infractions.filter(i => i.type === 'ban').length;

    // Build infraction history (most recent 10 entries)
  const historyLines = infractions.map(i => {
      const emoji     = TYPE_EMOJI[i.type] ?? '❓';
      const timestamp = Math.floor(new Date(i.timestamp).getTime() / 1000);
      const resolved  = i.resolved ? ' *(résolu)*' : '';
      return `${emoji} **${i.type.toUpperCase()}** — <t:${timestamp}:d> — ${i.reason}${resolved}`;
    });

    const historyValue = historyLines.length > 0
      ? historyLines.join('\n')
      : '*Aucune infraction enregistrée.*';

    const embed = new EmbedBuilder()
      .setTitle(`Dossier de ${user.tag}`)
      .setColor('Red')
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Pseudo',              value: member.displayName,                                        inline: true },
        { name: 'ID',                  value: user.id,                                                   inline: true },
        { name: '\u200B',              value: '\u200B',                                                   inline: true },
        { name: '⚠️ Warn(s)',          value: `${warnCount}`,                                            inline: true },
        { name: '🔇 Mute(s)',          value: `${muteCount}`,                                            inline: true },
        { name: '🔨 Ban(s)',           value: `${banCount}`,                                             inline: true },
        { name: 'Arrivée',             value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,      inline: true },
        { name: 'Création du compte',  value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,      inline: true },
        { name: '\u200B',              value: '\u200B',                                                   inline: true },
        { name: `📋 Historique des infractions (${infractions.length} total)`, value: historyValue }
      )
      .setFooter({ text: `Requête de ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    await interaction.editReply({ embeds: [embed] });
  }
};
