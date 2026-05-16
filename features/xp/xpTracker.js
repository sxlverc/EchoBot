const { Events, EmbedBuilder } = require('discord.js');
const { checkAndAssignLevelRoles } = require('./roleRewards');
const { getLevelFromXp } = require('./xpUtils');
const getConfig = require('../../configHelper');
const { loadGuildXpData, saveGuildXpData } = require('./xpStore');

// Anti-spam protection - store last message timestamps by guild/user
const userCooldowns = new Map();

function register(client) {
    client.on(Events.MessageCreate, async message => {
        if (!message.guild) return;

        const config = getConfig(message.guild.id);
        const xpConfig = config.features.xp;

        // Check if XP is enabled
        if (!xpConfig.enabled) return;

        // Ignore bot messages
        if (message.author.bot) return;

        // Ignore messages that are too short (potential spam)
        if (message.content.length < 3) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const cooldownKey = `${guildId}:${userId}`;
        const now = Date.now();

        // Check if channel is excluded from XP
        if (xpConfig.excludedChannels && xpConfig.excludedChannels.includes(message.channel.id)) {
            return;
        }

        // Anti-spam cooldown check
        const lastMessageTime = userCooldowns.get(cooldownKey);
        if (lastMessageTime && (now - lastMessageTime) < xpConfig.messageCooldown) {
            return;
        }

        userCooldowns.set(cooldownKey, now);

        const xpData = loadGuildXpData(guildId);

        if (!xpData[userId]) {
            xpData[userId] = { xp: 0, level: 1, lastActive: now };
        } else {
            xpData[userId].lastActive = now;
        }

        xpData[userId].xp += xpConfig.messageXP;

        const oldLevel = xpData[userId].level;
        const newLevel = getLevelFromXp(xpData[userId].xp);

        if (newLevel > oldLevel) {
            xpData[userId].level = newLevel;

            const levelUpChannelId = config.channels.levelUp;
            if (levelUpChannelId) {
                const levelUpChannel = message.guild.channels.cache.get(levelUpChannelId);
                if (levelUpChannel) {
                    const levelUpEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle(`${message.author.username} leveled up!`)
                        .setDescription(`**CONGRATS**\nYou are now level **${newLevel}**!!`)
                        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() });

                    await levelUpChannel.send({ embeds: [levelUpEmbed] });
                }
            }

            await checkAndAssignLevelRoles(message.member, newLevel, oldLevel);
        }

        saveGuildXpData(guildId, xpData);
    });
}

    module.exports = { register };
