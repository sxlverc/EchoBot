const getConfig = require('../../configHelper');

async function checkAndAssignLevelRoles(member, newLevel, oldLevel) {
    try {
        const config = getConfig(member.guild.id);
        const levelRoles = config.roles.levels || {};
        const newcomerRoleId = config.roles.newcomer;
        const embedPermissionsRoleId = levelRoles['2']; // Level 2 = Embed Permissions (keep forever)
        const shouldRemovePreviousRoles = config.features?.xp?.removePreviousLevelRoles === true;
        
        // Get sorted level thresholds
        const sortedLevels = Object.keys(levelRoles).map(l => parseInt(l)).sort((a, b) => a - b);
        
        // Find the highest role the user qualifies for
        let targetRoleLevel = null;
        for (const level of sortedLevels) {
            if (level <= newLevel) {
                targetRoleLevel = level;
            }
        }
        
        // Always manage newcomer role for levels under 5
        if (newLevel < 5) {
            // User is under level 5, they should have the newcomer role
            if (newcomerRoleId && !member.roles.cache.has(newcomerRoleId)) {
                const newcomerRole = member.guild.roles.cache.get(newcomerRoleId);
                if (newcomerRole) {
                    await member.roles.add(newcomerRole);
                    console.log(`Assigned newcomer role to ${member.user.tag}`);
                }
            }
        }
        
        if (!targetRoleLevel) {
            // User hasn't reached level 2 yet
            return;
        }
        
        const targetRoleId = levelRoles[targetRoleLevel.toString()];
        const targetRole = member.guild.roles.cache.get(targetRoleId);
        
        // Add Embed Permissions (level 2) if they're level 2+
        if (newLevel >= 2 && embedPermissionsRoleId && !member.roles.cache.has(embedPermissionsRoleId)) {
            const embedRole = member.guild.roles.cache.get(embedPermissionsRoleId);
            if (embedRole) {
                await member.roles.add(embedRole);
                console.log(`Assigned Embed Permissions role to ${member.user.tag}`);
            }
        }
        
        // Add the target role if they don't have it
        if (targetRole && !member.roles.cache.has(targetRoleId)) {
            await member.roles.add(targetRole);
            console.log(`Assigned role "${targetRole.name}" to ${member.user.tag} for level ${newLevel}`);
            
            // Send announcement to level-up channel (skip for level 2 since embed permissions is kept)
            if (targetRoleLevel > 2) {
                const levelUpChannelId = config.channels.levelUp;
                if (levelUpChannelId) {
                    const channel = member.guild.channels.cache.get(levelUpChannelId);
                    if (channel) {
                        channel.send(`🏆 <@${member.id}> earned the **${targetRole.name}** role for reaching level ${newLevel}!`);
                    }
                }
            }
        }
        
        // Optional cleanup mode: remove previous level roles only when explicitly enabled.
        if (shouldRemovePreviousRoles) {
            for (const roleId of Object.values(levelRoles)) {
                // Keep embed permissions (level 2) and current target role.
                if (roleId !== embedPermissionsRoleId && roleId !== targetRoleId && member.roles.cache.has(roleId)) {
                    const oldRole = member.guild.roles.cache.get(roleId);
                    if (oldRole) {
                        await member.roles.remove(oldRole);
                        console.log(`Removed old level role "${oldRole.name}" from ${member.user.tag}`);
                    }
                }
            }
        }
        
        // Remove newcomer role once they reach level 5+ (Den Dweller)
        if (newLevel >= 5 && newcomerRoleId && member.roles.cache.has(newcomerRoleId)) {
            const newcomerRole = member.guild.roles.cache.get(newcomerRoleId);
            if (newcomerRole) {
                await member.roles.remove(newcomerRole);
                console.log(`Removed newcomer role from ${member.user.tag}`);
            }
        }
        
    } catch (error) {
        console.error('Error assigning level roles:', error);
    }
}

module.exports = { checkAndAssignLevelRoles };