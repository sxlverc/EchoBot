const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../configStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configxp')
        .setDescription('Configure XP system settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable XP system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable XP system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('messagexp')
                .setDescription('Set XP gained per message')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('XP amount per message')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('voicexp')
                .setDescription('Set XP gained per minute in voice channels')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('XP amount per minute')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(50)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('xpperlevel')
                .setDescription('Set XP required per level')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('XP required per level')
                        .setRequired(true)
                        .setMinValue(10)
                        .setMaxValue(1000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cooldown')
                .setDescription('Set message XP cooldown in milliseconds')
                .addIntegerOption(option =>
                    option.setName('milliseconds')
                        .setDescription('Cooldown time in milliseconds')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(60000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('excludechannel')
                .setDescription('Add or remove excluded channel for XP')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to exclude/include')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('exclude')
                        .setDescription('True to exclude, false to include')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current XP configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            const guildId = interaction.guild.id;
            const config = getGuildConfig(guildId);
            
            if (!config.features.xp) {
                config.features.xp = {
                    messageXP: 10,
                    voiceXPPerMinute: 5,
                    xpPerLevel: 100,
                    messageCooldown: 10000,
                    excludedChannels: []
                };
            }

            switch (subcommand) {
                case 'enable':
                    config.features.xp.enabled = true;
                    await interaction.reply({
                        content: '✅ XP system **enabled**!',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'disable':
                    config.features.xp.enabled = false;
                    await interaction.reply({
                        content: '❌ XP system **disabled**!',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'messagexp':
                    const messageXP = interaction.options.getInteger('amount');
                    config.features.xp.messageXP = messageXP;
                    await interaction.reply({
                        content: `✅ Message XP set to **${messageXP}** XP per message!`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'voicexp':
                    const voiceXP = interaction.options.getInteger('amount');
                    config.features.xp.voiceXPPerMinute = voiceXP;
                    await interaction.reply({
                        content: `✅ Voice XP set to **${voiceXP}** XP per minute!`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'xpperlevel':
                    const xpPerLevel = interaction.options.getInteger('amount');
                    config.features.xp.xpPerLevel = xpPerLevel;
                    await interaction.reply({
                        content: `✅ XP per level set to **${xpPerLevel}** XP!`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'cooldown':
                    const cooldown = interaction.options.getInteger('milliseconds');
                    config.features.xp.messageCooldown = cooldown;
                    await interaction.reply({
                        content: `✅ Message XP cooldown set to **${cooldown}** milliseconds!`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'excludechannel':
                    const channel = interaction.options.getChannel('channel');
                    const exclude = interaction.options.getBoolean('exclude');
                    const channelId = channel.id;
                    
                    if (!config.features.xp.excludedChannels) {
                        config.features.xp.excludedChannels = [];
                    }
                    
                    if (exclude) {
                        if (!config.features.xp.excludedChannels.includes(channelId)) {
                            config.features.xp.excludedChannels.push(channelId);
                            await interaction.reply({
                                content: `✅ Channel <#${channelId}> **excluded** from XP gains!`,
                                flags: MessageFlags.Ephemeral
                            });
                        } else {
                            await interaction.reply({
                                content: `⚠️ Channel <#${channelId}> is already excluded from XP gains!`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }
                    } else {
                        const index = config.features.xp.excludedChannels.indexOf(channelId);
                        if (index > -1) {
                            config.features.xp.excludedChannels.splice(index, 1);
                            await interaction.reply({
                                content: `✅ Channel <#${channelId}> **included** for XP gains!`,
                                flags: MessageFlags.Ephemeral
                            });
                        } else {
                            await interaction.reply({
                                content: `⚠️ Channel <#${channelId}> is not excluded from XP gains!`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }
                    }
                    break;

                case 'status':
                    const excludedChannelsList = config.features.xp.excludedChannels?.map(id => `<#${id}>`).join(', ') || 'None';
                    await interaction.reply({
                        content: `**⚙️ XP Configuration**\n\n` +
                                `**System:** ${config.features.xp.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                                `**Message XP:** ${config.features.xp.messageXP} XP per message\n` +
                                `**Voice XP:** ${config.features.xp.voiceXPPerMinute} XP per minute\n` +
                                `**XP per Level:** ${config.features.xp.xpPerLevel} XP\n` +
                                `**Message Cooldown:** ${config.features.xp.messageCooldown}ms\n` +
                                `**Excluded Channels:** ${excludedChannelsList}`,
                        flags: MessageFlags.Ephemeral
                    });
                    return; // Don't save config for status check
            }

            // Save guild-specific config
            setGuildConfig(guildId, config);

        } catch (error) {
            console.error('Error configuring XP settings:', error);
            await interaction.reply({
                content: '❌ Failed to configure XP settings.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};