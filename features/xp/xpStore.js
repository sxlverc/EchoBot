const fs = require('fs');
const path = require('path');

const xpDataPath = path.join(__dirname, '../../data/xpData.json');

function readRawXpData() {
    try {
        return JSON.parse(fs.readFileSync(xpDataPath, 'utf8'));
    } catch {
        return { guilds: {} };
    }
}

function normalizeXpData(raw) {
    if (raw && typeof raw === 'object' && raw.guilds && typeof raw.guilds === 'object') {
        return raw;
    }

    // Backward compatibility: old format was a plain { userId: { xp, level, ... } } map.
    // Keep it under a legacy bucket so no data is lost.
    const legacy = raw && typeof raw === 'object' ? raw : {};
    return { guilds: { legacy } };
}

function writeRawXpData(data) {
    fs.writeFileSync(xpDataPath, JSON.stringify(data, null, 2));
}

function loadGuildXpData(guildId) {
    const normalized = normalizeXpData(readRawXpData());
    return normalized.guilds[guildId] || {};
}

function saveGuildXpData(guildId, guildData) {
    const normalized = normalizeXpData(readRawXpData());
    normalized.guilds[guildId] = guildData;
    writeRawXpData(normalized);
}

module.exports = {
    loadGuildXpData,
    saveGuildXpData,
    readRawXpData,
    normalizeXpData,
    writeRawXpData
};
