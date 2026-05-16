const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const getConfig = require('../configHelper');

const suggestionsDataPath = path.join(__dirname, '../data/suggestionsData.json');

function defaultGuildStore() {
    return {
        suggestions: {},
        suggestionCounter: 0,
        activeTimers: {},
        freedIds: []
    };
}

function normalizeGuildStore(store = {}) {
    return {
        suggestions: store.suggestions || {},
        suggestionCounter: store.suggestionCounter || 0,
        activeTimers: store.activeTimers || {},
        freedIds: Array.isArray(store.freedIds) ? store.freedIds : []
    };
}

function loadSuggestionsData() {
    try {
        const raw = JSON.parse(fs.readFileSync(suggestionsDataPath, 'utf8'));
        if (raw.guilds && typeof raw.guilds === 'object') {
            const normalized = { guilds: {} };
            for (const [guildId, store] of Object.entries(raw.guilds)) {
                normalized.guilds[guildId] = normalizeGuildStore(store);
            }
            return normalized;
        }

        const migrated = { guilds: {} };
        const legacySuggestions = raw.suggestions || {};
        const suggestionsByGuild = {};
        for (const [messageId, suggestion] of Object.entries(legacySuggestions)) {
            const guildId = suggestion.guildId || 'legacy';
            if (!suggestionsByGuild[guildId]) suggestionsByGuild[guildId] = {};
            suggestionsByGuild[guildId][messageId] = suggestion;
        }

        for (const [guildId, suggestions] of Object.entries(suggestionsByGuild)) {
            const ids = Object.values(suggestions).map(s => Number(s.id) || 0);
            migrated.guilds[guildId] = {
                suggestions,
                suggestionCounter: ids.length > 0 ? Math.max(...ids) : (raw.suggestionCounter || 0),
                activeTimers: {},
                freedIds: Array.isArray(raw.freedIds) ? raw.freedIds : []
            };
        }

        return migrated;
    } catch {
        return { guilds: {} };
    }
}

function saveSuggestionsData(data) {
    fs.writeFileSync(suggestionsDataPath, JSON.stringify(data, null, 2));
}

function getGuildSuggestionsStore(data, guildId) {
    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuildStore();
    data.guilds[guildId] = normalizeGuildStore(data.guilds[guildId]);
    return data.guilds[guildId];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestions')
        .setDescription('Manage suggestions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View a specific suggestion')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The suggestion ID')
                        .setRequired(true)
                        .setMinValue(1)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active suggestions'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a suggestion and free its ID')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The suggestion ID to remove')
                        .setRequired(true)
                        .setMinValue(1)
                ))
        .addSubcommand(subcommand =>
            subcommand
                .setName('purge')
                .setDescription('Remove all suggestions and reset IDs')),
    
    async execute(interaction) {
        const config = getConfig(interaction.guild.id);
        const subcommand = interaction.options.getSubcommand();
        
        // Check permissions for remove and purge
        if ((subcommand === 'remove' || subcommand === 'purge') && !config.isPrivilegedExecutor(interaction.member)) {
            await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const data = loadSuggestionsData();
        const guildStore = getGuildSuggestionsStore(data, interaction.guild.id);
        
        switch (subcommand) {
            case 'view':
                await handleView(interaction, guildStore);
                break;
            case 'list':
                await handleList(interaction, guildStore);
                break;
            case 'remove':
                await handleRemove(interaction, data, guildStore);
                break;
            case 'purge':
                await handlePurge(interaction, data, guildStore);
                break;
        }
    }
};

async function handleView(interaction, guildStore) {
    const id = interaction.options.getInteger('id');
    
    // Find the suggestion with this ID
    let found = null;
    let messageId = null;
    
    for (const [msgId, suggestion] of Object.entries(guildStore.suggestions)) {
        if (suggestion.id === id) {
            found = suggestion;
            messageId = msgId;
            break;
        }
    }
    
    if (!found) {
        await interaction.reply({
            content: `❌ Suggestion #${id} not found.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const upvotes = found.votes?.upvotes?.length || 0;
    const downvotes = found.votes?.downvotes?.length || 0;
    
    const embed = new EmbedBuilder()
        .setTitle(`💡 Suggestion #${id}`)
        .setDescription(found.suggestion)
        .setColor(found.status === 'closed' ? 0x95a5a6 : 0x3498db)
        .addFields(
            { name: '👍 Upvotes', value: upvotes.toString(), inline: true },
            { name: '👎 Downvotes', value: downvotes.toString(), inline: true },
            { name: '📊 Status', value: found.status === 'closed' ? 'Closed' : 'Active', inline: true },
            { name: '👤 Author', value: `<@${found.author}>`, inline: true },
            { name: '📝 Message ID', value: messageId, inline: true }
        )
        .setTimestamp(found.createdAt ? new Date(found.createdAt) : null);
    
    if (found.result) {
        embed.addFields({ name: '✅ Result', value: found.result });
    }
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleList(interaction, guildStore) {
    const suggestions = Object.entries(guildStore.suggestions)
        .map(([msgId, s]) => ({ ...s, messageId: msgId }))
        .sort((a, b) => a.id - b.id);
    
    if (suggestions.length === 0) {
        await interaction.reply({
            content: '📋 No suggestions found.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const activeSuggestions = suggestions.filter(s => s.status === 'active');
    const closedSuggestions = suggestions.filter(s => s.status === 'closed');
    
    let description = '';
    
    if (activeSuggestions.length > 0) {
        description += '**Active Suggestions:**\n';
        activeSuggestions.forEach(s => {
            const upvotes = s.votes?.upvotes?.length || 0;
            const downvotes = s.votes?.downvotes?.length || 0;
            description += `#${s.id} - 👍 ${upvotes} 👎 ${downvotes} - ${s.suggestion.substring(0, 50)}${s.suggestion.length > 50 ? '...' : ''}\n`;
        });
        description += '\n';
    }
    
    if (closedSuggestions.length > 0) {
        description += '**Closed Suggestions:**\n';
        closedSuggestions.slice(0, 10).forEach(s => {
            description += `#${s.id} - ${s.result || 'No result'}\n`;
        });
        if (closedSuggestions.length > 10) {
            description += `\n*...and ${closedSuggestions.length - 10} more*`;
        }
    }
    
    const embed = new EmbedBuilder()
        .setTitle('📋 Suggestions List')
        .setDescription(description)
        .setColor(0x3498db)
        .setFooter({ text: `Total: ${suggestions.length} | Active: ${activeSuggestions.length} | Closed: ${closedSuggestions.length}` });
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleRemove(interaction, data, guildStore) {
    const id = interaction.options.getInteger('id');
    
    // Find and remove the suggestion
    let removed = false;
    let removedMessageId = null;
    let removedSuggestion = null;
    
    for (const [msgId, suggestion] of Object.entries(guildStore.suggestions)) {
        if (suggestion.id === id) {
            removedSuggestion = suggestion;
            delete guildStore.suggestions[msgId];
            removed = true;
            removedMessageId = msgId;
            
            // Add ID to freed IDs list for reuse
            if (!guildStore.freedIds) guildStore.freedIds = [];
            if (!guildStore.freedIds.includes(id)) {
                guildStore.freedIds.push(id);
                guildStore.freedIds.sort((a, b) => a - b);
            }
            
            break;
        }
    }
    
    if (!removed) {
        await interaction.reply({
            content: `❌ Suggestion #${id} not found.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    saveSuggestionsData(data);
    
    // Try to delete the message
    try {
        const channel = interaction.guild.channels.cache.get(removedSuggestion?.channelId || interaction.channelId) || interaction.channel;
        const message = await channel.messages.fetch(removedMessageId);
        await message.delete();
    } catch (error) {
        console.error('Could not delete suggestion message:', error);
    }
    
    await interaction.reply({
        content: `✅ Suggestion #${id} has been removed and the ID has been freed for reuse.`,
        flags: MessageFlags.Ephemeral
    });
}

async function handlePurge(interaction, data, guildStore) {
    const count = Object.keys(guildStore.suggestions).length;
    
    if (count === 0) {
        await interaction.reply({
            content: '❌ No suggestions to purge.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // Reset everything
    guildStore.suggestions = {};
    guildStore.suggestionCounter = 0;
    guildStore.activeTimers = {};
    guildStore.freedIds = [];
    
    saveSuggestionsData(data);
    
    await interaction.reply({
        content: `✅ Purged all ${count} suggestions and reset the ID counter.`,
        flags: MessageFlags.Ephemeral
    });
}
