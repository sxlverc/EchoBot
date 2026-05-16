const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { readAllConfig } = require('../configStore');

const responsesDataPath = path.join(__dirname, '../data/botResponses.json');

function defaultResponsesStore() {
    return { blankPingResponses: [], replyPatterns: [] };
}

function loadAllResponses() {
    try {
        const raw = JSON.parse(fs.readFileSync(responsesDataPath, 'utf8'));
        if (raw.guilds && typeof raw.guilds === 'object') {
            return raw;
        }

        // Legacy format migration: fan out to all known guilds to preserve behavior
        const guildIds = Object.keys(readAllConfig()).filter(id => /^\d+$/.test(id));
        const migrated = { guilds: {} };
        const legacyData = {
            blankPingResponses: raw.blankPingResponses || [],
            replyPatterns: raw.replyPatterns || []
        };

        if (guildIds.length === 0) {
            migrated.guilds.legacy = legacyData;
        } else {
            for (const guildId of guildIds) {
                migrated.guilds[guildId] = JSON.parse(JSON.stringify(legacyData));
            }
        }

        return migrated;
    } catch (error) {
        return { guilds: {} };
    }
}

function saveAllResponses(data) {
    fs.writeFileSync(responsesDataPath, JSON.stringify(data, null, 2));
}

function getGuildResponsesStore(data, guildId) {
    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultResponsesStore();
    if (!Array.isArray(data.guilds[guildId].blankPingResponses)) data.guilds[guildId].blankPingResponses = [];
    if (!Array.isArray(data.guilds[guildId].replyPatterns)) data.guilds[guildId].replyPatterns = [];
    return data.guilds[guildId];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('responses')
        .setDescription('Manage bot response system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-blank-ping')
                .setDescription('Add a response for blank pings (just mentioning the bot)')
                .addStringOption(option =>
                    option.setName('response')
                        .setDescription('The response text')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-blank-ping')
                .setDescription('Remove a blank ping response')
                .addIntegerOption(option =>
                    option.setName('index')
                        .setDescription('The index number (from list-blank-pings)')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-blank-pings')
                .setDescription('List all blank ping responses'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-pattern')
                .setDescription('Add a new trigger/response pattern')
                .addStringOption(option =>
                    option.setName('triggers')
                        .setDescription('Trigger words/phrases (comma separated)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('responses')
                        .setDescription('Possible responses (comma separated, use {username} for user\'s name)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-pattern')
                .setDescription('Remove a trigger/response pattern')
                .addIntegerOption(option =>
                    option.setName('index')
                        .setDescription('The index number (from list-patterns)')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-patterns')
                .setDescription('List all trigger/response patterns'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-response-to-pattern')
                .setDescription('Add a response to an existing pattern')
                .addIntegerOption(option =>
                    option.setName('pattern-index')
                        .setDescription('The pattern index (from list-patterns)')
                        .setRequired(true)
                        .setMinValue(1))
                .addStringOption(option =>
                    option.setName('response')
                        .setDescription('The response to add (use {username} for user\'s name)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-trigger-to-pattern')
                .setDescription('Add a trigger to an existing pattern')
                .addIntegerOption(option =>
                    option.setName('pattern-index')
                        .setDescription('The pattern index (from list-patterns)')
                        .setRequired(true)
                        .setMinValue(1))
                .addStringOption(option =>
                    option.setName('trigger')
                        .setDescription('The trigger word/phrase to add')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const allResponses = loadAllResponses();
        const responsesData = getGuildResponsesStore(allResponses, interaction.guild.id);

        switch (subcommand) {
            case 'add-blank-ping': {
                const response = interaction.options.getString('response');
                responsesData.blankPingResponses.push(response);
                saveAllResponses(allResponses);
                await interaction.reply({
                    content: `✅ Added blank ping response: "${response}"`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'remove-blank-ping': {
                const index = interaction.options.getInteger('index') - 1;
                if (index < 0 || index >= responsesData.blankPingResponses.length) {
                    await interaction.reply({
                        content: `❌ Invalid index. Use /responses list-blank-pings to see available indices.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                const removed = responsesData.blankPingResponses.splice(index, 1)[0];
                saveAllResponses(allResponses);
                await interaction.reply({
                    content: `✅ Removed blank ping response: "${removed}"`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'list-blank-pings': {
                if (responsesData.blankPingResponses.length === 0) {
                    await interaction.reply({
                        content: '📝 No blank ping responses configured.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                const list = responsesData.blankPingResponses
                    .map((response, i) => `${i + 1}. ${response}`)
                    .join('\n');
                await interaction.reply({
                    content: `📝 **Blank Ping Responses:**\n${list}`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'add-pattern': {
                const triggers = interaction.options.getString('triggers')
                    .split(',')
                    .map(t => t.trim().toLowerCase())
                    .filter(t => t.length > 0);
                const responses = interaction.options.getString('responses')
                    .split(',')
                    .map(r => r.trim())
                    .filter(r => r.length > 0);

                if (triggers.length === 0 || responses.length === 0) {
                    await interaction.reply({
                        content: '❌ You must provide at least one trigger and one response.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                responsesData.replyPatterns.push({ triggers, responses });
                saveAllResponses(allResponses);
                await interaction.reply({
                    content: `✅ Added pattern with ${triggers.length} trigger(s) and ${responses.length} response(s).\nTriggers: ${triggers.join(', ')}`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'remove-pattern': {
                const index = interaction.options.getInteger('index') - 1;
                if (index < 0 || index >= responsesData.replyPatterns.length) {
                    await interaction.reply({
                        content: `❌ Invalid index. Use /responses list-patterns to see available indices.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                const removed = responsesData.replyPatterns.splice(index, 1)[0];
                saveAllResponses(allResponses);
                await interaction.reply({
                    content: `✅ Removed pattern with triggers: ${removed.triggers.join(', ')}`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'list-patterns': {
                if (responsesData.replyPatterns.length === 0) {
                    await interaction.reply({
                        content: '📝 No trigger/response patterns configured.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                const list = responsesData.replyPatterns
                    .map((pattern, i) => {
                        const triggers = pattern.triggers.join(', ');
                        const responseCount = pattern.responses.length;
                        return `**${i + 1}.** Triggers: \`${triggers}\` (${responseCount} response${responseCount !== 1 ? 's' : ''})`;
                    })
                    .join('\n\n');
                
                // Split into multiple messages if too long
                if (list.length > 1900) {
                    const chunks = [];
                    let currentChunk = '📝 **Trigger/Response Patterns:**\n\n';
                    
                    responsesData.replyPatterns.forEach((pattern, i) => {
                        const triggers = pattern.triggers.join(', ');
                        const responseCount = pattern.responses.length;
                        const line = `**${i + 1}.** Triggers: \`${triggers}\` (${responseCount} response${responseCount !== 1 ? 's' : ''})\n\n`;
                        
                        if ((currentChunk + line).length > 1900) {
                            chunks.push(currentChunk);
                            currentChunk = line;
                        } else {
                            currentChunk += line;
                        }
                    });
                    
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                    }
                    
                    await interaction.reply({
                        content: chunks[0],
                        flags: MessageFlags.Ephemeral
                    });
                    
                    for (let i = 1; i < chunks.length; i++) {
                        await interaction.followUp({
                            content: chunks[i],
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } else {
                    await interaction.reply({
                        content: `📝 **Trigger/Response Patterns:**\n\n${list}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }

            case 'add-response-to-pattern': {
                const patternIndex = interaction.options.getInteger('pattern-index') - 1;
                const response = interaction.options.getString('response');

                if (patternIndex < 0 || patternIndex >= responsesData.replyPatterns.length) {
                    await interaction.reply({
                        content: `❌ Invalid pattern index. Use /responses list-patterns to see available indices.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                responsesData.replyPatterns[patternIndex].responses.push(response);
                saveAllResponses(allResponses);
                await interaction.reply({
                    content: `✅ Added response to pattern ${patternIndex + 1}: "${response}"`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'add-trigger-to-pattern': {
                const patternIndex = interaction.options.getInteger('pattern-index') - 1;
                const trigger = interaction.options.getString('trigger').trim().toLowerCase();

                if (patternIndex < 0 || patternIndex >= responsesData.replyPatterns.length) {
                    await interaction.reply({
                        content: `❌ Invalid pattern index. Use /responses list-patterns to see available indices.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (responsesData.replyPatterns[patternIndex].triggers.includes(trigger)) {
                    await interaction.reply({
                        content: `❌ Trigger "${trigger}" already exists in this pattern.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                responsesData.replyPatterns[patternIndex].triggers.push(trigger);
                saveAllResponses(allResponses);
                await interaction.reply({
                    content: `✅ Added trigger to pattern ${patternIndex + 1}: "${trigger}"`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }
        }
    },
};
