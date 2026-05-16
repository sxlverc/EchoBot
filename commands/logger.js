const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../configStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logger')
        .setDescription('Manage server logging settings and configuration')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName('settings')
                .setDescription('Configure logging channels and events')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('What action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Set Log Channel', value: 'set_channel' },
                            { name: 'Enable Event', value: 'enable_event' },
                            { name: 'Disable Event', value: 'disable_event' },
                            { name: 'Ignore Channel', value: 'ignore_channel' },
                            { name: 'Unignore Channel', value: 'unignore_channel' },
                            { name: 'Toggle Bot Logging', value: 'toggle_bots' },
                            { name: 'View Configuration', value: 'view_config' },
                            { name: 'Reset All', value: 'reset_all' }
                        ))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel for logging or to ignore')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('event_type')
                        .setDescription('Type of events to configure')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Channel Events', value: 'logChannelEvents' },
                            { name: 'Role Events', value: 'logRoleEvents' },
                            { name: 'Message Events', value: 'logMessageEvents' },
                            { name: 'Member Events', value: 'logMemberEvents' },
                            { name: 'Voice Events', value: 'logVoiceEvents' },
                            { name: 'Moderation Events', value: 'logModerationEvents' },
                            { name: 'Emoji Events', value: 'logEmojiEvents' },
                            { name: 'Image Edits', value: 'logImageEdits' }
                        ))
                .addStringOption(option =>
                    option.setName('log_channel_type')
                        .setDescription('Type of log channel to set')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Server Events (channels, roles, emojis)', value: 'serverLogs' },
                            { name: 'Role Events', value: 'roleLogs' },
                            { name: 'Message Events', value: 'messageLogs' },
                            { name: 'Voice Events', value: 'vcLogs' }
                        ))),

    async execute(interaction) {
        const action = interaction.options.getString('action');
        const channel = interaction.options.getChannel('channel');
        const eventType = interaction.options.getString('event_type');
        const logChannelType = interaction.options.getString('log_channel_type');

        try {
            const guildId = interaction.guild.id;
            const config = getGuildConfig(guildId);

            switch (action) {
                case 'set_channel':
                    if (!channel || !logChannelType) {
                        await interaction.reply({ content: '❌ Please specify both a channel and log channel type.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    // Validate that the bot has permissions in the channel
                    const botMember = await interaction.guild.members.fetchMe();
                    const permissions = channel.permissionsFor(botMember);
                    
                    if (!permissions.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
                        await interaction.reply({ 
                            content: '❌ I don\'t have the required permissions (View Channel, Send Messages, Embed Links) in that channel.', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return;
                    }

                    config.channels[logChannelType] = channel.id;
                    setGuildConfig(guildId, config);

                    const channelEmbed = new EmbedBuilder()
                        .setTitle('✅ Log Channel Updated')
                        .setColor(0x00ff00)
                        .addFields(
                            { name: 'Channel', value: `${channel}`, inline: true },
                            { name: 'Event Type', value: logChannelType, inline: true }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [channelEmbed], flags: MessageFlags.Ephemeral });
                    break;

                case 'enable_event':
                case 'disable_event':
                    if (!eventType) {
                        await interaction.reply({ content: '❌ Please specify an event type to enable/disable.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    // Validate event type exists
                    const validEvents = ['logChannelEvents', 'logRoleEvents', 'logMessageEvents', 'logMemberEvents', 
                                       'logVoiceEvents', 'logModerationEvents', 'logEmojiEvents', 'logImageEdits'];
                    if (!validEvents.includes(eventType)) {
                        await interaction.reply({ content: '❌ Invalid event type.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    const enable = action === 'enable_event';
                    config.features.serverLogger[eventType] = enable;
                    setGuildConfig(guildId, config);

                    const eventEmbed = new EmbedBuilder()
                        .setTitle(`✅ Event ${enable ? 'Enabled' : 'Disabled'}`)
                        .setColor(enable ? 0x00ff00 : 0xff0000)
                        .addFields(
                            { name: 'Event', value: eventType.replace('log', '').replace('Events', ' Events'), inline: true },
                            { name: 'Status', value: enable ? 'Enabled' : 'Disabled', inline: true }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [eventEmbed], flags: MessageFlags.Ephemeral });
                    break;

                case 'ignore_channel':
                case 'unignore_channel':
                    if (!channel) {
                        await interaction.reply({ content: '❌ Please specify a channel to ignore/unignore.', flags: MessageFlags.Ephemeral });
                        return;
                    }

                    if (!config.features.xp.excludedChannels) {
                        config.features.xp.excludedChannels = [];
                    }

                    const channelId = channel.id;
                    const isCurrentlyIgnored = config.features.xp.excludedChannels.includes(channelId);

                    if (action === 'ignore_channel') {
                        if (isCurrentlyIgnored) {
                            await interaction.reply({ content: `❌ Channel ${channel} is already ignored.`, flags: MessageFlags.Ephemeral });
                            return;
                        }
                        config.features.xp.excludedChannels.push(channelId);
                    } else {
                        if (!isCurrentlyIgnored) {
                            await interaction.reply({ content: `❌ Channel ${channel} is not currently ignored.`, flags: MessageFlags.Ephemeral });
                            return;
                        }
                        config.features.xp.excludedChannels = config.features.xp.excludedChannels.filter(id => id !== channelId);
                    }

                    setGuildConfig(guildId, config);

                    const ignoreEmbed = new EmbedBuilder()
                        .setTitle(`✅ Channel ${action === 'ignore_channel' ? 'Ignored' : 'Unignored'}`)
                        .setColor(action === 'ignore_channel' ? 0xff0000 : 0x00ff00)
                        .addFields(
                            { name: 'Channel', value: `${channel}`, inline: true },
                            { name: 'Action', value: action === 'ignore_channel' ? 'Now ignored' : 'No longer ignored', inline: true }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [ignoreEmbed], flags: MessageFlags.Ephemeral });
                    break;

                case 'toggle_bots':
                    if (!config.features.serverLogger.hasOwnProperty('ignoreBots')) {
                        config.features.serverLogger.ignoreBots = true;
                    }

                    config.features.serverLogger.ignoreBots = !config.features.serverLogger.ignoreBots;
                    setGuildConfig(guildId, config);

                    const botEmbed = new EmbedBuilder()
                        .setTitle('✅ Bot Logging Toggled')
                        .setColor(config.features.serverLogger.ignoreBots ? 0xff0000 : 0x00ff00)
                        .addFields(
                            { name: 'Bot Activities', value: config.features.serverLogger.ignoreBots ? 'Ignored' : 'Logged', inline: true },
                            { name: 'Status', value: config.features.serverLogger.ignoreBots ? 'Bots will be ignored in message events' : 'Bot activities will be logged', inline: true }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [botEmbed], flags: MessageFlags.Ephemeral });
                    break;

                case 'view_config':
                    try {
                        const channels = config.channels;
                        const features = config.features.serverLogger;
                        const ignoredChannels = config.features.xp.excludedChannels || [];

                        // Create a simple, concise embed
                        const configEmbed = new EmbedBuilder()
                            .setTitle('📊 Logging Configuration')
                            .setColor(0x0099ff)
                            .setTimestamp();

                        // Quick status overview
                        const enabledEvents = Object.entries(features).filter(([key, value]) =>
                            key !== 'enabled' && key !== 'ignoreBots' && value === true
                        ).length;

                        const totalEvents = Object.keys(features).filter(key =>
                            key !== 'enabled' && key !== 'ignoreBots'
                        ).length;

                        const configuredChannels = ['serverLogs', 'roleLogs', 'messageLogs', 'vcLogs']
                            .filter(type => channels[type]).length;

                        configEmbed.setDescription(
                            `**Events:** ${enabledEvents}/${totalEvents} enabled\n` +
                            `**Channels:** ${configuredChannels}/4 configured\n` +
                            `**Ignored:** ${ignoredChannels.length} channels\n` +
                            `**Bots:** ${features.ignoreBots !== false ? 'Ignored' : 'Logged'}`
                        );

                        // Log Channels
                        const channelStatus = [
                            `Server: ${channels.serverLogs ? `<#${channels.serverLogs}>` : '❌ Not set'}`,
                            `Role: ${channels.roleLogs ? `<#${channels.roleLogs}>` : '❌ Not set'}`,
                            `Message: ${channels.messageLogs ? `<#${channels.messageLogs}>` : '❌ Not set'}`,
                            `Voice: ${channels.vcLogs ? `<#${channels.vcLogs}>` : '❌ Not set'}`
                        ].join('\n');

                        configEmbed.addFields({
                            name: '📺 Log Channels',
                            value: channelStatus,
                            inline: false
                        });

                        // Event Status (compact)
                        const eventStatus = [
                            `Channels: ${features.logChannelEvents ? '✅' : '❌'}`,
                            `Roles: ${features.logRoleEvents ? '✅' : '❌'}`,
                            `Messages: ${features.logMessageEvents ? '✅' : '❌'}`,
                            `Members: ${features.logMemberEvents ? '✅' : '❌'}`,
                            `Voice: ${features.logVoiceEvents ? '✅' : '❌'}`,
                            `Moderation: ${features.logModerationEvents ? '✅' : '❌'}`,
                            `Emojis: ${features.logEmojiEvents ? '✅' : '❌'}`,
                            `Images: ${features.logImageEdits ? '✅' : '❌'}`
                        ].join(' • ');

                        configEmbed.addFields({
                            name: '⚙️ Events',
                            value: eventStatus,
                            inline: false
                        });

                        // Ignored channels (if any)
                        if (ignoredChannels.length > 0) {
                            const ignoredList = ignoredChannels.slice(0, 5).map(id => `<#${id}>`).join(', ');
                            const moreText = ignoredChannels.length > 5 ? ` (+${ignoredChannels.length - 5} more)` : '';
                            configEmbed.addFields({
                                name: '🚫 Ignored Channels',
                                value: ignoredList + moreText,
                                inline: false
                            });
                        }

                        await interaction.reply({ embeds: [configEmbed], flags: MessageFlags.Ephemeral });
                    } catch (error) {
                        console.error('Error in view_config:', error);
                        await interaction.reply({ 
                            content: '❌ Error displaying configuration. Please try again.', 
                            flags: MessageFlags.Ephemeral 
                        });
                    }
                    break;

                case 'reset_all':
                    // Reset all logging channels
                    const logChannelTypes = ['serverLogs', 'roleLogs', 'messageLogs', 'vcLogs'];
                    logChannelTypes.forEach(type => {
                        if (config.channels[type]) {
                            delete config.channels[type];
                        }
                    });

                    // Disable all logging events
                    Object.keys(config.features.serverLogger).forEach(key => {
                        if (key !== 'enabled') {
                            config.features.serverLogger[key] = false;
                        }
                    });

                    // Clear ignored channels
                    config.features.xp.excludedChannels = [];

                    setGuildConfig(guildId, config);

                    const resetEmbed = new EmbedBuilder()
                        .setTitle('✅ All Logging Reset')
                        .setColor(0xff0000)
                        .setDescription('All logging channels, events, and ignored channels have been reset.')
                        .setTimestamp();

                    await interaction.reply({ embeds: [resetEmbed], flags: MessageFlags.Ephemeral });
                    break;
            }
        } catch (error) {
            console.error('Error updating config:', error);
            const errorMessage = error.code === 'EACCES' 
                ? '❌ Permission denied: Cannot write to configuration file.'
                : error.code === 'ENOENT'
                ? '❌ Configuration file not found.'
                : '❌ Failed to update logging configuration.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        }
    },
};