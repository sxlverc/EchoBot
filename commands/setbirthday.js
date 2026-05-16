const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

const birthdayDataPath = path.join(__dirname, '../data/birthdayData.json');

function loadBirthdayData() {
    try {
        const raw = JSON.parse(fs.readFileSync(birthdayDataPath, 'utf8'));
        if (raw.guilds && typeof raw.guilds === 'object') return raw;
        return { guilds: {}, legacy: raw };
    } catch {
        return { guilds: {}, legacy: {} };
    }
}

function saveBirthdayData(data) {
    fs.writeFileSync(birthdayDataPath, JSON.stringify(data, null, 2));
}

function getGuildBirthdays(data, guildId) {
    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) data.guilds[guildId] = {};
    return data.guilds[guildId];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setbirthday')
        .setDescription('Set your birthday to get a special role on your big day!')
        .addIntegerOption(option =>
            option.setName('month')
                .setDescription('Birth month (1-12)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(12))
        .addIntegerOption(option =>
            option.setName('day')
                .setDescription('Birth day (1-31)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(31)),
    async execute(interaction) {
        const month = interaction.options.getInteger('month');
        const day = interaction.options.getInteger('day');
        
        // Validate the date
        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (day > daysInMonth[month - 1]) {
            await interaction.reply({
                content: `❌ Invalid date! Month ${month} only has ${daysInMonth[month - 1]} days.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        try {
            const birthdayData = loadBirthdayData();
            const guildBirthdays = getGuildBirthdays(birthdayData, interaction.guild.id);
            
            // Store birthday (user ID is the key)
            guildBirthdays[interaction.user.id] = {
                month: month,
                day: day
            };
            
            saveBirthdayData(birthdayData);
            
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                               'July', 'August', 'September', 'October', 'November', 'December'];
            
            await interaction.reply({
                content: `🎂 Birthday set to **${monthNames[month - 1]} ${day}**! You'll get a special role and celebration on your birthday!`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Error setting birthday:', error);
            await interaction.reply({
                content: '❌ Error saving your birthday. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
