const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getGuildConfig, setGuildConfig } = require('../configStore');

const bumpDataPath = path.join(__dirname, '../data/bumpData.json');

function defaultGuildBumpData() {
    return {
        disboard: { lastBump: 0, reminderSent: false, channelId: null },
        discadia: { lastBump: 0, reminderSent: false, channelId: null }
    };
}

function loadAllBumpData() {
    try {
        const raw = JSON.parse(fs.readFileSync(bumpDataPath, 'utf8'));
        if (raw.guilds && typeof raw.guilds === 'object') return raw;

        // Legacy format migration
        if (raw.disboard || raw.discadia) {
            return { guilds: { legacy: { ...defaultGuildBumpData(), ...raw } } };
        }

        return { guilds: {} };
    } catch {
        return { guilds: {} };
    }
}

function saveAllBumpData(data) {
    fs.writeFileSync(bumpDataPath, JSON.stringify(data, null, 2));
}

function getGuildBumpData(data, guildId) {
    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuildBumpData();
    return data.guilds[guildId];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bumpreminder')
        .setDescription('Configure bump reminder settings for DISBOARD and Discadia')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable bump reminder system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable bump reminder system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disboard')
                .setDescription('Toggle DISBOARD bump reminder')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable or disable DISBOARD bump reminder')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('discadia')
                .setDescription('Toggle Discadia bump reminder')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable or disable Discadia bump reminder')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View bump reminder status and next bump times'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset bump timers (allows immediate bumping)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        
        try {
            const config = getGuildConfig(guildId);
            config.features.bumpReminder = config.features.bumpReminder || { enabled: false, disboard: true, discadia: true };

            const allBumpData = loadAllBumpData();
            const bumpData = getGuildBumpData(allBumpData, guildId);

            switch (subcommand) {
                case 'enable':
                    config.features.bumpReminder.enabled = true;
                    await interaction.reply({
                        content: '✅ Bump reminder system **enabled**!\nThe bot will send reminders to bump DISBOARD every 2 hours and Discadia every 24 hours.',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'disable':
                    config.features.bumpReminder.enabled = false;
                    await interaction.reply({
                        content: '❌ Bump reminder system **disabled**!\nAutomatic reminders have been turned off.',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'disboard':
                    const disboardEnabled = interaction.options.getBoolean('enabled');
                    config.features.bumpReminder.disboard = disboardEnabled;
                    await interaction.reply({
                        content: `${disboardEnabled ? '✅' : '❌'} DISBOARD bump reminder **${disboardEnabled ? 'enabled' : 'disabled'}**!`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'discadia':
                    const discadiaEnabled = interaction.options.getBoolean('enabled');
                    config.features.bumpReminder.discadia = discadiaEnabled;
                    await interaction.reply({
                        content: `${discadiaEnabled ? '✅' : '❌'} Discadia bump reminder **${discadiaEnabled ? 'enabled' : 'disabled'}**!`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'status':
                    const now = Date.now();
                    const disboardNext = bumpData.disboard.lastBump + 7200000; // 2 hours
                    const discadiaNext = bumpData.discadia.lastBump + 86400000; // 24 hours
                    
                    const formatTime = (timestamp) => {
                        if (timestamp <= now) return 'Ready to bump!';
                        const minutes = Math.ceil((timestamp - now) / 60000);
                        if (minutes < 60) return `${minutes} minutes`;
                        const hours = Math.floor(minutes / 60);
                        const remainingMinutes = minutes % 60;
                        return `${hours}h ${remainingMinutes}m`;
                    };

                    await interaction.reply({
                        content: `**🤖 Bump Reminder Status**\n\n` +
                            `**System:** ${config.features.bumpReminder.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                                `**DISBOARD:**\n` +
                            `• Status: ${config.features.bumpReminder.disboard ? '✅ Enabled' : '❌ Disabled'}\n` +
                                `• Next bump: ${formatTime(disboardNext)}\n` +
                                `• Channel: ${bumpData.disboard.channelId ? `<#${bumpData.disboard.channelId}>` : 'Not set'}\n\n` +
                                `**Discadia:**\n` +
                            `• Status: ${config.features.bumpReminder.discadia ? '✅ Enabled' : '❌ Disabled'}\n` +
                                `• Next bump: ${formatTime(discadiaNext)}\n` +
                                `• Channel: ${bumpData.discadia.channelId ? `<#${bumpData.discadia.channelId}>` : 'Not set'}`,
                        flags: MessageFlags.Ephemeral
                    });
                    return; // Don't save config for status check

                case 'reset':
                    bumpData.disboard.lastBump = 0;
                    bumpData.disboard.reminderSent = false;
                    bumpData.discadia.lastBump = 0;
                    bumpData.discadia.reminderSent = false;
                    saveAllBumpData(allBumpData);
                    await interaction.reply({
                        content: '🔄 Bump timers **reset**! Both DISBOARD and Discadia are ready to bump immediately.',
                        flags: MessageFlags.Ephemeral
                    });
                    return; // Don't save config for reset
            }

            // Save config for enable/disable commands
            setGuildConfig(guildId, config);
            saveAllBumpData(allBumpData);

        } catch (error) {
            console.error('Error configuring bump reminder:', error);
            await interaction.reply({
                content: '❌ Failed to configure bump reminder settings.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};