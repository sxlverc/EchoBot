const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../configStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configpresence')
        .setDescription('Configure bot custom status/activity rotation for this server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current presence configuration'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setonline')
                .setDescription('Set bot online status')
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('Presence status')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Online', value: 'online' },
                            { name: 'Idle', value: 'idle' },
                            { name: 'Do Not Disturb', value: 'dnd' },
                            { name: 'Invisible', value: 'invisible' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrotate')
                .setDescription('Set activity rotation interval in minutes')
                .addIntegerOption(option =>
                    option.setName('minutes')
                        .setDescription('Minutes between activity changes')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(120)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('addcustom')
                .setDescription('Add a custom status line')
                .addStringOption(option =>
                    option.setName('state')
                        .setDescription('Custom status text (supports {line_count})')
                        .setRequired(true)
                        .setMaxLength(120)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('addactivity')
                .setDescription('Add a rotating game/listening/watching activity')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Activity type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Playing', value: 'playing' },
                            { name: 'Listening', value: 'listening' },
                            { name: 'Watching', value: 'watching' },
                            { name: 'Competing', value: 'competing' }
                        ))
                .addStringOption(option =>
                    option.setName('text')
                        .setDescription('Activity text')
                        .setRequired(true)
                        .setMaxLength(120)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove one configured activity by index')
                .addIntegerOption(option =>
                    option.setName('index')
                        .setDescription('1-based index shown by /configpresence status')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all configured activities and use defaults'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            const guildId = interaction.guild.id;
            const config = getGuildConfig(guildId);
            const subcommand = interaction.options.getSubcommand();

            if (!config.features.presence) {
                config.features.presence = {
                    onlineStatus: 'online',
                    rotateMinutes: 5,
                    activities: []
                };
            }

            const presence = config.features.presence;
            presence.activities = Array.isArray(presence.activities) ? presence.activities : [];

            if (subcommand === 'status') {
                const lines = presence.activities.length === 0
                    ? 'Using built-in defaults'
                    : presence.activities
                        .map((a, i) => {
                            if (a.type === 'custom') return `${i + 1}. custom: ${a.state}`;
                            return `${i + 1}. ${a.type}: ${a.name}`;
                        })
                        .join('\n');

                return interaction.reply({
                    content:
                        `**Presence Config**\n` +
                        `Status: **${presence.onlineStatus || 'online'}**\n` +
                        `Rotate: **${presence.rotateMinutes || 5} minute(s)**\n` +
                        `Activities:\n${lines}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (subcommand === 'setonline') {
                presence.onlineStatus = interaction.options.getString('status', true);
                setGuildConfig(guildId, config);
                return interaction.reply({
                    content: `✅ Presence status set to **${presence.onlineStatus}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (subcommand === 'setrotate') {
                presence.rotateMinutes = interaction.options.getInteger('minutes', true);
                setGuildConfig(guildId, config);
                return interaction.reply({
                    content: `✅ Activity rotation set to **${presence.rotateMinutes} minute(s)**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (subcommand === 'addcustom') {
                const state = interaction.options.getString('state', true);
                presence.activities.push({ type: 'custom', state });
                setGuildConfig(guildId, config);
                return interaction.reply({
                    content: `✅ Added custom status: **${state}**`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (subcommand === 'addactivity') {
                const type = interaction.options.getString('type', true);
                const text = interaction.options.getString('text', true);
                presence.activities.push({ type, name: text });
                setGuildConfig(guildId, config);
                return interaction.reply({
                    content: `✅ Added activity: **${type}** -> **${text}**`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (subcommand === 'remove') {
                const index = interaction.options.getInteger('index', true) - 1;
                if (index < 0 || index >= presence.activities.length) {
                    return interaction.reply({
                        content: '❌ Invalid index. Use `/configpresence status` to see indexes.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const removed = presence.activities.splice(index, 1)[0];
                setGuildConfig(guildId, config);
                return interaction.reply({
                    content: `✅ Removed entry #${index + 1} (${removed.type}).`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (subcommand === 'clear') {
                presence.activities = [];
                setGuildConfig(guildId, config);
                return interaction.reply({
                    content: '✅ Cleared custom activities. Bot will use built-in defaults.',
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                content: '❌ Unknown subcommand.',
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Error configuring presence:', error);
            return interaction.reply({
                content: '❌ Failed to update presence configuration.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
