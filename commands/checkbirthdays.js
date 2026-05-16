const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const getConfig = require('../configHelper');

const birthdayDataPath = path.join(__dirname, '../data/birthdayData.json');

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkbirthdays')
        .setDescription('Manually check and process birthdays'),
    async execute(interaction) {
        const config = getConfig(interaction.guild.id);
        // Check privileged executor permission
        if (!config.isPrivilegedExecutor(interaction.member)) {
            await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            const birthdayData = loadBirthdayData();
            const guildBirthdayData = getBirthdaysForGuild(birthdayData, interaction.guild.id);
            if (Object.keys(guildBirthdayData).length === 0) {
                await interaction.editReply({ content: '❌ No birthday data found.' });
                return;
            }
            
            if (!config.roles.birthday) {
                await interaction.editReply({ content: '❌ Birthday role not configured in config.json' });
                return;
            }
            
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentDay = now.getDate();
            
            let processedCount = 0;
            let birthdayCount = 0;
            
            const birthdayRole = interaction.guild.roles.cache.get(config.roles.birthday);
            if (!birthdayRole) {
                await interaction.editReply({ content: '❌ Birthday role not found in this server!' });
                return;
            }
            
            // Check if bot can manage the role
            const botMember = await interaction.guild.members.fetchMe();
            if (birthdayRole.position >= botMember.roles.highest.position) {
                await interaction.editReply({ 
                    content: '❌ The birthday role is positioned higher than my highest role! Please move my role above the birthday role in Server Settings → Roles.' 
                });
                return;
            }
            
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                await interaction.editReply({ content: '❌ I don\'t have "Manage Roles" permission!' });
                return;
            }
            
            for (const [userId, birthdayInfo] of Object.entries(guildBirthdayData)) {
                try {
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    if (!member) continue;
                    
                    processedCount++;
                    const isBirthday = birthdayInfo.month === currentMonth && birthdayInfo.day === currentDay;
                    const hasBirthdayRole = member.roles.cache.has(config.roles.birthday);
                    
                    if (isBirthday) {
                        birthdayCount++; // Count all birthdays today
                        
                        if (!hasBirthdayRole) {
                            await member.roles.add(birthdayRole);
                            
                            // Send congratulations
                            if (config.channels.birthday) {
                                const channel = interaction.guild.channels.cache.get(config.channels.birthday);
                                if (channel) {
                                    await channel.send(`🎉🎂 Happy Birthday <@${userId}>! 🎂🎉\n\nEnjoy your special day and your birthday role! 🎈`);
                                }
                            }
                        }
                    } else if (!isBirthday && hasBirthdayRole) {
                        await member.roles.remove(birthdayRole);
                    }
                } catch (error) {
                    console.error(`Error processing birthday for user ${userId}:`, error.message);
                }
            }
            
            await interaction.editReply({ 
                content: `✅ Birthday check complete!\n📋 Checked ${processedCount} users\n🎂 ${birthdayCount} birthday(s) today!` 
            });
        } catch (error) {
            console.error('Error checking birthdays:', error);
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
        }
    }
};
