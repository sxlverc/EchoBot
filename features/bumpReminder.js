const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const getConfig = require('../configHelper');

const bumpDataPath = path.join(__dirname, '../data/bumpData.json');

// Bot IDs for DISBOARD and Discadia
const DISBOARD_BOT_ID = '302050872383242240';
const DISCADIA_BOT_ID = '1222548162741538938';

function defaultGuildBumpData() {
    return {
        disboard: { lastBump: 0, reminderSent: false, channelId: null },
        discadia: { lastBump: 0, reminderSent: false, channelId: null }
    };
}

function loadAllBumpData() {
    try {
        const raw = JSON.parse(fs.readFileSync(bumpDataPath, 'utf8'));
        if (raw.guilds && typeof raw.guilds === 'object') return raw;

        // Legacy format migration
        if (raw.disboard || raw.discadia) {
            return { guilds: { legacy: { ...defaultGuildBumpData(), ...raw } } };
        }

        return { guilds: {} };
    } catch {
        return { guilds: {} };
    }
}

function saveAllBumpData(data) {
    fs.writeFileSync(bumpDataPath, JSON.stringify(data, null, 2));
}

function getGuildBumpData(data, guildId) {
    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuildBumpData();

    if (!data.guilds[guildId].disboard) data.guilds[guildId].disboard = defaultGuildBumpData().disboard;
    if (!data.guilds[guildId].discadia) data.guilds[guildId].discadia = defaultGuildBumpData().discadia;

    return data.guilds[guildId];
}

function isDisboardSuccess(message) {
    return (
        message.author.id === DISBOARD_BOT_ID &&
        message.embeds.length > 0 &&
        message.embeds[0].description &&
        message.embeds[0].description.includes('Bump done!')
    );
}

function isDiscadiaSuccess(message) {
    if (message.author.id !== DISCADIA_BOT_ID) return false;

    const content = (message.content || '').toLowerCase();
    if (content.includes('bump') || content.includes('success')) return true;

    if (message.embeds.length === 0) return false;
    const embed = message.embeds[0];

    const title = (embed.title || '').toLowerCase();
    const description = (embed.description || '').toLowerCase();

    if (title.includes('bump') || title.includes('success')) return true;
    if (description.includes('bump') || description.includes('success') || description.includes('successfully')) return true;

    if (Array.isArray(embed.fields)) {
        return embed.fields.some(field => {
            const name = (field.name || '').toLowerCase();
            const value = (field.value || '').toLowerCase();
            return name.includes('bump') || value.includes('bump') || value.includes('success');
        });
    }

    return false;
}

function register(client) {
    console.log('Bump reminder system registered');

    client.on(Events.MessageCreate, async (message) => {
        if (!message.guild || !message.author.bot) return;
        if (message.author.id !== DISBOARD_BOT_ID && message.author.id !== DISCADIA_BOT_ID) return;

        const config = getConfig(message.guild.id);
        if (!config.features?.bumpReminder?.enabled) return;

        const bumpChannelId = config.channels?.bump;
        if (!bumpChannelId || message.channel.id !== bumpChannelId) return;

        const allBumpData = loadAllBumpData();
        const guildBumpData = getGuildBumpData(allBumpData, message.guild.id);
        let changed = false;

        if (isDisboardSuccess(message)) {
            guildBumpData.disboard.lastBump = Date.now();
            guildBumpData.disboard.reminderSent = false;
            guildBumpData.disboard.channelId = message.channel.id;
            changed = true;
            console.log(`[${message.guild.name}] DISBOARD bump confirmed`);
        }

        if (isDiscadiaSuccess(message)) {
            guildBumpData.discadia.lastBump = Date.now();
            guildBumpData.discadia.reminderSent = false;
            guildBumpData.discadia.channelId = message.channel.id;
            changed = true;
            console.log(`[${message.guild.name}] Discadia bump confirmed`);
        }

        if (changed) saveAllBumpData(allBumpData);
    });

    // Check every 5 minutes
    setInterval(async () => {
        const now = Date.now();
        const allBumpData = loadAllBumpData();
        let changed = false;

        for (const [guildId, guild] of client.guilds.cache) {
            const config = getConfig(guildId);
            const feature = config.features?.bumpReminder;
            if (!feature?.enabled) continue;

            const bumpChannelId = config.channels?.bump;
            if (!bumpChannelId) continue;

            const channel = guild.channels.cache.get(bumpChannelId);
            if (!channel) continue;

            const guildBumpData = getGuildBumpData(allBumpData, guildId);

            // DISBOARD: 2 hours
            if (
                feature.disboard &&
                guildBumpData.disboard.lastBump > 0 &&
                !guildBumpData.disboard.reminderSent &&
                (now - guildBumpData.disboard.lastBump) >= 7200000
            ) {
                try {
                    await channel.send('⏰ **DISBOARD bump is ready!** Please use `/bump` to bump the server.');
                    guildBumpData.disboard.reminderSent = true;
                    changed = true;
                } catch (error) {
                    console.error(`Error sending DISBOARD reminder in guild ${guild.name}:`, error);
                }
            }

            // Discadia: 24 hours
            if (
                feature.discadia &&
                guildBumpData.discadia.lastBump > 0 &&
                !guildBumpData.discadia.reminderSent &&
                (now - guildBumpData.discadia.lastBump) >= 86400000
            ) {
                try {
                    await channel.send('⏰ **Discadia bump is ready!** Please use `/bump` to bump the server.');
                    guildBumpData.discadia.reminderSent = true;
                    changed = true;
                } catch (error) {
                    console.error(`Error sending Discadia reminder in guild ${guild.name}:`, error);
                }
            }
        }

        if (changed) saveAllBumpData(allBumpData);
    }, 300000);
}

module.exports = { register };