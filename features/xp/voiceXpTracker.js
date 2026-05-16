const { Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { checkAndAssignLevelRoles } = require('./roleRewards');
const { getLevelFromXp } = require('./xpUtils');
const getConfig = require('../../configHelper');
const { loadGuildXpData, saveGuildXpData } = require('./xpStore');

const voiceSessionsPath = path.join(__dirname, '../../data/voiceSessions.json');

function loadVoiceSessions() {
    try {
        return JSON.parse(fs.readFileSync(voiceSessionsPath, 'utf8'));
    } catch {
        return {};
    }
}

function saveVoiceSessions(data) {
    fs.writeFileSync(voiceSessionsPath, JSON.stringify(data, null, 2));
}

function getGuildSessions(sessions, guildId) {
    if (!sessions[guildId]) {
        sessions[guildId] = {};
    }
    return sessions[guildId];
}

function register(client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        const config = getConfig(guild.id);
        const xpConfig = config.features.xp;

        // Check if XP is enabled
        if (!xpConfig.enabled) return;
        
        const userId = newState.id;
        const voiceSessions = loadVoiceSessions();
        const guildSessions = getGuildSessions(voiceSessions, guild.id);
        
        // User joined a voice channel
        if (!oldState.channel && newState.channel) {
            guildSessions[userId] = {
                channelId: newState.channel.id,
                joinTime: Date.now()
            };
            saveVoiceSessions(voiceSessions);
        }
        
        // User left a voice channel
        else if (oldState.channel && !newState.channel) {
            if (guildSessions[userId]) {
                const sessionTime = Date.now() - guildSessions[userId].joinTime;
                const minutesInVoice = Math.floor(sessionTime / 60000);
                
                // Check if user was alone in the channel (only count XP if there were others)
                const wasAlone = oldState.channel.members.size <= 1;
                
                if (minutesInVoice > 0 && !wasAlone) {
                    const voiceXP = minutesInVoice * xpConfig.voiceXPPerMinute;
                    
                    const xpData = loadGuildXpData(guild.id);
                    const now = Date.now();
                    if (!xpData[userId]) {
                        xpData[userId] = { xp: 0, level: 1, lastActive: now };
                    } else {
                        xpData[userId].lastActive = now;
                    }
                    
                    const oldLevel = xpData[userId].level;
                    xpData[userId].xp += voiceXP;
                    const newLevel = getLevelFromXp(xpData[userId].xp);
                    xpData[userId].level = newLevel;
                    
                    // Check for level up
                    if (newLevel > oldLevel) {
                        const levelUpChannelId = config.channels.levelUp;
                        if (levelUpChannelId) {
                            const channel = guild.channels.cache.get(levelUpChannelId);
                            if (channel) {
                                const member = await guild.members.fetch(userId);
                                const levelUpEmbed = new EmbedBuilder()
                                    .setColor('#9B59B6')
                                    .setTitle(`${member.user.username} leveled up!`)
                                    .setDescription(`**CONGRATS**\nYou are now level **${newLevel}**!!\n\n*Earned from voice chat* 🎤`)
                                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                                    .setFooter({ text: guild.name, iconURL: guild.iconURL() });
                                
                                channel.send({ embeds: [levelUpEmbed] });
                            }
                        }
                        
                        const member = await guild.members.fetch(userId);
                        await checkAndAssignLevelRoles(member, newLevel, oldLevel);
                    }
                    
                    saveGuildXpData(guild.id, xpData);
                }
                
                delete guildSessions[userId];
                saveVoiceSessions(voiceSessions);
            }
        }
        
        // User switched voice channels
        else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
            if (guildSessions[userId]) {
                guildSessions[userId].channelId = newState.channel.id;
                saveVoiceSessions(voiceSessions);
            }
        }
    });
    
    // Award XP every 5 minutes for users currently in voice
    setInterval(async () => {
        const voiceSessions = loadVoiceSessions();
        let sessionsUpdated = false;

        for (const guild of client.guilds.cache.values()) {
            const config = getConfig(guild.id);
            const xpConfig = config.features.xp;
            if (!xpConfig.enabled) continue;

            const guildSessions = getGuildSessions(voiceSessions, guild.id);
            const xpData = loadGuildXpData(guild.id);
            let updated = false;

            // Clean up sessions for users no longer in voice in this guild.
            for (const userId of Object.keys(guildSessions)) {
                const member = guild.members.cache.get(userId);
                if (!member || !member.voice.channel) {
                    delete guildSessions[userId];
                    sessionsUpdated = true;
                }
            }

            for (const [userId, session] of Object.entries(guildSessions)) {
                const member = guild.members.cache.get(userId);
                if (!member || !member.voice.channel) continue;

                const timeInSession = Date.now() - session.joinTime;
                const minutesInSession = Math.floor(timeInSession / 60000);

                // Only award when at least 2 people are present.
                const isAlone = member.voice.channel.members.size <= 1;
                if (minutesInSession >= 5 && minutesInSession % 5 === 0 && !isAlone) {
                    if (!xpData[userId]) {
                        xpData[userId] = { xp: 0, level: 1 };
                    }

                    const oldLevel = xpData[userId].level;
                    xpData[userId].xp += xpConfig.voiceXPPerMinute * 5;
                    const newLevel = getLevelFromXp(xpData[userId].xp);
                    xpData[userId].level = newLevel;

                    if (newLevel > oldLevel) {
                        try {
                            const levelUpChannelId = config.channels.levelUp;
                            if (levelUpChannelId) {
                                const channel = guild.channels.cache.get(levelUpChannelId);
                                if (channel) {
                                    const levelUpEmbed = new EmbedBuilder()
                                        .setColor('#9B59B6')
                                        .setTitle(`${member.user.username} leveled up!`)
                                        .setDescription(`**CONGRATS**\nYou are now level **${newLevel}**!!\n\n*Earned from voice chat* 🎤`)
                                        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                                        .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                                    await channel.send({ embeds: [levelUpEmbed] });
                                }
                            }

                            await checkAndAssignLevelRoles(member, newLevel, oldLevel);
                        } catch (error) {
                            console.error('Error handling voice level up:', error);
                        }
                    }

                    updated = true;
                }
            }

            if (updated) {
                saveGuildXpData(guild.id, xpData);
            }
        }

        if (sessionsUpdated) {
            saveVoiceSessions(voiceSessions);
        }
    }, 60000);
}

module.exports = { register };