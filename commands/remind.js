const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const remindersPath = path.join(__dirname, '../data/reminders.json');

// Parse time string with support for multiple formats
function parseTime(timeString) {
    const input = timeString.toLowerCase().trim();
    const now = new Date();
    
    // Format 1: Simple duration (10m, 2h, 1d)
    const simpleDuration = /^(\d+)([smhd])$/;
    const simpleMatch = input.match(simpleDuration);
    if (simpleMatch) {
        const value = parseInt(simpleMatch[1]);
        const unit = simpleMatch[2];
        const multipliers = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };
        return now.getTime() + (value * multipliers[unit]);
    }
    
    // Format 2: "in X minutes/hours/days"
    const inPattern = /^in (\d+) (second|minute|hour|day|week)s?$/;
    const inMatch = input.match(inPattern);
    if (inMatch) {
        const value = parseInt(inMatch[1]);
        const unit = inMatch[2];
        const multipliers = {
            'second': 1000,
            'minute': 60 * 1000,
            'hour': 60 * 60 * 1000,
            'day': 24 * 60 * 60 * 1000,
            'week': 7 * 24 * 60 * 60 * 1000
        };
        return now.getTime() + (value * multipliers[unit]);
    }
    
    // Format 3: "at HH:MM" or "at H:MM am/pm" (today or tomorrow if time passed)
    const atTimePattern = /^at (\d{1,2}):(\d{2})\s?(am|pm)?$/;
    const atMatch = input.match(atTimePattern);
    if (atMatch) {
        let hours = parseInt(atMatch[1]);
        const minutes = parseInt(atMatch[2]);
        const meridiem = atMatch[3];
        
        if (meridiem) {
            if (meridiem === 'pm' && hours !== 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;
        }
        
        const target = new Date(now);
        target.setHours(hours, minutes, 0, 0);
        
        // If time has passed today, set for tomorrow
        if (target <= now) {
            target.setDate(target.getDate() + 1);
        }
        
        return target.getTime();
    }
    
    // Format 4: "tomorrow at HH:MM am/pm"
    const tomorrowPattern = /^tomorrow at (\d{1,2}):(\d{2})\s?(am|pm)?$/;
    const tomorrowMatch = input.match(tomorrowPattern);
    if (tomorrowMatch) {
        let hours = parseInt(tomorrowMatch[1]);
        const minutes = parseInt(tomorrowMatch[2]);
        const meridiem = tomorrowMatch[3];
        
        if (meridiem) {
            if (meridiem === 'pm' && hours !== 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;
        }
        
        const target = new Date(now);
        target.setDate(target.getDate() + 1);
        target.setHours(hours, minutes, 0, 0);
        
        return target.getTime();
    }
    
    // Format 5: "today at HH:MM am/pm"
    const todayPattern = /^today at (\d{1,2}):(\d{2})\s?(am|pm)?$/;
    const todayMatch = input.match(todayPattern);
    if (todayMatch) {
        let hours = parseInt(todayMatch[1]);
        const minutes = parseInt(todayMatch[2]);
        const meridiem = todayMatch[3];
        
        if (meridiem) {
            if (meridiem === 'pm' && hours !== 12) hours += 12;
            if (meridiem === 'am' && hours === 12) hours = 0;
        }
        
        const target = new Date(now);
        target.setHours(hours, minutes, 0, 0);
        
        if (target <= now) {
            return null; // Time has already passed today
        }
        
        return target.getTime();
    }
    
    // Format 6: "in X" - shorthand for minutes
    const inShortPattern = /^in (\d+)$/;
    const inShortMatch = input.match(inShortPattern);
    if (inShortMatch) {
        const minutes = parseInt(inShortMatch[1]);
        return now.getTime() + (minutes * 60 * 1000);
    }
    
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('When to remind (e.g., "in 30 minutes", "at 3pm", "tomorrow at 2pm", "10m")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('What to remind you about')
                .setRequired(true)),
    
    async execute(interaction) {
        const timeString = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        
        // Parse time
        const triggerTime = parseTime(timeString);
        
        if (!triggerTime) {
            return interaction.reply({
                content: '❌ Invalid time format. Examples:\n' +
                         '• `10m`, `2h`, `1d` (duration)\n' +
                         '• `in 30 minutes`, `in 2 hours`\n' +
                         '• `at 3pm`, `at 15:00`\n' +
                         '• `tomorrow at 2pm`\n' +
                         '• `today at 5:30pm`',
                ephemeral: true
            });
        }
        
        const durationMs = triggerTime - Date.now();
        
        // Maximum 30 days
        const maxDuration = 30 * 24 * 60 * 60 * 1000;
        if (durationMs > maxDuration) {
            return interaction.reply({
                content: '❌ Duration cannot exceed 30 days.',
                ephemeral: true
            });
        }
        
        // Minimum 10 seconds
        if (durationMs < 10000) {
            return interaction.reply({
                content: '❌ Reminder must be at least 10 seconds in the future.',
                ephemeral: true
            });
        }
        
        // Load existing reminders
        let reminders = [];
        try {
            if (fs.existsSync(remindersPath)) {
                reminders = JSON.parse(fs.readFileSync(remindersPath, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading reminders:', error);
        }
        
        // Add new reminder
        const reminder = {
            id: `${interaction.user.id}_${Date.now()}`,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            guildId: interaction.guildId,
            message: message,
            triggerTime: triggerTime,
            createdAt: Date.now()
        };
        
        reminders.push(reminder);
        
        // Save reminders
        try {
            fs.writeFileSync(remindersPath, JSON.stringify(reminders, null, 2));
        } catch (error) {
            console.error('Error saving reminder:', error);
            return interaction.reply({
                content: '❌ Failed to save reminder.',
                ephemeral: true
            });
        }
        
        // Schedule the reminder
        const timeoutMs = triggerTime - Date.now();
        scheduleReminder(interaction.client, reminder, timeoutMs);
        
        const triggerTimestamp = Math.floor(triggerTime / 1000);
        await interaction.reply({
            content: `✅ Reminder set!\n**Message:** "${message}"\n**Time:** <t:${triggerTimestamp}:F> (<t:${triggerTimestamp}:R>)`,
            ephemeral: true
        });
    }
};

// Schedule a reminder
function scheduleReminder(client, reminder, delayMs) {
    // Cap at maximum safe timeout (about 24.8 days)
    const maxTimeout = 2147483647;
    
    if (delayMs > maxTimeout) {
        // For longer delays, check periodically
        setTimeout(() => {
            const remainingTime = reminder.triggerTime - Date.now();
            if (remainingTime > 0) {
                scheduleReminder(client, reminder, remainingTime);
            }
        }, maxTimeout);
        return;
    }
    
    setTimeout(async () => {
        await triggerReminder(client, reminder);
    }, delayMs);
}

// Trigger a reminder
async function triggerReminder(client, reminder) {
    try {
        const user = await client.users.fetch(reminder.userId);
        
        // Try to DM the user
        try {
            await user.send({
                content: `⏰ **Reminder:** ${reminder.message}\n\nSet <t:${Math.floor(reminder.createdAt / 1000)}:R> in <#${reminder.channelId}>`
            });
        } catch (dmError) {
            // If DM fails, try to send in the original channel
            console.log(`Could not DM user ${reminder.userId}, trying channel`);
            try {
                const channel = await client.channels.fetch(reminder.channelId);
                if (channel && channel.isTextBased()) {
                    await channel.send({
                        content: `⏰ <@${reminder.userId}> **Reminder:** ${reminder.message}`
                    });
                }
            } catch (channelError) {
                console.error('Could not send reminder to channel:', channelError);
            }
        }
    } catch (error) {
        console.error('Error triggering reminder:', error);
    }
    
    // Remove the reminder from storage
    removeReminder(reminder.id);
}

// Remove a reminder from storage
function removeReminder(reminderId) {
    try {
        let reminders = [];
        if (fs.existsSync(remindersPath)) {
            reminders = JSON.parse(fs.readFileSync(remindersPath, 'utf8'));
        }
        
        reminders = reminders.filter(r => r.id !== reminderId);
        fs.writeFileSync(remindersPath, JSON.stringify(reminders, null, 2));
    } catch (error) {
        console.error('Error removing reminder:', error);
    }
}

// Export functions for use in main bot file
module.exports.scheduleReminder = scheduleReminder;
module.exports.triggerReminder = triggerReminder;
