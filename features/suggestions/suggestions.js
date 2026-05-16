const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const getConfig = require('../../configHelper');
const { loadGuildXpData } = require('../xp/xpStore');

const suggestionsDataPath = path.join(__dirname, '../../data/suggestionsData.json');

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

function getGuildStore(data, guildId) {
    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuildStore();
    data.guilds[guildId] = normalizeGuildStore(data.guilds[guildId]);
    return data.guilds[guildId];
}

function findSuggestionByMessageId(data, messageId, guildIdHint = null) {
    if (guildIdHint && data.guilds?.[guildIdHint]?.suggestions?.[messageId]) {
        return {
            guildId: guildIdHint,
            store: data.guilds[guildIdHint],
            suggestion: data.guilds[guildIdHint].suggestions[messageId]
        };
    }

    for (const [guildId, store] of Object.entries(data.guilds || {})) {
        if (store.suggestions?.[messageId]) {
            return { guildId, store, suggestion: store.suggestions[messageId] };
        }
    }

    return null;
}

// Check if user has been active recently (configurable)
function isUserActive(guildId, userId) {
    try {
        const config = getConfig(guildId);
        // Check if activity check is enabled in config
        const suggestionsConfig = config.features?.suggestions;
        
        // If requireRecentActivity is false, allow all users
        if (!suggestionsConfig || suggestionsConfig.requireRecentActivity === false) {
            return true;
        }
        
        const xpData = loadGuildXpData(guildId);
        if (!xpData[userId] || !xpData[userId].lastActive) {
            return false;
        }
        
        // Use configurable activity days (default 14)
        const activityDays = suggestionsConfig.activityDays || 14;
        const activityPeriodMs = activityDays * 24 * 60 * 60 * 1000;
        const timeSinceActive = Date.now() - xpData[userId].lastActive;
        return timeSinceActive < activityPeriodMs;
    } catch {
        // If there's an error, allow voting (fail open)
        return true;
    }
}


// Initialize suggestions data
function initSuggestionsData() {
    if (!fs.existsSync(suggestionsDataPath)) {
        const defaultData = { guilds: {} };
        fs.writeFileSync(suggestionsDataPath, JSON.stringify(defaultData, null, 2));
    }
}

// Load suggestions data
function loadSuggestionsData() {
    initSuggestionsData();
    try {
        const raw = JSON.parse(fs.readFileSync(suggestionsDataPath, 'utf8'));

        if (raw.guilds && typeof raw.guilds === 'object') {
            const normalized = { guilds: {} };
            for (const [guildId, store] of Object.entries(raw.guilds)) {
                normalized.guilds[guildId] = normalizeGuildStore(store);
            }
            return normalized;
        }

        // Legacy root migration
        const migrated = { guilds: {} };
        const suggestionsByGuild = {};
        for (const [messageId, suggestion] of Object.entries(raw.suggestions || {})) {
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

        if (!migrated.guilds.legacy) {
            migrated.guilds.legacy = defaultGuildStore();
        }

        fs.writeFileSync(suggestionsDataPath, JSON.stringify(migrated, null, 2));
        return migrated;
    } catch {
        // If corrupted, reset to default
        const defaultData = { guilds: {} };
        fs.writeFileSync(suggestionsDataPath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
}

// Save suggestions data
function saveSuggestionsData(data) {
    try {
        fs.writeFileSync(suggestionsDataPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving suggestions data:', error);
    }
}

// Create a suggestion embed and buttons
async function createSuggestion(interaction, suggestionText, timerMinutes = null, pingRole = null, pingEveryone = false, isDefaultTimer = false) {
    try {
        const config = getConfig(interaction.guild.id);
        const data = loadSuggestionsData();
        const guildStore = getGuildStore(data, interaction.guild.id);
        console.log('Loaded data structure:', JSON.stringify(data, null, 2));
        
        // Use a freed ID if available, otherwise increment counter
        let suggestionId;
        if (guildStore.freedIds.length > 0) {
            suggestionId = guildStore.freedIds.shift(); // Take the smallest freed ID
            console.log('Reusing freed ID:', suggestionId);
        } else {
            guildStore.suggestionCounter++;
            suggestionId = guildStore.suggestionCounter;
            console.log('Creating new suggestion with ID:', suggestionId);
        }
        
        // Save counter/freed IDs update immediately
        saveSuggestionsData(data);
        console.log('Saved ID update');
        
        // Calculate end time if timer is set
        let endTime = null;
        if (timerMinutes) {
            endTime = new Date(Date.now() + (timerMinutes * 60 * 1000));
        }
    
    const createdTimestamp = Math.floor(Date.now() / 1000);
    
    const embed = new EmbedBuilder()
        .setTitle(`💡 Suggestion #${suggestionId}`)
        .setDescription(suggestionText)
        .setColor(0x3498db)
        .setAuthor({
            name: interaction.user.displayName,
            iconURL: interaction.user.displayAvatarURL()
        })
        .addFields(
            { name: '👍 Upvotes', value: '0', inline: true },
            { name: '👎 Downvotes', value: '0', inline: true },
            { name: '📊 Status', value: 'Active', inline: true }
        )
        .setFooter({ text: `Vote using the buttons below!` })
        .setTimestamp(Date.now());

    // Add timer info if set
    if (timerMinutes) {
        embed.addFields({ 
            name: '⏱️ Time Remaining', 
            value: `Closes <t:${Math.floor(endTime.getTime() / 1000)}:R>`, 
            inline: false 
        });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`suggestion_upvote_${suggestionId}`)
                .setLabel('👍 Upvote')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`suggestion_downvote_${suggestionId}`)
                .setLabel('👎 Downvote')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`suggestion_voters_${suggestionId}`)
                .setLabel('👥 Show Voters')
                .setStyle(ButtonStyle.Secondary)
        );

    // Create content with role ping if specified
    const SUGGESTION_ROLE_ID = config.roles.suggestions;
    let content = '';
    let allowedMentions = {};
    
    if (pingEveryone) {
        content = `📢 **New Suggestion!** @everyone <@&${SUGGESTION_ROLE_ID}>\n\nPlease vote on this suggestion using the buttons below! 👇`;
        allowedMentions = { everyone: true, roles: [SUGGESTION_ROLE_ID] };
        console.log('Setting up @everyone ping with allowedMentions:', allowedMentions);
    } else if (pingRole) {
        content = `📢 **New Suggestion!** <@&${pingRole.id}> <@&${SUGGESTION_ROLE_ID}>\n\nPlease vote on this suggestion using the buttons below! 👇`;
        allowedMentions = { roles: [pingRole.id, SUGGESTION_ROLE_ID] };
        console.log('Setting up role ping with allowedMentions:', allowedMentions);
        console.log('Role ID:', pingRole.id);
    } else {
        content = `📢 **New Suggestion!** <@&${SUGGESTION_ROLE_ID}>\n\nPlease vote on this suggestion using the buttons below! 👇`;
        allowedMentions = { roles: [SUGGESTION_ROLE_ID] };
        console.log('Setting up suggestion role ping');
    }

    const messageOptions = {
        embeds: [embed],
        components: [row]
    };

    if (content) {
        messageOptions.content = content;
        messageOptions.allowedMentions = allowedMentions;
    }

    console.log('About to send message...');
    let message;
    try {
        message = await interaction.followUp(messageOptions);
        console.log(`Created suggestion message with ID: ${message.id}`);
        console.log('Message content sent:', content);
        if (allowedMentions) {
            console.log('AllowedMentions used:', JSON.stringify(allowedMentions));
        }
    } catch (error) {
        console.error('Error sending message with ping:', error);
        // Try sending without ping if there's an error
        const fallbackOptions = {
            embeds: [embed],
            components: [row]
        };
        message = await interaction.followUp(fallbackOptions);
        console.log(`Created fallback suggestion message with ID: ${message.id} (ping failed)`);
    }

    console.log(`Created suggestion message with ID: ${message.id}`);

    // Store suggestion data
    guildStore.suggestions[message.id] = {
        id: suggestionId,
        author: interaction.user.id,
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        suggestion: suggestionText,
        votes: {
            upvotes: [],
            downvotes: []
        },
        status: 'active',
        channelId: interaction.channelId,
        timer: timerMinutes ? {
            endTime: Date.now() + (timerMinutes * 60 * 1000), // Store as timestamp
            minutes: timerMinutes,
            isDefault: isDefaultTimer
        } : null
    };
    
    console.log(`Storing suggestion data for message ID: ${message.id}`);
    
    // Set up auto-close timer if specified (but don't store the timeout object)
    if (timerMinutes) {
        setTimeout(async () => {
            await autoCloseSuggestion(suggestionId, message.id, interaction.client, interaction.guild.id);
        }, timerMinutes * 60 * 1000);
    }
    
    saveSuggestionsData(data);
    console.log(`Saved suggestion data. Guild suggestions total: ${Object.keys(guildStore.suggestions).length}`);
    return message;
    } catch (error) {
        console.error('Error in createSuggestion:', error);
        throw error;
    }
}

// Handle suggestion voting
async function handleSuggestionVote(interaction) {
    const [action, voteType, suggestionId] = interaction.customId.split('_');
    const data = loadSuggestionsData();

    const location = findSuggestionByMessageId(data, interaction.message.id, interaction.guild?.id);
    let suggestionData = location?.suggestion || null;

    if (!suggestionData) {
        for (const store of Object.values(data.guilds || {})) {
            for (const suggestion of Object.values(store.suggestions || {})) {
                if (suggestion.id.toString() === suggestionId) {
                    suggestionData = suggestion;
                    break;
                }
            }
            if (suggestionData) break;
        }
    }

    if (!suggestionData) {
        return await interaction.reply({
            content: '❌ This suggestion no longer exists or there was an error loading it.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (suggestionData.status === 'closed') {
        return await interaction.reply({
            content: '❌ This suggestion has been closed and voting is no longer available.',
            flags: MessageFlags.Ephemeral
        });
    }

    const userId = interaction.user.id;
    const config = getConfig(suggestionData.guildId || interaction.guild.id);
    
    // Check if user has been active recently (if enabled)
    if (!isUserActive(suggestionData.guildId || interaction.guild.id, userId)) {
        const suggestionsConfig = config.features?.suggestions;
        const activityDays = suggestionsConfig?.activityDays || 14;
        return interaction.reply({
            content: `❌ You must have been active in the server within the past ${activityDays} days to vote on suggestions.`,
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (voteType === 'voters') {
        await showVoters(interaction, suggestionData);
        return;
    }

    // Remove user from both vote arrays first
    suggestionData.votes.upvotes = suggestionData.votes.upvotes.filter(id => id !== userId);
    suggestionData.votes.downvotes = suggestionData.votes.downvotes.filter(id => id !== userId);
    
    // Add vote to appropriate array
    if (voteType === 'upvote') {
        suggestionData.votes.upvotes.push(userId);
    } else if (voteType === 'downvote') {
        suggestionData.votes.downvotes.push(userId);
    }
    
    // Update the embed
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFields(
            { name: '👍 Upvotes', value: suggestionData.votes.upvotes.length.toString(), inline: true },
            { name: '👎 Downvotes', value: suggestionData.votes.downvotes.length.toString(), inline: true },
            { name: '📊 Status', value: suggestionData.status === 'active' ? 'Active' : suggestionData.status === 'under_review' ? 'Under Review' : 'Closed', inline: true }
        );

    await interaction.update({
        embeds: [updatedEmbed],
        components: interaction.message.components
    });
    
    saveSuggestionsData(data);
}

// Show voters for a suggestion
async function showVoters(interaction, suggestionData) {
    const upvoterNames = suggestionData.votes.upvotes.map(userId => `<@${userId}>`).join(', ') || 'None';
    const downvoterNames = suggestionData.votes.downvotes.map(userId => `<@${userId}>`).join(', ') || 'None';
    
    const embed = new EmbedBuilder()
        .setTitle(`👥 Voters for Suggestion #${suggestionData.id}`)
        .setColor(0x95a5a6)
        .addFields(
            { name: '👍 Upvoters', value: upvoterNames, inline: false },
            { name: '👎 Downvoters', value: downvoterNames, inline: false }
        );

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

// Close a suggestion and ping voters
async function closeSuggestion(interaction, suggestionId, result, adminMessage) {
    const data = loadSuggestionsData();
    const config = getConfig(interaction.guild.id);
    const guildStore = getGuildStore(data, interaction.guild.id);
    
    // Find suggestion by ID
    let suggestionMessageId = null;
    let suggestionData = null;
    
    for (const [messageId, suggestion] of Object.entries(guildStore.suggestions)) {
        if (suggestion.id === suggestionId) {
            suggestionMessageId = messageId;
            suggestionData = suggestion;
            break;
        }
    }
    
    if (!suggestionData) {
        return await interaction.reply({
            content: '❌ Could not find a suggestion with that ID.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Update suggestion status
    suggestionData.status = 'closed';
    
    // Get all voters
    const allVoters = [...new Set([...suggestionData.votes.upvotes, ...suggestionData.votes.downvotes])];
    
    // Create result embed
    const resultEmbed = new EmbedBuilder()
        .setTitle(`📋 Suggestion #${suggestionId} - ${result.toUpperCase()}`)
        .setDescription(suggestionData.suggestion)
        .setColor(result.toLowerCase() === 'accepted' ? 0x27ae60 : 
                 result.toLowerCase() === 'rejected' ? 0xe74c3c : 0x95a5a6)
        .addFields(
            { name: '👍 Final Upvotes', value: suggestionData.votes.upvotes.length.toString(), inline: true },
            { name: '👎 Final Downvotes', value: suggestionData.votes.downvotes.length.toString(), inline: true },
            { name: '📊 Result', value: result, inline: true }
        );
    
    if (adminMessage) {
        resultEmbed.addFields({ name: '💬 Admin Message', value: adminMessage, inline: false });
    }
    
    resultEmbed.setTimestamp();
    
    // Send result and ping voters
    const SUGGESTION_ROLE_ID = config.roles.suggestions;
    let content = `📢 **Suggestion Update** <@&${SUGGESTION_ROLE_ID}>`;
    if (allVoters.length > 0) {
        content += `\n${allVoters.map(userId => `<@${userId}>`).join(' ')}`;
    }
    
    await interaction.followUp({
        content: content,
        embeds: [resultEmbed],
        allowedMentions: { roles: [SUGGESTION_ROLE_ID], users: allVoters }
    });
    
    // Try to update original suggestion message if possible
    try {
        const channel = interaction.guild.channels.cache.get(suggestionData.channelId);
        if (channel) {
            const originalMessage = await channel.messages.fetch(suggestionMessageId);
            if (originalMessage) {
                const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                    .setColor(result.toLowerCase() === 'accepted' ? 0x27ae60 : 
                             result.toLowerCase() === 'rejected' ? 0xe74c3c : 0x95a5a6)
                    .setFields(
                        { name: '👍 Upvotes', value: suggestionData.votes.upvotes.length.toString(), inline: true },
                        { name: '👎 Downvotes', value: suggestionData.votes.downvotes.length.toString(), inline: true },
                        { name: '📊 Status', value: `Closed - ${result}`, inline: true }
                    );
                
                // Disable buttons
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true),
                        ButtonBuilder.from(originalMessage.components[0].components[1]).setDisabled(true),
                        ButtonBuilder.from(originalMessage.components[0].components[2]).setDisabled(true)
                    );
                
                await originalMessage.edit({
                    embeds: [updatedEmbed],
                    components: [disabledRow]
                });
            }
        }
    } catch (error) {
        console.error('Error updating original suggestion message:', error);
    }
    
    saveSuggestionsData(data);
}

// Auto-close suggestion when timer expires
async function autoCloseSuggestion(suggestionId, messageId, client, guildIdHint = null) {
    try {
        const data = loadSuggestionsData();
        const location = findSuggestionByMessageId(data, messageId, guildIdHint);
        const suggestionData = location?.suggestion;
        
        if (!suggestionData || suggestionData.status === 'closed') {
            return; // Already closed or doesn't exist
        }
        
        // Get the correct guild from the suggestion data
        const guild = client.guilds.cache.get(suggestionData.guildId);
        if (!guild) {
            console.error(`Guild ${suggestionData.guildId} not found for suggestion #${suggestionId}`);
            return;
        }
        const config = getConfig(guild.id);
        
        // Check if this was a default timer
        const isDefaultTimer = suggestionData.timer && suggestionData.timer.isDefault;
        const SUGGESTION_ROLE_ID = config.roles.suggestions;
        
        // If it's a default timer, just set to Under Review
        if (isDefaultTimer) {
            suggestionData.status = 'under_review';
            
            const resultEmbed = new EmbedBuilder()
                .setTitle(`⏰ Suggestion #${suggestionId} - Under Review`)
                .setDescription(suggestionData.suggestion)
                .setColor(0xf39c12)
                .addFields(
                    { name: '👍 Final Upvotes', value: suggestionData.votes.upvotes.length.toString(), inline: true },
                    { name: '👎 Final Downvotes', value: suggestionData.votes.downvotes.length.toString(), inline: true },
                    { name: '📝 Status', value: 'This suggestion is now under review by the team.', inline: false }
                )
                .setTimestamp();
            
            const suggestionChannel = await guild.channels.fetch(suggestionData.channelId);
            if (suggestionChannel) {
                const message = await suggestionChannel.messages.fetch(messageId);
                if (message) {
                    await message.edit({ embeds: [resultEmbed], components: [] });
                    
                    // Send notification with role ping
                    await suggestionChannel.send({
                        content: `📢 **Suggestion Update** <@&${SUGGESTION_ROLE_ID}>\nSuggestion #${suggestionId} is now under review.`,
                        allowedMentions: { roles: [SUGGESTION_ROLE_ID] }
                    });
                }
            }
            
            saveSuggestionsData(data);
            return;
        }
        
        // Original logic for user-set timers
        // Determine result based on votes
        const upvotes = suggestionData.votes.upvotes.length;
        const downvotes = suggestionData.votes.downvotes.length;
        
        let result = 'Expired';
        let resultMessage = 'Voting period has ended.';
        
        if (upvotes > downvotes && upvotes >= 3) {
            result = 'Under Review (Timer)';
            resultMessage = 'Moved to review due to positive votes when timer expired.';
            suggestionData.status = 'under_review';
        } else if (downvotes > upvotes) {
            result = 'Rejected (Timer)';
            resultMessage = 'Auto-rejected due to negative votes when timer expired.';
        } else if (upvotes > downvotes) {
            result = 'Under Review (Timer)';
            resultMessage = 'Moved to review due to positive votes when timer expired.';
            suggestionData.status = 'under_review';
        } else {
            result = 'Tied (Timer)';
            resultMessage = 'Voting ended in a tie when timer expired.';
        }
        
        // Close the suggestion
        if (result.includes('Rejected') || result.includes('Tied') || result.includes('Expired')) {
            suggestionData.status = 'closed';
        }
        // Status is already set above for under review cases
        
        // Get all voters
        const allVoters = [...new Set([...suggestionData.votes.upvotes, ...suggestionData.votes.downvotes])];
        
        // Create result embed
        const resultEmbed = new EmbedBuilder()
            .setTitle(`⏰ Suggestion #${suggestionId} - ${result}`)
            .setDescription(suggestionData.suggestion)
            .setColor(result.includes('Under Review') ? 0xf39c12 : 
                     result.includes('Rejected') ? 0xe74c3c : 0x95a5a6)
            .addFields(
                { name: '👍 Final Upvotes', value: upvotes.toString(), inline: true },
                { name: '👎 Final Downvotes', value: downvotes.toString(), inline: true },
                { name: '📊 Result', value: result, inline: true },
                { name: '💬 Auto-Close Message', value: resultMessage, inline: false }
            )
            .setTimestamp();
        
        // Send result and ping voters
        const channel = guild.channels.cache.get(suggestionData.channelId);
        if (channel) {
            let content = `⏰ **Suggestion Timer Expired** <@&${SUGGESTION_ROLE_ID}>`;
            if (allVoters.length > 0) {
                content += `\n${allVoters.map(userId => `<@${userId}>`).join(' ')}`;
            }
            
            await channel.send({
                content: content,
                embeds: [resultEmbed],
                allowedMentions: { roles: [SUGGESTION_ROLE_ID], users: allVoters }
            });
            
            // Try to update original suggestion message
            try {
                const originalMessage = await channel.messages.fetch(messageId);
                if (originalMessage) {
                    const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                        .setColor(result.includes('Under Review') ? 0xf39c12 : 
                                 result.includes('Rejected') ? 0xe74c3c : 0x95a5a6);
                    
                    // Remove timer field and update status
                    const fields = updatedEmbed.data.fields.filter(field => field.name !== '⏱️ Auto-Close Timer');
                    const statusText = suggestionData.status === 'under_review' ? 'Under Review' : 
                                     suggestionData.status === 'closed' ? `Closed - ${result}` : 
                                     suggestionData.status;
                    fields[2] = { name: '📊 Status', value: statusText, inline: true };
                    updatedEmbed.setFields(fields);
                    
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true),
                            ButtonBuilder.from(originalMessage.components[0].components[1]).setDisabled(true),
                            ButtonBuilder.from(originalMessage.components[0].components[2]).setDisabled(true)
                        );
                    
                    await originalMessage.edit({
                        embeds: [updatedEmbed],
                        components: [disabledRow]
                    });
                }
            } catch (error) {
                console.error('Error updating original suggestion message:', error);
            }
        }
        
        // Clean up timer
        if (location?.store?.activeTimers && location.store.activeTimers[suggestionId]) {
            delete location.store.activeTimers[suggestionId];
        }
        
        saveSuggestionsData(data);
        
    } catch (error) {
        console.error('Error auto-closing suggestion:', error);
    }
}

// Restore timers on bot startup
function restoreTimers(client) {
    const data = loadSuggestionsData();
    const now = Date.now();

    for (const [guildId, store] of Object.entries(data.guilds || {})) {
        for (const [messageId, suggestion] of Object.entries(store.suggestions || {})) {
            if (suggestion.timer && suggestion.status === 'active') {
                const timeLeft = suggestion.timer.endTime - now;

                if (timeLeft <= 0) {
                    // Timer already expired, close immediately
                    autoCloseSuggestion(suggestion.id, messageId, client, guildId);
                } else {
                    // Schedule timer for remaining time
                    setTimeout(async () => {
                        await autoCloseSuggestion(suggestion.id, messageId, client, guildId);
                    }, timeLeft);
                    console.log(`Restored timer for suggestion #${suggestion.id} in guild ${guildId}, closing in ${Math.round(timeLeft / 60000)} minutes`);
                }
            }
        }
    }
}

module.exports = {
    createSuggestion,
    handleSuggestionVote,
    closeSuggestion,
    loadSuggestionsData,
    saveSuggestionsData,
    restoreTimers
};