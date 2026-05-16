const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../configStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configvoicemaster')
        .setDescription('Configure VoiceMaster settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable VoiceMaster system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable VoiceMaster system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('jointocreate')
                .setDescription('Set the join-to-create voice channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Voice channel for join-to-create')
                        .setRequired(true)
                        .addChannelTypes(2))) // Voice channel type
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current VoiceMaster configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            const guildId = interaction.guild.id;
            const config = getGuildConfig(guildId);
            
            if (!config.features.voicemaster) {
                config.features.voicemaster = {
                    joinToCreateChannel: null
                };
            }

            switch (subcommand) {
                case 'enable':
                    config.features.voicemaster.enabled = true;
                    await interaction.reply({
                        content: '✅ VoiceMaster system **enabled**!',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'disable':
                    config.features.voicemaster.enabled = false;
                    await interaction.reply({
                        content: '❌ VoiceMaster system **disabled**!',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'jointocreate':
                    const channel = interaction.options.getChannel('channel');
                    config.features.voicemaster.joinToCreateChannel = channel.id;
                    await interaction.reply({
                        content: `✅ Join-to-create channel set to **<#${channel.id}>**!\nUsers can now join this channel to create their own voice channels.`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'status':
                    const jtcChannel = config.features.voicemaster.joinToCreateChannel;
                    await interaction.reply({
                        content: `**🎤 VoiceMaster Configuration**\n\n` +
                                `**System:** ${config.features.voicemaster.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                                `**Join-to-Create Channel:** ${jtcChannel ? `<#${jtcChannel}>` : 'Not set'}`,
                        flags: MessageFlags.Ephemeral
                    });
                    return; // Don't save config for status check
            }

            // Save guild-specific config
            setGuildConfig(guildId, config);

        } catch (error) {
            console.error('Error configuring VoiceMaster settings:', error);
            await interaction.reply({
                content: '❌ Failed to configure VoiceMaster settings.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};