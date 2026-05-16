const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../configStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configlinkfixer')
        .setDescription('Configure Link Fixer settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable link fixer system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable link fixer system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('suppress')
                .setDescription('Toggle embed suppression for fixed links')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Enable or disable embed suppression')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current Link Fixer configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            const guildId = interaction.guild.id;
            const config = getGuildConfig(guildId);
            
            if (!config.features.linkFixer) {
                config.features.linkFixer = {
                    enabled: true,
                    suppressEmbeds: true
                };
            }

            switch (subcommand) {
                case 'enable':
                    config.features.linkFixer.enabled = true;
                    await interaction.reply({
                        content: '✅ Link fixer system **enabled**!\nThe bot will automatically fix Twitter/X and other links.',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'disable':
                    config.features.linkFixer.enabled = false;
                    await interaction.reply({
                        content: '❌ Link fixer system **disabled**!\nLinks will no longer be automatically fixed.',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'suppress':
                    const suppress = interaction.options.getBoolean('enabled');
                    config.features.linkFixer.suppressEmbeds = suppress;
                    await interaction.reply({
                        content: `${suppress ? '✅' : '❌'} Embed suppression **${suppress ? 'enabled' : 'disabled'}**!\nFixed links will ${suppress ? 'not show' : 'show'} embeds.`,
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'status':
                    const fixer = config.features.linkFixer;
                    await interaction.reply({
                        content: `**🔗 Link Fixer Configuration**\n\n` +
                                `**System:** ${fixer.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                                `**Suppress Embeds:** ${fixer.suppressEmbeds ? '✅ Enabled' : '❌ Disabled'}`,
                        flags: MessageFlags.Ephemeral
                    });
                    return; // Don't save config for status check
            }

            // Save guild-specific config
            setGuildConfig(guildId, config);

        } catch (error) {
            console.error('Error configuring link fixer settings:', error);
            await interaction.reply({
                content: '❌ Failed to configure link fixer settings.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};