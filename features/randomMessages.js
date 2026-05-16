const getConfig = require('../configHelper');
const fs = require('fs');
const path = require('path');

// Load messages from data file
let randomMessagesData = { messages: [] };
try {
    const messagesPath = path.join(__dirname, '../data/randomMessages.json');
    randomMessagesData = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
} catch (error) {
    console.error('Error loading random messages data:', error);
}

let messageInterval = null;

function getRuntimeConfig(client) {
    const configuredGuildId = process.env.GUILD_ID;
    const guild = configuredGuildId
        ? client.guilds.cache.get(configuredGuildId)
        : client.guilds.cache.first();

    if (!guild) {
        return null;
    }

    return getConfig(guild.id);
}

module.exports = {
    register: (client) => {
        const config = getRuntimeConfig(client);
        if (!config) {
            console.log('Random messages skipped - no guild context available');
            return;
        }

        // Don't start if not configured
        if (!config.channels.randomMessages) {
            console.log('Random messages not configured - skipping');
            return;
        }
        
        if (randomMessagesData.messages.length === 0) {
            console.log('No random messages loaded - skipping');
            return;
        }
        
        // Default interval: 2-6 hours (in milliseconds)
        const minInterval = config.features.randomMessages.minHours * 60 * 60 * 1000;
        const maxInterval = config.features.randomMessages.maxHours * 60 * 60 * 1000;
        
        const scheduleNextMessage = () => {
            const randomDelay = Math.floor(Math.random() * (maxInterval - minInterval) + minInterval);
            
            messageInterval = setTimeout(async () => {
                try {
                    await sendRandomMessage(client, config);
                } catch (error) {
                    console.error('Error sending random message:', error);
                }
                scheduleNextMessage(); // Schedule the next one
            }, randomDelay);
            
            const hours = (randomDelay / (60 * 60 * 1000)).toFixed(1);
            console.log(`Next random message scheduled in ${hours} hours`);
        };
        
        // Start scheduling
        scheduleNextMessage();
        console.log('Random message system initialized');
    },
    
    // Export for test command
    sendRandomMessage: async (client) => {
        const config = getRuntimeConfig(client);
        if (!config) return null;
        return await sendRandomMessage(client, config);
    }
};

async function sendRandomMessage(client, config) {
    const channel = client.channels.cache.get(config.channels.randomMessages);
    
    if (!channel) {
        console.log('Random messages channel not found');
        return null;
    }
    
    // Check if "General" channel has recent activity (messages in last 10 minutes)
    if (config.features.randomMessages.requireChannelActivity) {
        const generalChannelId = config.features.randomMessages.requireChannelActivity;
        
        try {
            const generalChannel = client.channels.cache.get(generalChannelId);
            if (generalChannel && generalChannel.isTextBased()) {
                // Fetch recent messages (last 10 messages)
                const messages = await generalChannel.messages.fetch({ limit: 10 });
                const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
                
                // Check if any HUMAN messages were sent in the last 10 minutes (exclude bot messages)
                const hasRecentActivity = messages.some(msg => 
                    msg.createdTimestamp > tenMinutesAgo && !msg.author.bot
                );
                
                if (!hasRecentActivity) {
                    console.log(`Random message skipped - no recent human activity in general channel`);
                    return null;
                }
            }
        } catch (error) {
            console.log('Could not check general channel activity for random messages:', error.message);
        }
    }
    
    const message = randomMessagesData.messages[Math.floor(Math.random() * randomMessagesData.messages.length)];
    const sentMessage = await channel.send(message);
    console.log(`Sent random message: "${message}"`);
    return sentMessage;
}
