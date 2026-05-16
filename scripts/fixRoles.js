require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('../configHelper');
const fs = require('fs');
const path = require('path');
const { getLevelFromXp } = require('../features/xp/xpUtils');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', async () => {
    console.log('Bot is ready. Fixing roles...');

    const guild = client.guilds.cache.first();
    if (!guild) {
        console.error('No guild found.');
        process.exit(1);
    }

    // Load XP data
    const xpDataPath = path.join(__dirname, '../data/xpData.json');
    let xpData = {};
    if (fs.existsSync(xpDataPath)) {
        xpData = JSON.parse(fs.readFileSync(xpDataPath, 'utf8'));
    }

    const levelRoles = config.roles.levels || {};
    const newcomerRoleId = config.roles.newcomer;
    const embedPermissionsRoleId = levelRoles['2']; // Level 2 = Embed Permissions (keep forever)
    const level10RoleId = levelRoles['10']; // Level 10 role (keep forever)
    const keepForever = [embedPermissionsRoleId, level10RoleId].filter(Boolean);

    // Get sorted level thresholds
    const sortedLevels = Object.keys(levelRoles).map(l => parseInt(l)).sort((a, b) => a - b);

    // Get all members
    const members = await guild.members.fetch();

    for (const [userId, member] of members) {
        const userData = xpData[userId] || {};
        const userXp = typeof userData === 'object' ? userData.xp || 0 : userData;
        const userLevel = getLevelFromXp(userXp);

        console.log(`Processing ${member.user.tag}: XP ${userXp}, Level ${userLevel}`);

        // Find the highest role the user qualifies for
        let targetRoleLevel = null;
        for (const level of sortedLevels) {
            if (level <= userLevel) {
                targetRoleLevel = level;
            }
        }

        if (targetRoleLevel) {
            const targetRoleId = levelRoles[targetRoleLevel.toString()];
            const targetRole = guild.roles.cache.get(targetRoleId);

            // Assign Embed Permissions (level 2) if they're level 2+
            if (userLevel >= 2 && embedPermissionsRoleId && !member.roles.cache.has(embedPermissionsRoleId)) {
                const embedRole = guild.roles.cache.get(embedPermissionsRoleId);
                if (embedRole) {
                    try {
                        await member.roles.add(embedRole);
                        console.log(`Assigned Embed Permissions role to ${member.user.tag}`);
                    } catch (error) {
                        console.error(`Failed to assign Embed Permissions role to ${member.user.tag}: ${error.message}`);
                    }
                }
            }

            // Assign level 10 if level 10+
            if (userLevel >= 10 && level10RoleId && !member.roles.cache.has(level10RoleId)) {
                const level10Role = guild.roles.cache.get(level10RoleId);
                if (level10Role) {
                    try {
                        await member.roles.add(level10Role);
                        console.log(`Assigned level 10 role to ${member.user.tag}`);
                    } catch (error) {
                        console.error(`Failed to assign level 10 role to ${member.user.tag}: ${error.message}`);
                    }
                }
            }

            // Assign the target role if they don't have it
            if (targetRole && !member.roles.cache.has(targetRoleId)) {
                try {
                    await member.roles.add(targetRole);
                    console.log(`Assigned role "${targetRole.name}" to ${member.user.tag} for level ${userLevel}`);
                } catch (error) {
                    console.error(`Failed to assign role "${targetRole.name}" to ${member.user.tag}: ${error.message}`);
                }
            }

            // Remove all level roles EXCEPT keep forever and the current target
            for (const [level, roleId] of Object.entries(levelRoles)) {
                if (!keepForever.includes(roleId) && roleId !== targetRoleId && member.roles.cache.has(roleId)) {
                    const oldRole = guild.roles.cache.get(roleId);
                    if (oldRole) {
                        try {
                            await member.roles.remove(oldRole);
                            console.log(`Removed old level role "${oldRole.name}" from ${member.user.tag}`);
                        } catch (error) {
                            console.error(`Failed to remove old level role "${oldRole.name}" from ${member.user.tag}: ${error.message}`);
                        }
                    }
                }
            }
        }

        // Handle newcomer role
        console.log(`  - Level: ${userLevel}, Has newcomer role: ${member.roles.cache.has(newcomerRoleId)}, Newcomer ID: ${newcomerRoleId}`);
        if (userLevel < 2) {
            if (newcomerRoleId && !member.roles.cache.has(newcomerRoleId)) {
                try {
                    await member.roles.add(newcomerRoleId);
                    console.log(`✅ Assigned newcomer role to ${member.user.tag}`);
                } catch (error) {
                    console.error(`Failed to assign newcomer role to ${member.user.tag}: ${error.message}`);
                }
            }
        } else if (userLevel >= 2) {
            if (newcomerRoleId && member.roles.cache.has(newcomerRoleId)) {
                const newcomerRole = guild.roles.cache.get(newcomerRoleId);
                if (newcomerRole) {
                    try {
                        await member.roles.remove(newcomerRole);
                        console.log(`🗑️  Removed newcomer role from ${member.user.tag}`);
                    } catch (error) {
                        console.error(`Failed to remove newcomer role from ${member.user.tag}: ${error.message}`);
                    }
                }
            }
        }
    }

    console.log('Role fixing complete.');
    client.destroy();
});

client.login(process.env.DISCORD_TOKEN);