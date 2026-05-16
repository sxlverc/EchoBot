const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getLevelFromXp } = require('../features/xp/xpUtils');
const { loadGuildXpData, saveGuildXpData } = require('../features/xp/xpStore');
const { getGuildConfig, setGuildConfig } = require('../configStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xp')
        .setDescription('XP system management and configuration')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add XP to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to add XP to')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('The XP amount to add')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a user\'s XP')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to set XP for')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('The XP amount to set')
                        .setRequired(true)
                        .setMinValue(0)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset a user\'s XP and level')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to reset XP for')
                        .setRequired(true)))
        .addSubcommandGroup(group =>
            group
                .setName('config')
                .setDescription('Configure XP settings')
                .addSubcommand(sub =>
                    sub
                        .setName('message')
                        .setDescription('Set XP per message')
                        .addIntegerOption(opt =>
                            opt.setName('amount')
                                .setDescription('XP amount per message')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(100)))
                .addSubcommand(sub =>
                    sub
                        .setName('voice')
                        .setDescription('Set XP per minute in voice')
                        .addIntegerOption(opt =>
                            opt.setName('amount')
                                .setDescription('XP amount per minute in voice')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(50)))
                .addSubcommand(sub =>
                    sub
                        .setName('level')
                        .setDescription('Set XP required per level')
                        .addIntegerOption(opt =>
                            opt.setName('amount')
                                .setDescription('XP required per level')
                                .setRequired(true)
                                .setMinValue(50)
                                .setMaxValue(1000)))
                .addSubcommand(sub =>
                    sub
                        .setName('cooldown')
                        .setDescription('Set message cooldown for XP (anti-spam)')
                        .addIntegerOption(opt =>
                            opt.setName('seconds')
                                .setDescription('Cooldown in seconds (default: 60)')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(300)))
                .addSubcommand(sub =>
                    sub
                        .setName('view')
                        .setDescription('View current XP settings')))
        .addSubcommandGroup(group =>
            group
                .setName('exclude')
                .setDescription('Manage channels excluded from XP')
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Exclude a channel from XP gain')
                        .addChannelOption(opt =>
                            opt.setName('channel')
                                .setDescription('Channel to exclude')
                                .setRequired(true)))
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('Remove channel from exclusion')
                        .addChannelOption(opt =>
                            opt.setName('channel')
                                .setDescription('Channel to include again')
                                .setRequired(true)))
                .addSubcommand(sub =>
                    sub
                        .setName('list')
                        .setDescription('List excluded channels')))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Check admin permissions
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You need Administrator permission for XP management.', flags: MessageFlags.Ephemeral });
        }

        const subGroup = interaction.options.getSubcommandGroup();
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        
        try {
            // Handle user XP management subcommands (add, set, reset)
            if (!subGroup && ['add', 'set', 'reset'].includes(sub)) {
                const user = interaction.options.getUser('user');
                const xpData = loadGuildXpData(guildId);
                
                if (sub === 'add') {
                    const xpToAdd = interaction.options.getInteger('amount');
                    
                    if (!xpData[user.id]) {
                        xpData[user.id] = { xp: 0, level: 1 };
                    }
                    
                    const oldLevel = xpData[user.id].level;
                    
                    xpData[user.id].xp += xpToAdd;
                    xpData[user.id].level = getLevelFromXp(xpData[user.id].xp);
                    
                    saveGuildXpData(guildId, xpData);
                    
                    let reply = `Added ${xpToAdd} XP to ${user.tag}. New total: ${xpData[user.id].xp} XP`;
                    
                    if (xpData[user.id].level > oldLevel) {
                        reply += ` (Level up! ${oldLevel} → ${xpData[user.id].level})`;
                    } else {
                        reply += ` (Level ${xpData[user.id].level})`;
                    }
                    
                    return interaction.reply({
                        content: reply,
                        flags: MessageFlags.Ephemeral
                    });
                } 
                else if (sub === 'set') {
                    const xp = interaction.options.getInteger('amount');
                    
                    if (!xpData[user.id]) {
                        xpData[user.id] = { xp: 0, level: 1 };
                    }
                    
                    xpData[user.id].xp = xp;
                    xpData[user.id].level = getLevelFromXp(xp);
                    
                    saveGuildXpData(guildId, xpData);
                    
                    return interaction.reply({
                        content: `Set ${user.tag}'s XP to ${xp} (Level ${xpData[user.id].level})`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                else if (sub === 'reset') {
                    if (xpData[user.id]) {
                        delete xpData[user.id];
                        saveGuildXpData(guildId, xpData);
                        return interaction.reply({
                            content: `Reset ${user.tag}'s XP and level data.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        return interaction.reply({ 
                            content: `${user.tag} has no XP data to reset.`, 
                            flags: MessageFlags.Ephemeral 
                        });
                    }
                }
            }
            
            // Handle config and exclude subcommand groups
            let config = getGuildConfig(guildId);
            
            // Initialize config structure
            if (!config.features) config.features = {};
            if (!config.features.xp) config.features.xp = {};
            if (!config.features.xp.excludedChannels) config.features.xp.excludedChannels = [];

            // Handle config subcommands
            if (subGroup === 'config') {
                if (sub === 'view') {
                    const settings = config.features.xp;
                    return interaction.reply({
                        content: `**Current XP Settings:**\n` +
                                `💬 Message XP: **${settings.messageXP}** per message\n` +
                                `🎤 Voice XP: **${settings.voiceXPPerMinute}** per minute\n` +
                                `⭐ XP per Level: **${settings.xpPerLevel}** XP needed\n` +
                                `⏱️ Message Cooldown: **${settings.messageCooldown / 1000}** seconds`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const amount = interaction.options.getInteger('amount') || interaction.options.getInteger('seconds');
                
                if (sub === 'message') {
                    config.features.xp.messageXP = amount;
                    setGuildConfig(guildId, config);
                    return interaction.reply({
                        content: `✅ Set message XP to **${amount}** per message!`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                if (sub === 'voice') {
                    config.features.xp.voiceXPPerMinute = amount;
                    setGuildConfig(guildId, config);
                    return interaction.reply({
                        content: `✅ Set voice XP to **${amount}** per minute!`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                if (sub === 'level') {
                    config.features.xp.xpPerLevel = amount;
                    setGuildConfig(guildId, config);
                    return interaction.reply({
                        content: `✅ Set XP per level to **${amount}** XP!`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                if (sub === 'cooldown') {
                    config.features.xp.messageCooldown = amount * 1000;
                    setGuildConfig(guildId, config);
                    return interaction.reply({
                        content: `✅ XP message cooldown set to **${amount} seconds**.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            // Handle exclude subcommands
            if (subGroup === 'exclude') {
                const excludedChannels = config.features.xp.excludedChannels;
                
                if (sub === 'add') {
                    const channel = interaction.options.getChannel('channel');
                    if (excludedChannels.includes(channel.id)) {
                        return interaction.reply({
                            content: `❌ ${channel} is already excluded from XP gain.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    excludedChannels.push(channel.id);
                    setGuildConfig(guildId, config);
                    return interaction.reply({
                        content: `✅ ${channel} excluded from XP gain.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                if (sub === 'remove') {
                    const channel = interaction.options.getChannel('channel');
                    const index = excludedChannels.indexOf(channel.id);
                    if (index === -1) {
                        return interaction.reply({
                            content: `❌ ${channel} is not excluded from XP gain.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    excludedChannels.splice(index, 1);
                    setGuildConfig(guildId, config);
                    return interaction.reply({
                        content: `✅ ${channel} will now award XP.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                if (sub === 'list') {
                    if (excludedChannels.length === 0) {
                        return interaction.reply({
                            content: '📋 No channels are excluded from XP gain.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    const channelList = excludedChannels
                        .map(id => {
                            const channel = interaction.guild.channels.cache.get(id);
                            return channel ? `• ${channel}` : `• Unknown Channel (${id})`;
                        })
                        .join('\n');
                    return interaction.reply({
                        content: `📋 **Excluded from XP:**\n${channelList}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            
        } catch (error) {
            console.error('Error in XP command:', error);
            return interaction.reply({ 
                content: '❌ An error occurred while processing XP configuration.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};
