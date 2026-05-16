const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/reactionRoles.json');

function loadData() {
    try {
        const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (parsed && typeof parsed === 'object' && parsed.guilds && typeof parsed.guilds === 'object') {
            return parsed;
        }

        // Legacy format compatibility: { panels: { ... } }
        if (parsed && typeof parsed === 'object' && parsed.panels && typeof parsed.panels === 'object') {
            return { guilds: {}, legacyPanels: parsed.panels };
        }

        return { guilds: {} };
    } catch (error) {
        return { guilds: {} };
    }
}

function saveData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function ensureGuildPanels(data, guildId) {
    data.guilds = data.guilds || {};
    data.guilds[guildId] = data.guilds[guildId] || { panels: {} };
    data.guilds[guildId].panels = data.guilds[guildId].panels || {};
    return data.guilds[guildId].panels;
}

function getPanelForMessage(data, guild, messageId, channelId) {
    const guildPanels = ensureGuildPanels(data, guild.id);
    const scoped = Object.values(guildPanels).find(p => p.messageId === messageId);
    if (scoped) return scoped;

    // Legacy compatibility: migrate panel on first hit if it belongs to this guild.
    if (data.legacyPanels && typeof data.legacyPanels === 'object') {
        for (const [panelName, panel] of Object.entries(data.legacyPanels)) {
            if (panel.messageId !== messageId) continue;
            if (panel.channelId !== channelId) continue;
            if (!guild.channels.cache.has(panel.channelId)) continue;

            guildPanels[panelName] = panel;
            delete data.legacyPanels[panelName];
            if (Object.keys(data.legacyPanels).length === 0) {
                delete data.legacyPanels;
            }
            saveData(data);
            return panel;
        }
    }

    return null;
}

module.exports = {
    register: (client) => {
        // Handle reaction add
        client.on(Events.MessageReactionAdd, async (reaction, user) => {
            // Ignore bot reactions
            if (user.bot) return;

            // Fetch partial reactions/messages
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    console.error('Error fetching reaction:', error);
                    return;
                }
            }

            const data = loadData();
            
            // Find the panel this message belongs to
            const panel = getPanelForMessage(
                data,
                reaction.message.guild,
                reaction.message.id,
                reaction.message.channelId
            );
            if (!panel) return;

            // Get emoji ID - for custom emojis use ID, for unicode use the emoji itself
            const emojiId = reaction.emoji.id || reaction.emoji.name;
            
            // Try to find role data - check both the emoji ID and the stored emoji format
            let roleData = panel.roles[emojiId];
            
            // If not found, try to match by the stored emoji string
            if (!roleData) {
                for (const [key, data] of Object.entries(panel.roles)) {
                    // Check if the stored emoji matches
                    if (data.emoji === reaction.emoji.toString() || 
                        data.emoji === reaction.emoji.name ||
                        key === reaction.emoji.name) {
                        roleData = data;
                        break;
                    }
                }
            }
            
            if (!roleData) {
                console.log(`No role data found for emoji: ${reaction.emoji.toString()} (ID: ${emojiId})`);
                return;
            }

            try {
                const member = await reaction.message.guild.members.fetch(user.id);
                const role = reaction.message.guild.roles.cache.get(roleData.roleId);
                
                if (!role) {
                    console.error(`Role ${roleData.roleId} not found for reaction role`);
                    return;
                }

                // Check panel mode
                if (panel.mode === 'drop') {
                    // Drop mode - only removes roles, don't add
                    return;
                }

                // For unique mode, remove other roles from this panel first
                if (panel.mode === 'unique') {
                    for (const [otherEmojiId, otherRoleData] of Object.entries(panel.roles)) {
                        if (otherEmojiId !== emojiId) {
                            const otherRole = reaction.message.guild.roles.cache.get(otherRoleData.roleId);
                            if (otherRole && member.roles.cache.has(otherRole.id)) {
                                await member.roles.remove(otherRole);
                                console.log(`Removed ${otherRole.name} from ${user.tag} (unique mode)`);
                            }
                        }
                    }
                }

                // Add the role
                if (!member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    console.log(`Added ${role.name} to ${user.tag} via reaction role`);
                }
            } catch (error) {
                console.error('Error adding reaction role:', error);
            }
        });

        // Handle reaction remove
        client.on(Events.MessageReactionRemove, async (reaction, user) => {
            // Ignore bot reactions
            if (user.bot) return;

            // Fetch partial reactions/messages
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    console.error('Error fetching reaction:', error);
                    return;
                }
            }

            const data = loadData();
            
            // Find the panel this message belongs to
            const panel = getPanelForMessage(
                data,
                reaction.message.guild,
                reaction.message.id,
                reaction.message.channelId
            );
            if (!panel) return;

            // Get emoji ID - for custom emojis use ID, for unicode use the emoji itself
            const emojiId = reaction.emoji.id || reaction.emoji.name;
            
            // Try to find role data - check both the emoji ID and the stored emoji format
            let roleData = panel.roles[emojiId];
            
            // If not found, try to match by the stored emoji string
            if (!roleData) {
                for (const [key, data] of Object.entries(panel.roles)) {
                    // Check if the stored emoji matches
                    if (data.emoji === reaction.emoji.toString() || 
                        data.emoji === reaction.emoji.name ||
                        key === reaction.emoji.name) {
                        roleData = data;
                        break;
                    }
                }
            }
            
            if (!roleData) {
                console.log(`No role data found for emoji: ${reaction.emoji.toString()} (ID: ${emojiId})`);
                return;
            }

            // Check panel mode
            if (panel.mode === 'verify') {
                // Verify mode - only adds roles, don't remove
                return;
            }

            try {
                const member = await reaction.message.guild.members.fetch(user.id);
                const role = reaction.message.guild.roles.cache.get(roleData.roleId);
                
                if (!role) {
                    console.error(`Role ${roleData.roleId} not found for reaction role`);
                    return;
                }

                // Remove the role
                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    console.log(`Removed ${role.name} from ${user.tag} via reaction role`);
                }
            } catch (error) {
                console.error('Error removing reaction role:', error);
            }
        });

        console.log('Reaction roles system initialized');
    }
};
