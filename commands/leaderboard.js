const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getProgressToNextLevel } = require('../features/xp/xpUtils');
const { loadGuildXpData } = require('../features/xp/xpStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the top members by XP/level'),
    async execute(interaction) {
        await interaction.deferReply();
        const xpData = loadGuildXpData(interaction.guild.id);
        
        // Sort users by XP
        const sorted = Object.entries(xpData)
            .sort(([, a], [, b]) => b.xp - a.xp);
        
        if (sorted.length === 0) {
            await interaction.editReply('No XP data available yet.');
            return;
        }

        // Fetch top potential members (to avoid timeouts)
        const topUserIds = sorted.slice(0, 50).map(([userId]) => userId);
        const members = await interaction.guild.members.fetch({ user: topUserIds });

        // Build leaderboard entries
        let description = '';
        const medals = ['🥇', '🥈', '🥉'];
        let rankCounter = 1;
        
        for (let i = 0; i < topUserIds.length && rankCounter <= 10; i++) {
            const [userId, data] = sorted[i];
            const member = members.get(userId);
            
            if (member) {
                const displayName = member.displayName;
                const { progress, required } = getProgressToNextLevel(data.xp, data.level);
                const rank = rankCounter < 4 ? medals[rankCounter - 1] : `#${rankCounter}`;
                description += `${rank} **${displayName}**\n`;
                description += `Lv ${data.level} • ${data.xp.toLocaleString()} XP • ${progress}/${required} to next\n\n`;
                rankCounter++;
            }
        }

        const guildName = interaction.guild?.name || 'This Server';

        const embed = new EmbedBuilder()
            .setTitle(`🏆 ${guildName} Leaderboard`)
            .setDescription(description.trim())
            .setColor(0xFFA500)
            .setThumbnail(interaction.guild.iconURL())
            .setFooter({ text: `Top ${rankCounter - 1} members` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
