const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const timezones = {
    'est': { name: 'EST/EDT (Eastern US)', tz: 'America/New_York', offset: 'UTC-5/-4' },
    'cst': { name: 'CST/CDT (Central US)', tz: 'America/Chicago', offset: 'UTC-6/-5' },
    'mst': { name: 'MST/MDT (Mountain US)', tz: 'America/Denver', offset: 'UTC-7/-6' },
    'pst': { name: 'PST/PDT (Pacific US)', tz: 'America/Los_Angeles', offset: 'UTC-8/-7' },
    'gmt': { name: 'GMT/BST (UK)', tz: 'Europe/London', offset: 'UTC+0/+1' },
    'cet': { name: 'CET/CEST (Central Europe)', tz: 'Europe/Paris', offset: 'UTC+1/+2' },
    'eet': { name: 'EET/EEST (Eastern Europe)', tz: 'Europe/Bucharest', offset: 'UTC+2/+3' },
    'wita': { name: 'WITA (Indonesia)', tz: 'Asia/Makassar', offset: 'UTC+8' },
    'nzst': { name: 'NZST/NZDT (New Zealand)', tz: 'Pacific/Auckland', offset: 'UTC+12/+13' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Displays the current time in a selected timezone')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('Select a timezone')
                .setRequired(true)
                .addChoices(
                    { name: 'EST/EDT (Eastern US)', value: 'est' },
                    { name: 'CST/CDT (Central US)', value: 'cst' },
                    { name: 'MST/MDT (Mountain US)', value: 'mst' },
                    { name: 'PST/PDT (Pacific US)', value: 'pst' },
                    { name: 'GMT/BST (UK)', value: 'gmt' },
                    { name: 'CET/CEST (Central Europe)', value: 'cet' },
                    { name: 'EET/EEST (Eastern Europe)', value: 'eet' },
                    { name: 'WITA (Indonesia)', value: 'wita' },
                    { name: 'NZST/NZDT (New Zealand)', value: 'nzst' }
                )),
    async execute(interaction) {
        const timezoneKey = interaction.options.getString('timezone');
        const timezone = timezones[timezoneKey];

        const now = new Date();
        
        // Get time components in the target timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone.tz,
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const parts = formatter.formatToParts(now);
        const timeObj = {};
        parts.forEach(part => {
            timeObj[part.type] = part.value;
        });
        
        // Ensure hour is properly formatted (00-23)
        let hour = parseInt(timeObj.hour);
        if (hour === 24) hour = 0; // Fix for midnight showing as 24
        
        const timeString = `${timeObj.month} ${timeObj.day}, ${timeObj.year} ${hour.toString().padStart(2, '0')}:${timeObj.minute}:${timeObj.second}`;

        const embed = new EmbedBuilder()
            .setTitle(`🕐 Current Time in ${timezone.name}`)
            .setDescription(`**${timeString}**`)
            .setColor(0x5865F2)
            .setFooter({ text: timezone.offset });

        await interaction.reply({ embeds: [embed] });
    }
};