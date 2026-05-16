const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { loadVoicemasterData, saveVoicemasterData } = require('../features/voicemaster/voicemaster');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupjoin')
        .setDescription('Set up a join-to-create voice channel')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Voice channel to use as join-to-create')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildVoice)
        ),

    async execute(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('channel');
        const data = loadVoicemasterData();
        
        if (data.joinToCreateChannels.includes(channel.id)) {
            return await interaction.reply({
                content: `❌ ${channel.name} is already set up as a join-to-create channel.`,
                flags: MessageFlags.Ephemeral
            });
        }
        
        data.joinToCreateChannels.push(channel.id);
        saveVoicemasterData(data);
        
        await interaction.reply({
            content: `✅ Successfully set up ${channel.name} as a join-to-create channel!\n\n` +
                     `When users join this channel, a temporary voice channel will be created for them ` +
                     `and they'll get a control menu in the text chat.`,
            flags: MessageFlags.Ephemeral
        });
    }
};