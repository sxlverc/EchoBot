const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getXpForLevel, getProgressToNextLevel } = require('../features/xp/xpUtils');
const { loadGuildXpData, saveGuildXpData } = require('../features/xp/xpStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Check your or another user\'s rank and XP')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check rank for (optional)')
                .setRequired(false)),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guild.id;
        
        try {
            const xpData = loadGuildXpData(guildId);
            
            if (!xpData[targetUser.id]) {
                await interaction.reply(`${targetUser.tag} has no XP data yet.`);
                return;
            }
            
            const userData = xpData[targetUser.id];
            
            // Recalculate level from XP to ensure it's correct with new scaling
            const correctLevel = require('../features/xp/xpUtils').getLevelFromXp(userData.xp);
            if (correctLevel !== userData.level) {
                xpData[targetUser.id].level = correctLevel;
                saveGuildXpData(guildId, xpData);
            }
            
            const { progress, required } = getProgressToNextLevel(userData.xp, correctLevel);
            
            // Create progress bar
            const progressBarLength = 10;
            const progressPercent = Math.max(0, Math.min(1, progress / required));
            const filledBars = Math.floor(progressPercent * progressBarLength);
            const emptyBars = progressBarLength - filledBars;
            const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
            
            // Calculate rank
            const sortedUsers = Object.entries(xpData)
                .sort(([, a], [, b]) => b.xp - a.xp);
            const rank = sortedUsers.findIndex(([userId]) => userId === targetUser.id) + 1;
            
            const embed = new EmbedBuilder()
                .setTitle(`${targetUser.username}'s Rank`)
                .setColor(0xFFA500)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '🏆 Rank', value: `#${rank}`, inline: true },
                    { name: '⭐ Level', value: `${correctLevel}`, inline: true },
                    { name: '💎 Total XP', value: `${userData.xp}`, inline: true },
                    { name: '📊 Progress to Next Level', value: `${progressBar} ${Math.max(0, progress)}/${required}`, inline: false }
                );
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error getting rank:', error);
            await interaction.reply({ content: 'Error getting rank data!', flags: MessageFlags.Ephemeral });
        }
    }
};