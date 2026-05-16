const { Events, EmbedBuilder, AttachmentBuilder, Colors, time, TimestampStyles } = require('discord.js');
const getConfig = require('../configHelper');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Cache for storing previous message states for comparison
const messageCache = new Map();
const MAX_EMBED_FIELD_LENGTH = 1024;

function normalizeMessageContent(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\u200b/g, '').trim();
}

function truncateEmbedField(value) {
    if (!value) return value;
    return value.length > MAX_EMBED_FIELD_LENGTH ? `${value.substring(0, MAX_EMBED_FIELD_LENGTH - 3)}...` : value;
}

function getMessageAttachmentArray(message, cachedMessage) {
    if (Array.isArray(cachedMessage?.attachments) && cachedMessage.attachments.length > 0) {
        return cachedMessage.attachments;
    }

    return Array.from(message.attachments?.values() || []).map(attachment => ({
        url: attachment.url,
        name: attachment.name,
        size: attachment.size,
        contentType: attachment.contentType
    }));
}

function register(client) {
    // Channel Events
    client.on(Events.ChannelCreate, handleChannelCreate);
    client.on(Events.ChannelDelete, handleChannelDelete);
    client.on(Events.ChannelUpdate, handleChannelUpdate);

    // Role Events
    client.on(Events.GuildRoleCreate, handleRoleCreate);
    client.on(Events.GuildRoleDelete, handleRoleDelete);
    client.on(Events.GuildRoleUpdate, handleRoleUpdate);

    // Message Events (for edits, deletions, and bulk deletions)
    client.on(Events.MessageUpdate, handleMessageUpdate);
    client.on(Events.MessageDelete, handleMessageDelete);
    client.on(Events.MessageBulkDelete, handleMessageBulkDelete);

    // Member Events (joins, leaves, updates)
    client.on(Events.GuildMemberAdd, handleMemberAdd);
    client.on(Events.GuildMemberRemove, handleMemberRemove);

    // Member Events
    client.on(Events.GuildMemberUpdate, handleMemberUpdate);

    // Voice Events
    client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

    // Moderation Events
    client.on(Events.GuildBanAdd, handleBanAdd);
    client.on(Events.GuildBanRemove, handleBanRemove);

    // Emoji Events
    client.on(Events.GuildEmojiCreate, handleEmojiCreate);
    client.on(Events.GuildEmojiDelete, handleEmojiDelete);
    client.on(Events.GuildEmojiUpdate, handleEmojiUpdate);

    console.log('Server Logger feature registered');
}

function getGuildConfig(guild) {
    if (!guild?.id) return {};

    try {
        return getConfig(guild.id) || {};
    } catch (error) {
        console.error(`Error loading config for guild ${guild.id}:`, error);
        return {};
    }
}

// Utility function to send log to configured channel
async function sendLog(guild, embed, attachment = null, channelType = 'serverLogs') {
    const config = getGuildConfig(guild);

    // Check if logging is enabled
    if (!config.features?.serverLogger?.enabled) return;
    
    const channelId = config.channels?.[channelType];
    if (!channelId) return;

    const logChannel = guild.channels.cache.get(channelId);
    if (!logChannel) return;

    try {
        const messageData = { embeds: [embed] };
        if (attachment) {
            messageData.files = [attachment];
        }
        await logChannel.send(messageData);
    } catch (error) {
        console.error('Error sending server log:', error);
    }
}

// Utility function to get channel type name
function getChannelTypeName(type) {
    const types = {
        0: 'Text Channel',
        1: 'DM',
        2: 'Voice Channel',
        3: 'Group DM',
        4: 'Category',
        5: 'Announcement Channel',
        10: 'Announcement Thread',
        11: 'Public Thread',
        12: 'Private Thread',
        13: 'Stage Channel',
        14: 'Directory',
        15: 'Forum Channel'
    };
    return types[type] || 'Unknown';
}

// Utility function to format permission changes
function formatPermissionChanges(oldPerms, newPerms) {
    const changes = [];
    const allPerms = new Set([...oldPerms.toArray(), ...newPerms.toArray()]);

    for (const perm of allPerms) {
        const hadPerm = oldPerms.has(perm);
        const hasPerm = newPerms.has(perm);

        if (hadPerm && !hasPerm) {
            changes.push(`❌ ${perm}`);
        } else if (!hadPerm && hasPerm) {
            changes.push(`✅ ${perm}`);
        }
    }

    return changes.length > 0 ? changes.join('\n') : 'No permission changes';
}

// Utility function to download image from URL
function downloadImage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

// CHANNEL EVENT HANDLERS
async function handleChannelCreate(channel) {
    const config = getGuildConfig(channel.guild);
    if (!config.features?.serverLogger?.logChannelEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('📺 Channel Created')
        .setColor(Colors.Green)
        .addFields(
            { name: 'Channel', value: `${channel}`, inline: true },
            { name: 'Type', value: getChannelTypeName(channel.type), inline: true },
            { name: 'ID', value: channel.id, inline: true },
            { name: 'Category', value: channel.parent?.name || 'None', inline: true },
            { name: 'Position', value: channel.position?.toString() || 'N/A', inline: true }
        )
        .setTimestamp();

    if (channel.topic) {
        embed.addFields({ name: 'Topic', value: channel.topic.length > 1024 ? channel.topic.substring(0, 1021) + '...' : channel.topic });
    }

    await sendLog(channel.guild, embed);
}

async function handleChannelDelete(channel) {
    const config = getGuildConfig(channel.guild);
    if (!config.features?.serverLogger?.logChannelEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Channel Deleted')
        .setColor(Colors.Red)
        .addFields(
            { name: 'Channel Name', value: channel.name, inline: true },
            { name: 'Type', value: getChannelTypeName(channel.type), inline: true },
            { name: 'ID', value: channel.id, inline: true },
            { name: 'Category', value: channel.parent?.name || 'None', inline: true }
        )
        .setTimestamp();

    if (channel.topic) {
        embed.addFields({ name: 'Topic', value: channel.topic.length > 1024 ? channel.topic.substring(0, 1021) + '...' : channel.topic });
    }

    await sendLog(channel.guild, embed);
}

async function handleChannelUpdate(oldChannel, newChannel) {
    const config = getGuildConfig(newChannel.guild || oldChannel.guild);
    if (!config.features?.serverLogger?.logChannelEvents) return;

    const changes = [];
    const embed = new EmbedBuilder()
        .setTitle('📝 Channel Updated')
        .setColor(Colors.Orange)
        .addFields(
            { name: 'Channel', value: `${newChannel}`, inline: true },
            { name: 'ID', value: newChannel.id, inline: true }
        )
        .setTimestamp();

    // Name change
    if (oldChannel.name !== newChannel.name) {
        changes.push(`**Name:** ${oldChannel.name} → ${newChannel.name}`);
    }

    // Topic change
    if (oldChannel.topic !== newChannel.topic) {
        const oldTopic = oldChannel.topic || '*No topic*';
        const newTopic = newChannel.topic || '*No topic*';
        changes.push(`**Topic:** ${oldTopic} → ${newTopic}`);
    }

    // NSFW change
    if (oldChannel.nsfw !== newChannel.nsfw) {
        changes.push(`**NSFW:** ${oldChannel.nsfw} → ${newChannel.nsfw}`);
    }

    // Slowmode change
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.push(`**Slowmode:** ${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`);
    }

    // Position change
    if (oldChannel.position !== newChannel.position) {
        changes.push(`**Position:** ${oldChannel.position} → ${newChannel.position}`);
    }

    // Permission overwrites change
    if (JSON.stringify(oldChannel.permissionOverwrites.cache) !== JSON.stringify(newChannel.permissionOverwrites.cache)) {
        changes.push('**Permission overwrites were modified**');
    }

    if (changes.length > 0) {
        embed.addFields({ name: 'Changes', value: changes.join('\n') });
        await sendLog(newChannel.guild, embed);
    }
}

// ROLE EVENT HANDLERS
async function handleRoleCreate(role) {
    const config = getGuildConfig(role.guild);
    if (!config.features?.serverLogger?.logRoleEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('👤 Role Created')
        .setColor(role.color || Colors.Blue)
        .addFields(
            { name: 'Role', value: `${role}`, inline: true },
            { name: 'ID', value: role.id, inline: true },
            { name: 'Color', value: `[${role.hexColor}](https://www.colorhexa.com/${role.hexColor.replace('#', '')})`, inline: true },
            { name: 'Position', value: role.position.toString(), inline: true },
            { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
            { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true }
        )
        .setTimestamp();

    // Try to fetch audit log to get executor
    try {
        const auditLogs = await role.guild.fetchAuditLogs({
            type: 30, // ROLE_CREATE
            limit: 1
        });
        const logEntry = auditLogs.entries.first();
        if (logEntry && logEntry.targetId === role.id && Date.now() - logEntry.createdTimestamp < 5000) {
            embed.setAuthor({
                name: `${logEntry.executor.tag}`,
                iconURL: logEntry.executor.displayAvatarURL()
            });
        }
    } catch (error) {
        // Ignore audit log errors
    }

    if (role.permissions.toArray().length > 0) {
        embed.addFields({ name: 'Permissions', value: role.permissions.toArray().join(', ') });
    }

    await sendLog(role.guild, embed);
}

async function handleRoleDelete(role) {
    const config = getGuildConfig(role.guild);
    if (!config.features?.serverLogger?.logRoleEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Role Deleted')
        .setColor(Colors.Red)
        .addFields(
            { name: 'Role Name', value: role.name, inline: true },
            { name: 'ID', value: role.id, inline: true },
            { name: 'Color', value: `[${role.hexColor}](https://www.colorhexa.com/${role.hexColor.replace('#', '')})`, inline: true },
            { name: 'Position', value: role.position.toString(), inline: true }
        )
        .setTimestamp();

    // Try to fetch audit log to get executor
    try {
        const auditLogs = await role.guild.fetchAuditLogs({
            type: 32, // ROLE_DELETE
            limit: 1
        });
        const logEntry = auditLogs.entries.first();
        if (logEntry && logEntry.targetId === role.id && Date.now() - logEntry.createdTimestamp < 5000) {
            embed.setAuthor({
                name: `${logEntry.executor.tag}`,
                iconURL: logEntry.executor.displayAvatarURL()
            });
        }
    } catch (error) {
        // Ignore audit log errors
    }

    await sendLog(role.guild, embed, null, 'roleLogs');
}

async function handleRoleUpdate(oldRole, newRole) {
    const config = getGuildConfig(newRole.guild || oldRole.guild);
    if (!config.features?.serverLogger?.logRoleEvents) return;

    const changes = [];
    const embed = new EmbedBuilder()
        .setTitle('📝 Role Updated')
        .setColor(newRole.color || Colors.Orange)
        .addFields(
            { name: 'Role', value: `${newRole}`, inline: true },
            { name: 'ID', value: newRole.id, inline: true }
        )
        .setTimestamp();

    // Try to fetch audit log to get executor
    try {
        const auditLogs = await newRole.guild.fetchAuditLogs({
            type: 31, // ROLE_UPDATE
            limit: 1
        });
        const logEntry = auditLogs.entries.first();
        if (logEntry && logEntry.targetId === newRole.id && Date.now() - logEntry.createdTimestamp < 5000) {
            embed.setAuthor({
                name: `${logEntry.executor.tag}`,
                iconURL: logEntry.executor.displayAvatarURL()
            });
        }
    } catch (error) {
        // Ignore audit log errors
    }

    // Name change
    if (oldRole.name !== newRole.name) {
        changes.push(`**Name:** ${oldRole.name} → ${newRole.name}`);
    }

    // Color change
    if (oldRole.color !== newRole.color) {
        const oldColorLink = `[${oldRole.hexColor}](https://www.colorhexa.com/${oldRole.hexColor.replace('#', '')})`;
        const newColorLink = `[${newRole.hexColor}](https://www.colorhexa.com/${newRole.hexColor.replace('#', '')})`;
        changes.push(`**Color:** ${oldColorLink} → ${newColorLink}`);
    }

    // Mentionable change
    if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(`**Mentionable:** ${oldRole.mentionable} → ${newRole.mentionable}`);
    }

    // Hoisted change
    if (oldRole.hoist !== newRole.hoist) {
        changes.push(`**Hoisted:** ${oldRole.hoist} → ${newRole.hoist}`);
    }

    // Position change
    if (oldRole.position !== newRole.position) {
        changes.push(`**Position:** ${oldRole.position} → ${newRole.position}`);
    }

    // Permission changes
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        const permChanges = formatPermissionChanges(oldRole.permissions, newRole.permissions);
        if (permChanges !== 'No permission changes') {
            changes.push(`**Permissions:**\n${permChanges}`);
        }
    }

    if (changes.length > 0) {
        embed.addFields({ name: 'Changes', value: changes.join('\n') });
        await sendLog(newRole.guild, embed, null, 'roleLogs');
    }
}

// MESSAGE EVENT HANDLERS (for edits and image edits)
async function handleMessageUpdate(oldMessage, newMessage) {
    const config = getGuildConfig(newMessage.guild || oldMessage.guild);
    if (!config.features?.serverLogger?.logMessageEvents && !config.features?.serverLogger?.logImageEdits) return;
    
    // Fetch partial messages if needed
    if (oldMessage.partial) {
        try {
            await oldMessage.fetch();
        } catch (error) {
            console.error('Error fetching old message:', error);
            return;
        }
    }
    
    if (newMessage.partial) {
        try {
            await newMessage.fetch();
        } catch (error) {
            console.error('Error fetching new message:', error);
            return;
        }
    }
    
    if (config.features?.serverLogger?.ignoreBots && (oldMessage.author?.bot || newMessage.author?.bot)) return;

    // Cache the message for potential deletion
    messageCache.set(oldMessage.id, {
        content: oldMessage.content,
        attachments: oldMessage.attachments.map(a => ({ 
            url: a.url, 
            name: a.name, 
            size: a.size,
            contentType: a.contentType 
        })),
        timestamp: oldMessage.createdTimestamp
    });

    // Check for content changes
    const contentChanged = oldMessage.content !== newMessage.content;
    
    // Check for image/attachment changes
    const oldImages = oldMessage.attachments.filter(a => a.contentType?.startsWith('image/'));
    const newImages = newMessage.attachments.filter(a => a.contentType?.startsWith('image/'));
    const imagesChanged = oldImages.size !== newImages.size || oldImages.some(oldImg => !newImages.some(newImg => newImg.url === oldImg.url));

    // Log content edits (if enabled)
    if (contentChanged && config.features?.serverLogger?.logMessageEvents && oldMessage.content && newMessage.content) {
        const embed = new EmbedBuilder()
            .setTitle('✏️ Message Edited')
            .setColor(Colors.Yellow)
            .setAuthor({ 
                name: newMessage.author?.tag || 'Unknown User', 
                iconURL: newMessage.author?.displayAvatarURL() 
            })
            .addFields(
                { name: 'Channel', value: `${newMessage.channel}`, inline: true },
                { name: 'Message ID', value: newMessage.id, inline: true },
                { name: 'Jump to Message', value: `[Click here](${newMessage.url})`, inline: true }
            )
            .setTimestamp();

        // Show before/after content
        if (oldMessage.content) {
            embed.addFields({
                name: 'Before',
                value: oldMessage.content.length > 1024 ? oldMessage.content.substring(0, 1021) + '...' : oldMessage.content,
                inline: false
            });
        }

        if (newMessage.content) {
            embed.addFields({
                name: 'After',
                value: newMessage.content.length > 1024 ? newMessage.content.substring(0, 1021) + '...' : newMessage.content,
                inline: false
            });
        }

        await sendLog(newMessage.guild, embed, null, 'messageLogs');
    }

    // Log image edits (if enabled and images changed)
    if (imagesChanged && config.features?.serverLogger?.logImageEdits && (oldImages.size > 0 || newImages.size > 0)) {
        const embed = new EmbedBuilder()
            .setTitle('🖼️ Message Images Edited')
            .setColor(Colors.Yellow)
            .setAuthor({ 
                name: newMessage.author?.tag || 'Unknown User', 
                iconURL: newMessage.author?.displayAvatarURL() 
            })
            .addFields(
                { name: 'Channel', value: `${newMessage.channel}`, inline: true },
                { name: 'Message ID', value: newMessage.id, inline: true },
                { name: 'Jump to Message', value: `[Click here](${newMessage.url})`, inline: true }
            )
            .setTimestamp();

        if (newMessage.content) {
            embed.addFields({
                name: 'Message Content',
                value: newMessage.content.length > 1024 ? newMessage.content.substring(0, 1021) + '...' : newMessage.content
            });
        }

        // Add image info
        const oldImageList = oldImages.map(a => `[${a.name}](${a.url})`).join('\n') || 'None';
        const newImageList = newImages.map(a => `[${a.name}](${a.url})`).join('\n') || 'None';

        embed.addFields(
            { name: 'Images Before', value: oldImageList.length > 1024 ? oldImageList.substring(0, 1021) + '...' : oldImageList, inline: true },
            { name: 'Images After', value: newImageList.length > 1024 ? newImageList.substring(0, 1021) + '...' : newImageList, inline: true }
        );

        await sendLog(newMessage.guild, embed, null, 'messageLogs');
    }
}

// MESSAGE DELETE HANDLER
async function handleMessageDelete(message) {
    if (!message.guild) return;

    const config = getGuildConfig(message.guild);
    if (!config.features?.serverLogger?.logMessageEvents) return;
    if (config.features?.serverLogger?.ignoreBots && message.author?.bot) return;

    // Skip Discord system messages and low-information partials that produce noisy logs.
    if (message.system) return;

    if (message.partial) {
        try {
            await message.fetch();
        } catch {
            // Continue using whatever data we already have.
        }
    }

    // Try to get cached message content if available
    const cachedMessage = messageCache.get(message.id);
    const attachments = getMessageAttachmentArray(message, cachedMessage);
    const content = normalizeMessageContent(cachedMessage?.content ?? message.content);
    const hasEmbeds = (message.embeds?.length || 0) > 0;
    const hasStickers = (message.stickers?.size || 0) > 0;
    const hasAuthor = Boolean(message.author);

    // Avoid sending meaningless logs with no author and no useful payload.
    if (!hasAuthor && !content && attachments.length === 0 && !hasEmbeds && !hasStickers) {
        messageCache.delete(message.id);
        return;
    }

    const authorName = message.author?.tag || message.author?.username || 'Unknown User';
    const authorAvatar = message.author?.displayAvatarURL();
    const channelValue = message.channel ? `${message.channel}` : 'Unknown Channel';
    
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Message Deleted')
        .setColor(Colors.Red)
        .setAuthor({ 
            name: authorName,
            iconURL: authorAvatar
        })
        .addFields(
            { name: 'Channel', value: channelValue, inline: true },
            { name: 'Message ID', value: message.id, inline: true }
        )
        .setTimestamp();

    // Add message content if available
    if (content) {
        embed.addFields({
            name: 'Content',
            value: truncateEmbedField(content)
        });
    } else if (hasEmbeds || hasStickers) {
        const summary = [
            hasEmbeds ? `Embeds: ${message.embeds.length}` : null,
            hasStickers ? `Stickers: ${message.stickers.size}` : null
        ].filter(Boolean).join(' • ');

        embed.addFields({
            name: 'Content',
            value: summary || 'No text content'
        });
    }

    // Handle image attachments - download and attach them to the log
    let imageAttachment = null;
    
    if (attachments && attachments.length > 0) {
        const imageAttachments = attachments.filter(a => 
            a.url && (a.url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || a.contentType?.startsWith('image/'))
        );
        
        // If there are images, try to download the first one
        if (imageAttachments.length > 0) {
            try {
                const imageUrl = imageAttachments[0].url;
                const imageBuffer = await downloadImage(imageUrl);
                const fileName = imageAttachments[0].name || `deleted_image_${message.id}.png`;
                
                imageAttachment = new AttachmentBuilder(imageBuffer, { name: fileName });
                embed.setImage(`attachment://${fileName}`);
                
                // List all images
                if (imageAttachments.length > 1) {
                    const imageList = imageAttachments.map((a, i) => 
                        `${i + 1}. ${a.name || 'Unknown'} (${a.size ? (a.size / 1024).toFixed(2) + ' KB' : 'Unknown size'})`
                    ).join('\n');
                    embed.addFields({
                        name: `🖼️ Images (${imageAttachments.length})`,
                        value: truncateEmbedField(imageList)
                    });
                }
            } catch (error) {
                console.error('Error downloading deleted image:', error);
                // Fall back to showing links
                const attachmentList = attachments
                    .map(a => `[${a.name || 'attachment'}](${a.url})`)
                    .join('\n');
                embed.addFields({
                    name: 'Attachments',
                    value: truncateEmbedField(attachmentList)
                });
            }
        } else {
            // Non-image attachments
            const attachmentList = attachments
                .map(a => `[${a.name || 'attachment'}](${a.url})`)
                .join('\n');
            embed.addFields({
                name: 'Attachments',
                value: truncateEmbedField(attachmentList)
            });
        }
    }

    await sendLog(message.guild, embed, imageAttachment, 'messageLogs');

    // Clean up cache
    messageCache.delete(message.id);
}

// MESSAGE BULK DELETE HANDLER
async function handleMessageBulkDelete(messages, channel) {
    const config = getGuildConfig(channel.guild);
    if (!config.features?.serverLogger?.logMessageEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Bulk Messages Deleted')
        .setColor(Colors.Red)
        .addFields(
            { name: 'Channel', value: `${channel}`, inline: true },
            { name: 'Messages Deleted', value: messages.size.toString(), inline: true },
            { name: 'Time', value: time(Math.floor(Date.now() / 1000), TimestampStyles.RelativeTime), inline: true }
        )
        .setTimestamp();

    // Add some message details if we have cached content
    const cachedMessages = [];
    for (const message of messages.values()) {
        if (config.features?.serverLogger?.ignoreBots && message.author?.bot) continue;
        
        const cached = messageCache.get(message.id);
        if (cached?.content) {
            cachedMessages.push(`**${message.author?.tag || 'Unknown'}:** ${cached.content.substring(0, 100)}${cached.content.length > 100 ? '...' : ''}`);
        }
        
        // Clean up cache
        messageCache.delete(message.id);
    }

    if (cachedMessages.length > 0) {
        const sampleMessages = cachedMessages.slice(0, 5).join('\n');
        embed.addFields({
            name: 'Sample Deleted Messages',
            value: sampleMessages.length > 1024 ? sampleMessages.substring(0, 1021) + '...' : sampleMessages
        });
    }

    await sendLog(channel.guild, embed, null, 'messageLogs');
}

// MEMBER JOIN/LEAVE HANDLERS
async function handleMemberAdd(member) {
    const config = getGuildConfig(member.guild);
    if (!config.features?.serverLogger?.logMemberEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('👋 Member Joined')
        .setColor(Colors.Green)
        .addFields(
            { name: 'Member', value: `${member.user}`, inline: true },
            { name: 'ID', value: member.user.id, inline: true },
            { name: 'Account Created', value: time(Math.floor(member.user.createdTimestamp / 1000), TimestampStyles.RelativeTime), inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    await sendLog(member.guild, embed);
}

async function handleMemberRemove(member) {
    const config = getGuildConfig(member.guild);
    if (!config.features?.serverLogger?.logMemberEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('👢 Member Left')
        .setColor(Colors.Orange)
        .addFields(
            { name: 'Member', value: `${member.user}`, inline: true },
            { name: 'ID', value: member.user.id, inline: true },
            { name: 'Joined Server', value: member.joinedAt ? time(Math.floor(member.joinedAt.getTime() / 1000), TimestampStyles.RelativeTime) : 'Unknown', inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    // Check if they were kicked or left voluntarily by checking audit logs
    try {
        const auditLogs = await member.guild.fetchAuditLogs({
            type: 20, // MEMBER_KICK
            limit: 1
        });

        const kickLog = auditLogs.entries.first();
        if (kickLog && kickLog.target.id === member.id && 
            Date.now() - kickLog.createdTimestamp < 5000) { // Within last 5 seconds
            embed.setTitle('👢 Member Kicked');
            embed.setColor(Colors.Red);
            embed.addFields({ name: 'Kicked By', value: `${kickLog.executor}`, inline: true });
            if (kickLog.reason) {
                embed.addFields({ name: 'Reason', value: kickLog.reason });
            }
        }
    } catch (error) {
        // Ignore audit log errors
    }

    await sendLog(member.guild, embed);
}

// MEMBER UPDATE HANDLER
async function handleMemberUpdate(oldMember, newMember) {
    const config = getGuildConfig(newMember.guild || oldMember.guild);
    if (!config.features?.serverLogger?.logMemberEvents) return;

    const changes = [];
    const embed = new EmbedBuilder()
        .setTitle('👤 Member Updated')
        .setColor(Colors.Purple)
        .addFields(
            { name: 'Member', value: `${newMember.user}`, inline: true },
            { name: 'ID', value: newMember.user.id, inline: true }
        )
        .setTimestamp();

    // Nickname change
    if (oldMember.nickname !== newMember.nickname) {
        const oldNick = oldMember.nickname || oldMember.user.username;
        const newNick = newMember.nickname || newMember.user.username;
        changes.push(`**Nickname:** ${oldNick} → ${newNick}`);
    }

    // Role changes
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

    if (addedRoles.size > 0) {
        changes.push(`**Roles Added:** ${addedRoles.map(r => r.name).join(', ')}`);
    }

    if (removedRoles.size > 0) {
        changes.push(`**Roles Removed:** ${removedRoles.map(r => r.name).join(', ')}`);
    }

    if (changes.length > 0) {
        embed.addFields({ name: 'Changes', value: changes.join('\n') });
        await sendLog(newMember.guild, embed);
    }
}

// VOICE EVENT HANDLERS
async function handleVoiceStateUpdate(oldState, newState) {
    const config = getGuildConfig(newState.guild || oldState.guild);
    if (!config.features?.serverLogger?.logVoiceEvents) return;

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .addFields(
            { name: 'Member', value: `${member.user}`, inline: true },
            { name: 'ID', value: member.user.id, inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    // Member joined voice channel
    if (!oldState.channel && newState.channel) {
        embed.setTitle('🔊 Voice Channel Joined');
        embed.addFields({ name: 'Channel', value: `${newState.channel}`, inline: true });
    }
    // Member left voice channel
    else if (oldState.channel && !newState.channel) {
        embed.setTitle('🔇 Voice Channel Left');
        embed.addFields({ name: 'Channel', value: `${oldState.channel}`, inline: true });
    }
    // Member moved between voice channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        embed.setTitle('🔄 Voice Channel Moved');
        embed.addFields(
            { name: 'From', value: `${oldState.channel}`, inline: true },
            { name: 'To', value: `${newState.channel}`, inline: true }
        );
    }
    // Other voice state changes (mute, deafen, etc.)
    else {
        const changes = [];

        // Mute status change
        if (oldState.mute !== newState.mute) {
            changes.push(`**Mute:** ${oldState.mute} → ${newState.mute}`);
        }

        // Deafen status change
        if (oldState.deaf !== newState.deaf) {
            changes.push(`**Deaf:** ${oldState.deaf} → ${newState.deaf}`);
        }

        // Self-mute change
        if (oldState.selfMute !== newState.selfMute) {
            changes.push(`**Self Mute:** ${oldState.selfMute} → ${newState.selfMute}`);
        }

        // Self-deafen change
        if (oldState.selfDeaf !== newState.selfDeaf) {
            changes.push(`**Self Deaf:** ${oldState.selfDeaf} → ${newState.selfDeaf}`);
        }

        // Streaming change
        if (oldState.streaming !== newState.streaming) {
            changes.push(`**Streaming:** ${oldState.streaming} → ${newState.streaming}`);
        }

        if (changes.length > 0) {
            embed.setTitle('🎤 Voice State Changed');
            embed.addFields({ name: 'Changes', value: changes.join('\n') });
            if (newState.channel) {
                embed.addFields({ name: 'Channel', value: `${newState.channel}`, inline: true });
            }
        } else {
            return; // No changes to log
        }
    }

    await sendLog(newState.guild || oldState.guild, embed, null, 'vcLogs');
}

// MODERATION EVENT HANDLERS
async function handleBanAdd(ban) {
    const config = getGuildConfig(ban.guild);
    if (!config.features?.serverLogger?.logModerationEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('🔨 Member Banned')
        .setColor(Colors.Red)
        .addFields(
            { name: 'User', value: `${ban.user}`, inline: true },
            { name: 'ID', value: ban.user.id, inline: true }
        )
        .setTimestamp();

    if (ban.reason) {
        embed.addFields({ name: 'Reason', value: ban.reason });
    }

    await sendLog(ban.guild, embed);
}

async function handleBanRemove(ban) {
    const config = getGuildConfig(ban.guild);
    if (!config.features?.serverLogger?.logModerationEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('🔓 Member Unbanned')
        .setColor(Colors.Green)
        .addFields(
            { name: 'User', value: `${ban.user}`, inline: true },
            { name: 'ID', value: ban.user.id, inline: true }
        )
        .setTimestamp();

    await sendLog(ban.guild, embed);
}

// EMOJI EVENT HANDLERS
async function handleEmojiCreate(emoji) {
    const config = getGuildConfig(emoji.guild);
    if (!config.features?.serverLogger?.logEmojiEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('😀 Emoji Created')
        .setColor(Colors.Green)
        .addFields(
            { name: 'Emoji', value: `${emoji}`, inline: true },
            { name: 'Name', value: emoji.name, inline: true },
            { name: 'ID', value: emoji.id, inline: true },
            { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true }
        )
        .setImage(emoji.url)
        .setTimestamp();

    await sendLog(emoji.guild, embed);
}

async function handleEmojiDelete(emoji) {
    const config = getGuildConfig(emoji.guild);
    if (!config.features?.serverLogger?.logEmojiEvents) return;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Emoji Deleted')
        .setColor(Colors.Red)
        .addFields(
            { name: 'Emoji Name', value: emoji.name, inline: true },
            { name: 'ID', value: emoji.id, inline: true },
            { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true }
        )
        .setTimestamp();

    await sendLog(emoji.guild, embed);
}

async function handleEmojiUpdate(oldEmoji, newEmoji) {
    const config = getGuildConfig(newEmoji.guild || oldEmoji.guild);
    if (!config.features?.serverLogger?.logEmojiEvents) return;

    const changes = [];
    const embed = new EmbedBuilder()
        .setTitle('📝 Emoji Updated')
        .setColor(Colors.Orange)
        .addFields(
            { name: 'Emoji', value: `${newEmoji}`, inline: true },
            { name: 'ID', value: newEmoji.id, inline: true }
        )
        .setImage(newEmoji.url)
        .setTimestamp();

    // Name change
    if (oldEmoji.name !== newEmoji.name) {
        changes.push(`**Name:** ${oldEmoji.name} → ${newEmoji.name}`);
    }

    if (changes.length > 0) {
        embed.addFields({ name: 'Changes', value: changes.join('\n') });
        await sendLog(newEmoji.guild, embed);
    }
}

module.exports = {
    register
};