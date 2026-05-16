const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const voiceSessionsPath = path.join(dataDir, 'voiceSessions.json');
const suggestionsDataPath = path.join(dataDir, 'suggestionsData.json');
const bumpDataPath = path.join(dataDir, 'bumpData.json');

// Clean up stale voice sessions (users not in any voice channel)
function cleanupVoiceSessions(client) {
    try {
        if (!fs.existsSync(voiceSessionsPath)) return;
        
        const sessions = JSON.parse(fs.readFileSync(voiceSessionsPath, 'utf8'));
        let cleaned = false;
        
        // Get all users currently in voice channels
        const activeVoiceUsers = new Set();
        for (const guild of client.guilds.cache.values()) {
            for (const member of guild.members.cache.values()) {
                if (member.voice.channel) {
                    activeVoiceUsers.add(member.id);
                }
            }
        }
        
        // Remove sessions for users not in voice
        for (const userId in sessions) {
            if (!activeVoiceUsers.has(userId)) {
                delete sessions[userId];
                cleaned = true;
            }
        }
        
        if (cleaned) {
            fs.writeFileSync(voiceSessionsPath, JSON.stringify(sessions, null, 2));
            console.log('Cleaned up stale voice sessions');
        }
    } catch (error) {
        console.error('Error cleaning up voice sessions:', error);
    }
}

// Clean up old/completed suggestions (older than 30 days)
function cleanupOldSuggestions() {
    try {
        if (!fs.existsSync(suggestionsDataPath)) return;
        
        const data = JSON.parse(fs.readFileSync(suggestionsDataPath, 'utf8'));
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        let cleaned = false;
        
        // Remove suggestions older than 30 days that are completed/denied
        for (const messageId in data.suggestions) {
            const suggestion = data.suggestions[messageId];
            const createdAt = parseInt(messageId) / 4194304 + 1420070400000; // Discord snowflake to timestamp
            
            if (createdAt < thirtyDaysAgo && (suggestion.status === 'completed' || suggestion.status === 'denied')) {
                delete data.suggestions[messageId];
                cleaned = true;
            }
        }
        
        if (cleaned) {
            fs.writeFileSync(suggestionsDataPath, JSON.stringify(data, null, 2));
            console.log('Cleaned up old completed/denied suggestions');
        }
    } catch (error) {
        console.error('Error cleaning up suggestions:', error);
    }
}

// Clean up old bump reminder data (older than 7 days)
function cleanupOldBumpData() {
    try {
        if (!fs.existsSync(bumpDataPath)) return;
        
        const data = JSON.parse(fs.readFileSync(bumpDataPath, 'utf8'));
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        let cleaned = false;
        
        // Remove old bump history entries
        if (data.bumpHistory) {
            const originalLength = data.bumpHistory.length;
            data.bumpHistory = data.bumpHistory.filter(entry => entry.timestamp > sevenDaysAgo);
            
            if (data.bumpHistory.length < originalLength) {
                cleaned = true;
            }
        }
        
        if (cleaned) {
            fs.writeFileSync(bumpDataPath, JSON.stringify(data, null, 2));
            console.log('Cleaned up old bump history');
        }
    } catch (error) {
        console.error('Error cleaning up bump data:', error);
    }
}

// Clean up temp files in assets and data directories
function cleanupTempFiles() {
    try {
        const assetsDir = path.join(__dirname, '../assets');
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        let cleaned = 0;
        
        // Clean up quote temp files older than 1 hour
        if (fs.existsSync(assetsDir)) {
            for (const file of fs.readdirSync(assetsDir)) {
                if (file.startsWith('quote_') && file.endsWith('.png')) {
                    const filePath = path.join(assetsDir, file);
                    const stats = fs.statSync(filePath);
                    if (stats.mtimeMs < oneHourAgo) {
                        fs.unlinkSync(filePath);
                        cleaned++;
                    }
                }
            }
        }
        
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} temporary files`);
        }
    } catch (error) {
        console.error('Error cleaning up temp files:', error);
    }
}

// Run all cleanup tasks
function runAllCleanups(client) {
    cleanupVoiceSessions(client);
    cleanupTempFiles();
}

module.exports = {
    cleanupVoiceSessions,
    cleanupTempFiles,
    runAllCleanups
};
