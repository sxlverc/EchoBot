const { Events, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { readAllConfig } = require('../configStore');

const responsesDataPath = path.join(__dirname, '../data/botResponses.json');

// Track domer mentions per user
const domerCounts = new Map();

function defaultResponsesStore() {
    return { blankPingResponses: [], replyPatterns: [] };
}

function loadAllResponses() {
    try {
        const raw = JSON.parse(fs.readFileSync(responsesDataPath, 'utf8'));
        if (raw.guilds && typeof raw.guilds === 'object') return raw;

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
        console.error('Error loading bot responses data:', error);
        return { guilds: {} };
    }
}

function getGuildResponsesStore(data, guildId) {
    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultResponsesStore();
    if (!Array.isArray(data.guilds[guildId].blankPingResponses)) data.guilds[guildId].blankPingResponses = [];
    if (!Array.isArray(data.guilds[guildId].replyPatterns)) data.guilds[guildId].replyPatterns = [];
    return data.guilds[guildId];
}

module.exports = {
    register: (client) => {
        client.on(Events.MessageCreate, async message => {
            // Ignore bot messages
            if (message.author.bot) return;
            if (!message.guild) return;
            
            const responsesData = getGuildResponsesStore(loadAllResponses(), message.guild.id);
            
            // Check if bot is mentioned
            const botMentioned = message.mentions.has(client.user.id);
            
            // Handle blank pings (just mentioning the bot with no other text)
            if (botMentioned) {
                const contentWithoutMention = message.content
                    .replace(/<@!?\d+>/g, '') // Remove all mentions
                    .trim();
                
                if (contentWithoutMention === '') {
                    if (responsesData.blankPingResponses.length === 0) return;
                    const response = responsesData.blankPingResponses[Math.floor(Math.random() * responsesData.blankPingResponses.length)];
                    await message.reply(response);
                    return;
                }
                
                // Check for "domer" mentions
                const contentLower = contentWithoutMention.toLowerCase();
                if (contentLower.includes('domer')) {
                    const userId = message.author.id;
                    const currentCount = domerCounts.get(userId) || 0;
                    const newCount = currentCount + 1;
                    
                    domerCounts.set(userId, newCount);
                    
                    if (newCount === 4) {
                        // Fourth time - send warning emoji
                        await message.reply('⚠️');
                        await message.reply('https://tenor.com/view/cats-fbi-police-police-cat-fbi-cat-gif-1256429038097351888');
                        // Reset counter after warning
                        domerCounts.set(userId, 0);
                    } else {
                        // Regular checkmark
                        await message.reply('✅');
                    }
                    return;
                }
                
                // Check for trigger patterns in mentions
                for (const pattern of responsesData.replyPatterns) {
                    for (const trigger of pattern.triggers) {
                        if (contentLower.includes(trigger)) {
                            const response = pattern.responses[Math.floor(Math.random() * pattern.responses.length)]
                                .replace('{username}', message.member?.displayName || message.author.username);
                            await message.reply(response);
                            return;
                        }
                    }
                }
            }
            
            // Check if the message is a reply to the bot
            if (!message.reference || !message.reference.messageId) return;
            
            // Get the message being replied to
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                
                // Check if the replied message is from the bot
                if (repliedMessage.author.id !== client.user.id) return;
                
                // Check message content against patterns
                const content = message.content.toLowerCase().trim();
                
                for (const pattern of responsesData.replyPatterns) {
                    for (const trigger of pattern.triggers) {
                        if (content.includes(trigger)) {
                            const response = pattern.responses[Math.floor(Math.random() * pattern.responses.length)]
                                .replace('{username}', message.member?.displayName || message.author.username);
                            await message.reply(response);
                            return;
                        }
                    }
                }
            } catch (error) {
                // Message might be deleted or inaccessible, ignore
                return;
            }
        });
        
        console.log('Bot response system initialized');
    }
};
