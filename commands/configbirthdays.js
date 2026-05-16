const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../configStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configbirthdays')
        .setDescription('Configure birthday system settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable birthday system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable birthday system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current birthday configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            const guildId = interaction.guild.id;
            const config = getGuildConfig(guildId);
            
            if (!config.features.birthdays) {
                config.features.birthdays = {
                    enabled: true
                };
            }

            switch (subcommand) {
                case 'enable':
                    config.features.birthdays.enabled = true;
                    await interaction.reply({
                        content: '✅ Birthday system **enabled**!\nThe bot will automatically assign birthday roles on users\' birthdays.',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'disable':
                    config.features.birthdays.enabled = false;
                    await interaction.reply({
                        content: '❌ Birthday system **disabled**!\nBirthday roles will no longer be assigned automatically.',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'status':
                    await interaction.reply({
                        content: `**🎂 Birthday Configuration**\n\n` +
                                `**System:** ${config.features.birthdays.enabled ? '✅ Enabled' : '❌ Disabled'}`,
                        flags: MessageFlags.Ephemeral
                    });
                    return; // Don't save config for status check
            }

            // Save guild-specific config
            setGuildConfig(guildId, config);

        } catch (error) {
            console.error('Error configuring birthday settings:', error);
            await interaction.reply({
                content: '❌ Failed to configure birthday settings.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};