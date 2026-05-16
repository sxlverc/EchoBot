const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlevelrole')
        .setDescription('Set a role reward for reaching a specific level (Admin only)')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('The level to assign the role at')
                .setRequired(true)
                .setMinValue(1))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to assign at this level')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const level = interaction.options.getInteger('level');
        const role = interaction.options.getRole('role');
        
        try {
            const configPath = path.join(__dirname, '../config.json');
            let config = {};
            try {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch {
                config = {};
            }
            
            if (!config.levelRoles) {
                config.levelRoles = {};
            }
            
            config.levelRoles[level] = role.id;
            
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            
            await interaction.reply({
                content: `✅ Set **${role.name}** as the reward for reaching level **${level}**!`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Error setting level role:', error);
            await interaction.reply({ content: 'Error setting level role!', flags: MessageFlags.Ephemeral });
        }
    }
};