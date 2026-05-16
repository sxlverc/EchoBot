const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/starboard.json');

function loadData() {
    try {
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (error) {
        return { config: {}, messages: {} };
    }
}

function saveData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Configure the starboard system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the starboard channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to post starred messages')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('threshold')
                        .setDescription('Number of stars required (default: 3)')
                        .setMinValue(1)
                        .setMaxValue(50)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable the starboard system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('View current starboard configuration'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View starboard statistics')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const data = loadData();
        const guildId = interaction.guild.id;

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const threshold = interaction.options.getInteger('threshold') || 3;

            // Initialize config if not exists
            if (!data.config) data.config = {};
            
            data.config[guildId] = {
                channelId: channel.id,
                threshold: threshold
            };

            saveData(data);

            const embed = new EmbedBuilder()
                .setTitle('⭐ Starboard Configured')
                .setDescription(`The starboard has been set up successfully!`)
                .addFields(
                    { name: 'Channel', value: channel.toString(), inline: true },
                    { name: 'Threshold', value: `${threshold} ⭐`, inline: true }
                )
                .setColor(0xffd700)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === 'disable') {
            if (!data.config || !data.config[guildId]) {
                return await interaction.reply({
                    content: '❌ Starboard is not configured for this server.',
                    flags: MessageFlags.Ephemeral
                });
            }

            delete data.config[guildId];
            
            // Clean up message data for this guild
            const messagesToDelete = [];
            for (const [key, value] of Object.entries(data.messages)) {
                if (key.startsWith(`${guildId}-`)) {
                    messagesToDelete.push(key);
                }
            }
            
            messagesToDelete.forEach(key => delete data.messages[key]);
            saveData(data);

            await interaction.reply({
                content: '✅ Starboard has been disabled and all data has been cleared.',
                flags: MessageFlags.Ephemeral
            });

        } else if (subcommand === 'info') {
            const config = data.config ? data.config[guildId] : null;

            if (!config) {
                return await interaction.reply({
                    content: '❌ Starboard is not configured for this server. Use `/starboard setup` to set it up.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);

            const embed = new EmbedBuilder()
                .setTitle('⭐ Starboard Configuration')
                .addFields(
                    { name: 'Channel', value: channel ? channel.toString() : '❌ Channel not found', inline: true },
                    { name: 'Threshold', value: `${config.threshold} ⭐`, inline: true }
                )
                .setColor(0xffd700)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'stats') {
            const config = data.config ? data.config[guildId] : null;

            if (!config) {
                return await interaction.reply({
                    content: '❌ Starboard is not configured for this server.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Count messages for this guild
            let messageCount = 0;
            const authorStats = {};

            for (const [key, value] of Object.entries(data.messages)) {
                if (key.startsWith(`${guildId}-`)) {
                    messageCount++;
                    const authorId = value.authorId;
                    authorStats[authorId] = (authorStats[authorId] || 0) + 1;
                }
            }

            // Sort authors by count
            const topAuthors = Object.entries(authorStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            const embed = new EmbedBuilder()
                .setTitle('⭐ Starboard Statistics')
                .setDescription(`Total starred messages: **${messageCount}**`)
                .setColor(0xffd700)
                .setTimestamp();

            if (topAuthors.length > 0) {
                const topAuthorsList = await Promise.all(
                    topAuthors.map(async ([authorId, count], index) => {
                        try {
                            const user = await interaction.client.users.fetch(authorId);
                            return `${index + 1}. ${user.tag} - **${count}** message${count !== 1 ? 's' : ''}`;
                        } catch {
                            return `${index + 1}. Unknown User - **${count}** message${count !== 1 ? 's' : ''}`;
                        }
                    })
                );

                embed.addFields({
                    name: 'Top Contributors',
                    value: topAuthorsList.join('\n')
                });
            }

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};
