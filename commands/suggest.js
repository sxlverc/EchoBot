const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createSuggestion } = require('../features/suggestions/suggestions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion for the community to vote on')
        .addStringOption(option =>
            option
                .setName('suggestion')
                .setDescription('Your suggestion')
                .setRequired(true)
                .setMaxLength(1000)
        )
        .addIntegerOption(option =>
            option
                .setName('timer')
                .setDescription('Auto-close timer in hours (optional)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(168) // Max 1 week
        ),

    async execute(interaction) {
        const suggestionText = interaction.options.getString('suggestion');
        const timerHours = interaction.options.getInteger('timer');
        
        // Default to 24 hours if no timer is provided
        const actualTimerHours = timerHours || 24;
        
        await interaction.reply({
            content: timerHours ? 
                `✅ Your suggestion has been submitted with a ${timerHours} hour timer!` :
                '✅ Your suggestion has been submitted! It will auto-close in 24 hours.',
            flags: MessageFlags.Ephemeral
        });
        
        try {
            // Convert hours to minutes for the backend
            const timerMinutes = actualTimerHours * 60;
            // Pass isDefaultTimer flag if user didn't provide a custom timer
            const isDefaultTimer = !timerHours;
            await createSuggestion(interaction, suggestionText, timerMinutes, null, false, isDefaultTimer);
        } catch (error) {
            console.error('Error creating suggestion:', error);
            await interaction.followUp({
                content: '❌ There was an error creating your suggestion. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};