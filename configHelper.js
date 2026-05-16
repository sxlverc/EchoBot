/**
 * Config helper for multi-guild bot
 * Returns config for a specific guild
 */

const { getGuildConfig } = require('./configStore');

module.exports = (guildId) => {
    const guildConfig = getGuildConfig(guildId);
    if (!guildConfig) {
        throw new Error(`No config found for guild ${guildId}`);
    }

    // Helper function to get nested config values
    function getConfigValue(path, defaultValue = null) {
        const parts = path.split('.');
        let value = guildConfig;

        for (const part of parts) {
            value = value?.[part];
        }

        return value !== undefined ? value : defaultValue;
    }

    return {
        // Raw config for direct access
        raw: guildConfig,

        // Channels
        channels: {
            greeting: getConfigValue('channels.greeting'),
            birthday: getConfigValue('channels.birthday'),
            levelUp: getConfigValue('channels.levelUp'),
            bump: getConfigValue('channels.bump'),
            vcLogs: getConfigValue('channels.vcLogs'),
            serverLogs: getConfigValue('channels.serverLogs'),
            roleLogs: getConfigValue('channels.roleLogs'),
            messageLogs: getConfigValue('channels.messageLogs'),
            quotes: getConfigValue('channels.quotes')
        },

        // Roles
        roles: {
            birthday: getConfigValue('roles.birthday'),
            newcomer: getConfigValue('roles.newcomer'),
            suggestions: getConfigValue('roles.suggestions'),
            vcPing: getConfigValue('roles.vcPing'),
            privilegedExecutors: getConfigValue('roles.privilegedExecutors', []),
            levels: getConfigValue('roles.levels', {})
        },

        // Features
        features: {
            xp: {
                enabled: getConfigValue('features.xp.enabled', true),
                messageXP: getConfigValue('features.xp.messageXP', 10),
                voiceXPPerMinute: getConfigValue('features.xp.voiceXPPerMinute', 5),
                xpPerLevel: getConfigValue('features.xp.xpPerLevel', 100),
                messageCooldown: getConfigValue('features.xp.messageCooldown', 10000),
                excludedChannels: getConfigValue('features.xp.excludedChannels', []),
                gameXP: getConfigValue('features.xp.gameXP', {})
            },
            bumpReminder: {
                enabled: getConfigValue('features.bumpReminder.enabled', true),
                disboard: getConfigValue('features.bumpReminder.disboard', true),
                discadia: getConfigValue('features.bumpReminder.discadia', true)
            },
            welcome: {
                enabled: getConfigValue('features.welcome.enabled', true),
                gifUrl: getConfigValue('features.welcome.gifUrl')
            },
            linkFixer: {
                enabled: getConfigValue('features.linkFixer.enabled', true),
                suppressEmbeds: getConfigValue('features.linkFixer.suppressEmbeds', true)
            },
            voicemaster: {
                enabled: getConfigValue('features.voicemaster.enabled', false),
                joinToCreateChannel: getConfigValue('features.voicemaster.joinToCreateChannel')
            },
            serverLogger: {
                enabled: getConfigValue('features.serverLogger.enabled', true),
                logChannelEvents: getConfigValue('features.serverLogger.logChannelEvents', true),
                logRoleEvents: getConfigValue('features.serverLogger.logRoleEvents', true),
                logImageEdits: getConfigValue('features.serverLogger.logImageEdits', true),
                logMessageEvents: getConfigValue('features.serverLogger.logMessageEvents', true),
                logMemberEvents: getConfigValue('features.serverLogger.logMemberEvents', true),
                logModerationEvents: getConfigValue('features.serverLogger.logModerationEvents', true),
                logEmojiEvents: getConfigValue('features.serverLogger.logEmojiEvents', true),
                logVoiceEvents: getConfigValue('features.serverLogger.logVoiceEvents', true),
                ignoreBots: getConfigValue('features.serverLogger.ignoreBots', true)
            },
                presence: {
                    onlineStatus: getConfigValue('features.presence.onlineStatus', 'online'),
                    rotateMinutes: getConfigValue('features.presence.rotateMinutes', 5),
                    activities: getConfigValue('features.presence.activities', [])
                },
        },

        // Legacy compatibility
        get greetingChannelId() { return this.channels.greeting; },
        get birthdayChannelId() { return this.channels.birthday; },
        get birthdayRoleId() { return this.roles.birthday; },
        get levelRoles() { return this.roles.levels; },
        get welcomeGifUrl() { return this.features.welcome.gifUrl; },
        get xpSettings() { return this.features.xp; },
        get bumpReminder() { return this.features.bumpReminder; },

        // Permission helpers
        isPrivilegedExecutor(member) {
            if (member.permissions.has('Administrator')) return true;
            const privilegedRoles = this.roles.privilegedExecutors;
            if (!privilegedRoles || privilegedRoles.length === 0) return false;
            return member.roles.cache.some(role => privilegedRoles.includes(role.id));
        }
    };
};