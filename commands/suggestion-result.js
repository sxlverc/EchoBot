const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { closeSuggestion } = require('../features/suggestions/suggestions');
const getConfig = require('../configHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestion-result')
        .setDescription('Close a suggestion and announce the result to all voters')
        .addIntegerOption(option =>
            option
                .setName('id')
                .setDescription('The suggestion ID number')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option
                .setName('result')
                .setDescription('The result of the suggestion')
                .setRequired(true)
                .addChoices(
                    { name: 'Accepted', value: 'Accepted' },
                    { name: 'Rejected', value: 'Rejected' },
                    { name: 'Under Review', value: 'Under Review' },
                    { name: 'Implemented', value: 'Implemented' },
                    { name: 'Closed', value: 'Closed' }
                )
        )
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Optional message to include with the result')
                .setRequired(false)
                .setMaxLength(500)
        ),

    async execute(interaction) {
        const config = getConfig(interaction.guild.id);
        // Check privileged executor permission
        if (!config.isPrivilegedExecutor(interaction.member)) {
            return await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        const suggestionId = interaction.options.getInteger('id');
        const result = interaction.options.getString('result');
        const adminMessage = interaction.options.getString('message');
        
        await interaction.reply({
            content: '📋 Processing suggestion result...',
            flags: MessageFlags.Ephemeral
        });
        
        try {
            await closeSuggestion(interaction, suggestionId, result, adminMessage);
        } catch (error) {
            console.error('Error processing suggestion result:', error);
            await interaction.followUp({
                content: '❌ There was an error processing the suggestion result. Please check the suggestion ID and try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};