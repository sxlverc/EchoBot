const fs = require('fs');
const path = require('path');
const getConfig = require('../../configHelper');

const birthdayDataPath = path.join(__dirname, '../../data/birthdayData.json');

function loadBirthdayData() {
    try {
        const raw = JSON.parse(fs.readFileSync(birthdayDataPath, 'utf8'));
        if (raw.guilds && typeof raw.guilds === 'object') return raw;
        return { guilds: {}, legacy: raw };
    } catch {
        return { guilds: {}, legacy: {} };
    }
}

function getBirthdaysForGuild(data, guildId) {
    const legacy = data.legacy && typeof data.legacy === 'object' ? data.legacy : {};
    const guildBirthdays = data.guilds?.[guildId] || {};
    return { ...legacy, ...guildBirthdays };
}

// Track users who currently have the birthday role
let activeBirthdays = new Set();

module.exports = {
    register: (client) => {
        // Check birthdays every hour
        setInterval(() => checkBirthdays(client), 60 * 60 * 1000);
        
        // Also check on startup
        setTimeout(() => checkBirthdays(client), 5000);
        
        console.log('Birthday system initialized');
    }
};

async function checkBirthdays(client) {
    try {
        const birthdayData = loadBirthdayData();
        
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
        const currentDay = now.getDate();
        
        // Get all guilds the bot is in
        for (const [guildId, guild] of client.guilds.cache) {
            const config = getConfig(guildId);
            if (!config.features?.birthdays?.enabled) {
                continue;
            }

            const guildBirthdays = getBirthdaysForGuild(birthdayData, guildId);
            if (Object.keys(guildBirthdays).length === 0) {
                continue;
            }

            if (!config.roles.birthday) {
                console.log(`Birthday role not configured for guild ${guild.name}`);
                continue;
            }

            const birthdayRole = guild.roles.cache.get(config.roles.birthday);
            
            if (!birthdayRole) {
                console.log(`Birthday role not found in guild ${guild.name}`);
                continue;
            }
            
            // Check if bot can manage the role
            const botMember = await guild.members.fetchMe();
            if (birthdayRole.position >= botMember.roles.highest.position) {
                console.log(`Birthday role is too high in hierarchy for guild ${guild.name}`);
                continue;
            }
            
            // Check each user's birthday
            for (const [userId, birthdayInfo] of Object.entries(guildBirthdays)) {
                try {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) continue;
                    
                    const isBirthday = birthdayInfo.month === currentMonth && birthdayInfo.day === currentDay;
                    const hasBirthdayRole = member.roles.cache.has(config.roles.birthday);
                    const activeKey = `${guildId}:${userId}`;
                    
                    if (isBirthday && !hasBirthdayRole) {
                        // It's their birthday! Add the role
                        await member.roles.add(birthdayRole);
                        activeBirthdays.add(activeKey);
                        
                        // Send congratulations message
                        if (config.channels.birthday) {
                            const channel = guild.channels.cache.get(config.channels.birthday);
                            if (channel) {
                                await channel.send(`🎉🎂 Happy Birthday <@${userId}>! 🎂🎉\n\nEnjoy your special day and your birthday role! 🎈`);
                            }
                        }
                        
                        console.log(`Added birthday role to user ${userId}`);
                    } else if (!isBirthday && hasBirthdayRole && activeBirthdays.has(activeKey)) {
                        // Birthday is over, remove the role
                        await member.roles.remove(birthdayRole);
                        activeBirthdays.delete(activeKey);
                        console.log(`Removed birthday role from user ${userId}`);
                    }
                } catch (error) {
                    console.error(`Error processing birthday for user ${userId}:`, error.message);
                }
            }
        }
    } catch (error) {
        console.error('Error checking birthdays:', error);
    }
}
