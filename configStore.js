const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');

function readAllConfig() {
    try {
        const raw = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function writeAllConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function ensureGuildDefaults(guildConfig = {}) {
    const normalized = { ...guildConfig };
    normalized.channels = normalized.channels || {};
    normalized.roles = normalized.roles || {};
    normalized.users = normalized.users || {};
    normalized.features = normalized.features || {};

    normalized.features.xp = normalized.features.xp || {};
    normalized.features.xp.enabled = normalized.features.xp.enabled ?? true;
    normalized.features.xp.messageXP = normalized.features.xp.messageXP ?? 10;
    normalized.features.xp.voiceXPPerMinute = normalized.features.xp.voiceXPPerMinute ?? 5;
    normalized.features.xp.xpPerLevel = normalized.features.xp.xpPerLevel ?? 100;
    normalized.features.xp.messageCooldown = normalized.features.xp.messageCooldown ?? 10000;
    normalized.features.xp.excludedChannels = normalized.features.xp.excludedChannels || [];
    normalized.features.xp.gameXP = normalized.features.xp.gameXP || {};

    normalized.features.welcome = normalized.features.welcome || {};
    normalized.features.welcome.enabled = normalized.features.welcome.enabled ?? true;

    normalized.features.linkFixer = normalized.features.linkFixer || {};
    normalized.features.linkFixer.enabled = normalized.features.linkFixer.enabled ?? true;
    normalized.features.linkFixer.suppressEmbeds = normalized.features.linkFixer.suppressEmbeds ?? true;

    normalized.features.voicemaster = normalized.features.voicemaster || {};
    normalized.features.voicemaster.enabled = normalized.features.voicemaster.enabled ?? false;

    normalized.features.birthdays = normalized.features.birthdays || {};
    normalized.features.birthdays.enabled = normalized.features.birthdays.enabled ?? true;

    normalized.features.bumpReminder = normalized.features.bumpReminder || {};
    normalized.features.bumpReminder.enabled = normalized.features.bumpReminder.enabled ?? true;
    normalized.features.bumpReminder.disboard = normalized.features.bumpReminder.disboard ?? true;
    normalized.features.bumpReminder.discadia = normalized.features.bumpReminder.discadia ?? true;

    normalized.features.suggestions = normalized.features.suggestions || {};
    normalized.features.suggestions.requireRecentActivity = normalized.features.suggestions.requireRecentActivity ?? false;
    normalized.features.suggestions.activityDays = normalized.features.suggestions.activityDays ?? 14;

    normalized.features.presence = normalized.features.presence || {};
    normalized.features.presence.onlineStatus = normalized.features.presence.onlineStatus || 'online';
    normalized.features.presence.rotateMinutes = normalized.features.presence.rotateMinutes ?? 5;
    normalized.features.presence.activities = normalized.features.presence.activities || [];

    normalized.features.serverLogger = normalized.features.serverLogger || {};
    normalized.features.serverLogger.enabled = normalized.features.serverLogger.enabled ?? true;
    normalized.features.serverLogger.logChannelEvents = normalized.features.serverLogger.logChannelEvents ?? true;
    normalized.features.serverLogger.logRoleEvents = normalized.features.serverLogger.logRoleEvents ?? true;
    normalized.features.serverLogger.logImageEdits = normalized.features.serverLogger.logImageEdits ?? true;
    normalized.features.serverLogger.logMessageEvents = normalized.features.serverLogger.logMessageEvents ?? true;
    normalized.features.serverLogger.logMemberEvents = normalized.features.serverLogger.logMemberEvents ?? true;
    normalized.features.serverLogger.logModerationEvents = normalized.features.serverLogger.logModerationEvents ?? true;
    normalized.features.serverLogger.logEmojiEvents = normalized.features.serverLogger.logEmojiEvents ?? true;
    normalized.features.serverLogger.logVoiceEvents = normalized.features.serverLogger.logVoiceEvents ?? true;
    normalized.features.serverLogger.ignoreBots = normalized.features.serverLogger.ignoreBots ?? true;

    return normalized;
}

function getGuildConfig(guildId) {
    const all = readAllConfig();
    return ensureGuildDefaults(all[guildId] || {});
}

function setGuildConfig(guildId, guildConfig) {
    const all = readAllConfig();
    all[guildId] = ensureGuildDefaults(guildConfig);
    writeAllConfig(all);
}

module.exports = {
    readAllConfig,
    writeAllConfig,
    ensureGuildDefaults,
    getGuildConfig,
    setGuildConfig
};