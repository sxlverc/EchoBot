const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const getConfig = require('../../configHelper');

const voicemasterDataPath = path.join(__dirname, '../../data/voicemasterData.json');
const MAX_ARCHIVE_MESSAGES = 500;
const MAX_ARCHIVED_MEDIA_FILES = 40;
const MAX_ATTACHMENT_DOWNLOAD_SIZE = 25 * 1024 * 1024;

// Initialize voicemaster data
function initVoicemasterData() {
    if (!fs.existsSync(voicemasterDataPath)) {
        const defaultData = {
            joinToCreateChannels: [], // Channels that create temp channels when joined
            tempChannels: [], // Currently active temporary channels
            userChannels: {}, // Track which user owns which channel
            userPreferences: {}, // Store user's last channel name and settings
            pingedUsers: {} // Track users who have pinged per channel
        };
        fs.writeFileSync(voicemasterDataPath, JSON.stringify(defaultData, null, 2));
    }
}

// Load voicemaster data
function loadVoicemasterData() {
    initVoicemasterData();
    try {
        const data = JSON.parse(fs.readFileSync(voicemasterDataPath, 'utf8'));
        // Ensure userPreferences exists (for existing data files)
        if (!data.userPreferences) {
            data.userPreferences = {};
        }
        // Ensure pingedUsers exists (for existing data files)
        if (!data.pingedUsers) {
            data.pingedUsers = {};
        }
        return data;
    } catch {
        // If corrupted, reset to default
        const defaultData = {
            joinToCreateChannels: [],
            tempChannels: [],
            userChannels: {},
            userPreferences: {},
            pingedUsers: {}
        };
        fs.writeFileSync(voicemasterDataPath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
}

// Save voicemaster data
function saveVoicemasterData(data) {
    fs.writeFileSync(voicemasterDataPath, JSON.stringify(data, null, 2));
}

function getGuildRuntimeConfig(guildId) {
    try {
        return getConfig(guildId);
    } catch (error) {
        console.error(`Failed to load config for guild ${guildId}:`, error.message);
        return null;
    }
}

function sanitizeFilename(filename) {
    return String(filename || 'file')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 120);
}

function isArchiveableMedia(attachment) {
    const contentType = attachment.contentType || '';
    if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
        return true;
    }

    const lowerName = (attachment.name || '').toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.mp4', '.mov', '.webm'].some(ext => lowerName.endsWith(ext));
}

function buildArchivedMediaFilename(messageId, index, attachment) {
    const extensionFromName = path.extname(attachment.name || '');
    let extension = extensionFromName;

    if (!extension && attachment.contentType) {
        const contentTypeExtension = attachment.contentType.split('/')[1]?.split(';')[0];
        if (contentTypeExtension) {
            extension = `.${contentTypeExtension}`;
        }
    }

    if (!extension) {
        extension = '.bin';
    }

    const base = sanitizeFilename(path.basename(attachment.name || `media-${index}`, extension));
    return `${messageId}-${index}-${base}${extension}`;
}

async function backupMessageAttachment(message, attachment, index) {
    const archivedFilename = buildArchivedMediaFilename(message.id, index, attachment);

    try {
        const response = await axios.get(attachment.url, {
            responseType: 'arraybuffer',
            timeout: 20000,
            maxContentLength: MAX_ATTACHMENT_DOWNLOAD_SIZE,
            maxBodyLength: MAX_ATTACHMENT_DOWNLOAD_SIZE,
            validateStatus: (status) => status >= 200 && status < 300
        });

        const fileBuffer = Buffer.from(response.data);
        const archivedFile = new AttachmentBuilder(fileBuffer, { name: archivedFilename });

        return {
            archivedFile,
            refLine: `- [${message.createdAt.toISOString()}] ${message.author.tag} (${message.author.id}) | ${attachment.name || 'attachment'} | ${attachment.url} | archived-as: ${archivedFilename}`
        };
    } catch (error) {
        return {
            archivedFile: null,
            refLine: `- [${message.createdAt.toISOString()}] ${message.author.tag} (${message.author.id}) | ${attachment.name || 'attachment'} | ${attachment.url} | archive-failed: ${error.message}`
        };
    }
}

// Archive voice channel messages before deletion
async function archiveVoiceChannelMessages(voiceChannel, guild, guildConfig) {
    try {
        // Check if channel still exists before attempting to fetch messages
        if (!guild.channels.cache.has(voiceChannel.id)) {
            console.log(`Channel ${voiceChannel.id} no longer exists, skipping archive`);
            return;
        }

        // Fetch messages from the voice channel's text chat (if it exists)
        const messages = [];
        let lastId;
        let totalFetched = 0;
        const archivedMediaFiles = [];
        const mediaReferenceLines = [];
        let mediaLimitHit = false;
        
        while (totalFetched < MAX_ARCHIVE_MESSAGES) {
            const options = { limit: Math.min(100, MAX_ARCHIVE_MESSAGES - totalFetched) };
            if (lastId) options.before = lastId;
            
            const fetchedMessages = await voiceChannel.messages.fetch(options);
            if (fetchedMessages.size === 0) break;
            
            messages.push(...fetchedMessages.values());
            lastId = fetchedMessages.last().id;
            totalFetched += fetchedMessages.size;
            
            if (fetchedMessages.size < 100) break;
        }
        
        // If no messages, skip archiving
        if (messages.length === 0) {
            console.log(`No messages to archive for ${voiceChannel.name}`);
            return;
        }
        
        // Sort messages by timestamp (oldest first)
        messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        // Create archive text
        let archiveText = `Voice Channel: ${voiceChannel.name}\n`;
        archiveText += `Channel ID: ${voiceChannel.id}\n`;
        archiveText += `Created: ${voiceChannel.createdAt.toUTCString()}\n`;
        archiveText += `Deleted: ${new Date().toUTCString()}\n`;
        archiveText += `Total Messages Archived: ${messages.length}\n`;
        if (totalFetched >= MAX_ARCHIVE_MESSAGES) {
            archiveText += `Note: Limited to last ${MAX_ARCHIVE_MESSAGES} messages\n`;
        }
        archiveText += `${'='.repeat(80)}\n\n`;
        
        for (const message of messages) {
            const timestamp = message.createdAt.toUTCString();
            const author = `${message.author.tag} (${message.author.id})`;
            let content = message.content || '[No text content]';
            
            // Add attachment info if present
            if (message.attachments.size > 0) {
                const attachmentUrls = message.attachments.map(a => `${a.name || 'attachment'}: ${a.url}`).join('\n  ');
                content += `\n  [Attachments: ${message.attachments.size}]\n  ${attachmentUrls}`;

                let attachmentIndex = 0;
                for (const attachmentItem of message.attachments.values()) {
                    attachmentIndex += 1;
                    if (!isArchiveableMedia(attachmentItem)) continue;

                    if (archivedMediaFiles.length >= MAX_ARCHIVED_MEDIA_FILES) {
                        mediaLimitHit = true;
                        mediaReferenceLines.push(`- [${message.createdAt.toISOString()}] ${message.author.tag} (${message.author.id}) | ${attachmentItem.name || 'attachment'} | ${attachmentItem.url} | skipped: media archive limit reached`);
                        continue;
                    }

                    const backupResult = await backupMessageAttachment(message, attachmentItem, attachmentIndex);
                    mediaReferenceLines.push(backupResult.refLine);
                    if (backupResult.archivedFile) {
                        archivedMediaFiles.push(backupResult.archivedFile);
                    }
                }
            }
            
            // Add embed info if present
            if (message.embeds.length > 0) {
                content += `\n  [Embeds: ${message.embeds.length}]`;
            }
            
            archiveText += `[${timestamp}] ${author}\n${content}\n\n`;
        }
        
        // Send to VC logs channel without saving to local filesystem
        const vcLogsChannelId = guildConfig?.channels?.vcLogs;
        if (!vcLogsChannelId) {
            console.log('VC logs channel not configured in config.json');
            return;
        }
        
        const logsChannel = guild.channels.cache.get(vcLogsChannelId);
        if (logsChannel) {
            // Create attachment from text content without saving to disk
            const filename = `vc-${voiceChannel.id}-${Date.now()}.txt`;
            const attachment = new AttachmentBuilder(Buffer.from(archiveText, 'utf8'), { name: filename });
            const mediaReferenceAttachment = mediaReferenceLines.length > 0
                ? new AttachmentBuilder(
                    Buffer.from(
                        `Media archive references for VC ${voiceChannel.name} (${voiceChannel.id})\nGenerated: ${new Date().toUTCString()}\n\n${mediaReferenceLines.join('\n')}\n`,
                        'utf8'
                    ),
                    { name: `vc-${voiceChannel.id}-media-refs-${Date.now()}.txt` }
                )
                : null;
            
            const embed = new EmbedBuilder()
                .setTitle('Voice Channel Deleted')
                .setDescription(`Archive of messages from **${voiceChannel.name}**`)
                .setColor(0x95a5a6)
                .addFields(
                    { name: 'Channel', value: voiceChannel.name, inline: true },
                    { name: 'Messages Archived', value: messages.length.toString(), inline: true },
                    { name: 'Created', value: `<t:${Math.floor(voiceChannel.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Media Backed Up', value: archivedMediaFiles.length.toString(), inline: true }
                )
                .setTimestamp();

            if (mediaLimitHit) {
                embed.addFields({ name: 'Media Limit Notice', value: `Backed up first ${MAX_ARCHIVED_MEDIA_FILES} media files. See media refs file for skipped items.` });
            }
            
            await logsChannel.send({
                embeds: [embed],
                files: mediaReferenceAttachment ? [attachment, mediaReferenceAttachment] : [attachment]
            });

            for (let i = 0; i < archivedMediaFiles.length; i += 10) {
                const mediaChunk = archivedMediaFiles.slice(i, i + 10);
                await logsChannel.send({
                    content: `Archived VC media for **${voiceChannel.name}** (${i + 1}-${Math.min(i + 10, archivedMediaFiles.length)} of ${archivedMediaFiles.length})`,
                    files: mediaChunk
                });
            }
            
            console.log(`Sent archive to VC logs channel for ${voiceChannel.name} (${messages.length} messages, ${archivedMediaFiles.length} media files)`);
        } else {
            console.log(`VC logs channel not found (${vcLogsChannelId})`);
        }
        
    } catch (error) {
        console.error('Error archiving voice channel messages:', error);
    }
}

// Handle voice state changes for voicemaster
async function handleVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild?.id || oldState.guild?.id;
    const guildConfig = guildId ? getGuildRuntimeConfig(guildId) : null;

    // Check if VoiceMaster is enabled
    if (!guildConfig?.features?.voicemaster?.enabled) return;
    
    const data = loadVoicemasterData();
    
    // User joined a channel
    if (newState.channelId && newState.channelId !== oldState.channelId) {
        await handleUserJoinedChannel(newState, data, guildConfig);
    }
    
    // User left a channel
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        await handleUserLeftChannel(oldState, data, guildConfig);
    }
}

// Handle user joining a voice channel
async function handleUserJoinedChannel(voiceState, data, guildConfig) {
    const { member, channelId, guild } = voiceState;
    
    // Get join-to-create channel from config (fallback to data file for backwards compatibility)
    const configJoinChannel = guildConfig?.features?.voicemaster?.joinToCreateChannel;
    const isJoinToCreate = channelId === configJoinChannel || data.joinToCreateChannels.includes(channelId);
    
    // Check if they joined a "Join to Create" channel
    if (isJoinToCreate) {
        try {
            const parentChannel = guild.channels.cache.get(channelId);
            
            // Check bot permissions before attempting to create channel
            const botMember = guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                console.error('Bot missing "Manage Channels" permission - cannot create voice channels');
                return;
            }
            
            if (parentChannel.parent && !parentChannel.parent.permissionsFor(botMember).has(PermissionFlagsBits.ManageChannels)) {
                console.error('Bot missing "Manage Channels" permission in category - cannot create voice channels');
                return;
            }
            
            // Get user's saved channel name preference or use default
            const savedName = data.userPreferences[member.id]?.channelName || `${member.displayName}'s Channel`;
            const savedLimit = data.userPreferences[member.id]?.userLimit || 0;
            
            // Create temporary voice channel
            const tempChannel = await guild.channels.create({
                name: savedName,
                type: ChannelType.GuildVoice,
                parent: parentChannel.parent,
                userLimit: savedLimit,
                permissionOverwrites: [
                    {
                        // Explicit bot permissions so locking (@everyone Connect: false) never blocks the bot
                        id: guild.members.me.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.ManageChannels,
                        ]
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.MoveMembers,
                            PermissionFlagsBits.MuteMembers,
                            PermissionFlagsBits.DeafenMembers,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.Speak
                        ]
                    },
                    {
                        id: guild.roles.everyone.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                    }
                ]
            });

            // Move user to their new channel
            await member.voice.setChannel(tempChannel);

            // Update data
            data.tempChannels.push(tempChannel.id);
            data.userChannels[tempChannel.id] = member.id;
            saveVoicemasterData(data);

            // Send the voice control menu to the voice channel's chat
            await sendVoiceControlMenu(tempChannel, member);

            console.log(`Created temporary voice channel for ${member.displayName}: ${tempChannel.name}`);
        } catch (error) {
            console.error('Error creating temporary voice channel:', error);
            
            // Provide specific error messages for common issues
            if (error.code === 50013) {
                console.error('❌ Bot missing permissions! Please ensure the bot has:');
                console.error('  - "Manage Channels" permission');
                console.error('  - Permission to create channels in the category');
                console.error('  - Bot role is high enough in role hierarchy');
            } else if (error.code === 50001) {
                console.error('❌ Bot missing access to the channel or category');
            }
        }
    }
}

// Handle user leaving a voice channel
async function handleUserLeftChannel(voiceState, data, guildConfig) {
    const { channelId, guild } = voiceState;
    
    // Check if they left a temporary channel
    if (data.tempChannels.includes(channelId)) {
        // Small delay to ensure Discord has updated the member count
        setTimeout(async () => {
            const channel = guild.channels.cache.get(channelId);

            if (channel && channel.members.size === 0) {
                try {
                    // Verify channel still exists before archiving
                    const stillExists = guild.channels.cache.has(channelId);
                    if (!stillExists) {
                        // Channel was already deleted, just clean up data
                        const currentData = loadVoicemasterData();
                        currentData.tempChannels = currentData.tempChannels.filter(id => id !== channelId);
                        delete currentData.userChannels[channelId];
                        saveVoicemasterData(currentData);
                        return;
                    }
                    
                    // Archive chat messages before deletion (with its own error handling)
                    try {
                        await archiveVoiceChannelMessages(channel, guild, guildConfig);
                    } catch (archiveError) {
                        console.error('Error archiving voice channel:', archiveError.message);
                        // Continue with deletion even if archiving fails
                    }
                    
                    // Double-check channel still exists before deletion
                    if (!guild.channels.cache.has(channelId)) {
                        console.log(`Channel ${channelId} was deleted during archiving, cleaning up data`);
                        const currentData = loadVoicemasterData();
                        currentData.tempChannels = currentData.tempChannels.filter(id => id !== channelId);
                        delete currentData.userChannels[channelId];
                        saveVoicemasterData(currentData);
                        return;
                    }
                    
                    // Delete empty temporary channel
                    await channel.delete('Temporary voice channel empty');
                    
                    // Update data
                    const currentData = loadVoicemasterData();
                    currentData.tempChannels = currentData.tempChannels.filter(id => id !== channelId);
                    delete currentData.userChannels[channelId];
                    saveVoicemasterData(currentData);
                    
                    console.log(`Deleted empty temporary voice channel: ${channel.name}`);
                } catch (error) {
                    console.error('Error deleting temporary voice channel:', error);
                    // Remove from tracking even if deletion failed
                    const currentData = loadVoicemasterData();
                    currentData.tempChannels = currentData.tempChannels.filter(id => id !== channelId);
                    delete currentData.userChannels[channelId];
                    saveVoicemasterData(currentData);
                }
            }
        }, 3000); // Increased delay to 3 seconds
    }
}

// Send voice control menu to the voice channel's chat
async function sendVoiceControlMenu(voiceChannel, owner) {
    try {

        const embed = new EmbedBuilder()
            .setTitle('🎤 Voice Channel Controls')
            .setDescription(`**${owner.displayName}** created a voice channel!\nUse the menu below to manage your channel.`)
            .setColor(0x5865F2)
            .addFields(
                { name: '🔧 Channel Owner', value: `<@${owner.id}>`, inline: true },
                { name: '🎵 Voice Channel', value: `<#${voiceChannel.id}>`, inline: true }
            )
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`voice_control_${voiceChannel.id}`)
            .setPlaceholder('Select an action...')
            .addOptions([
                {
                    label: 'Rename Channel',
                    description: 'Change your voice channel name',
                    value: 'rename',
                    emoji: '✏️'
                },
                {
                    label: 'Set User Limit',
                    description: 'Set maximum number of users',
                    value: 'limit',
                    emoji: '👥'
                },
                {
                    label: 'Lock Channel',
                    description: 'Prevent new users from joining',
                    value: 'lock',
                    emoji: '🔒'
                },
                {
                    label: 'Unlock Channel',
                    description: 'Allow new users to join',
                    value: 'unlock',
                    emoji: '🔓'
                },
                {
                    label: 'Ping VC Role',
                    description: 'Ping users who want VC notifications',
                    value: 'ping_vc',
                    emoji: '📢'
                },
                {
                    label: 'Kick User',
                    description: 'Remove someone from your channel',
                    value: 'kick',
                    emoji: '👢'
                },
                {
                    label: 'Invite User',
                    description: 'Give someone access to your locked channel',
                    value: 'invite',
                    emoji: '📨'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Send directly to the voice channel - Discord will show it in the voice channel's text chat
        await voiceChannel.send({
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('Error sending voice control menu:', error);
    }
}

// Handle select menu interactions
async function handleVoiceControlMenu(interaction) {
    const channelId = interaction.customId.split('_')[2];
    const action = interaction.values[0];
    const data = loadVoicemasterData();
    const guildConfig = getGuildRuntimeConfig(interaction.guild.id);
    
    // Check if user owns this channel
    if (data.userChannels[channelId] !== interaction.user.id) {
        return await interaction.reply({
            content: '❌ You can only control voice channels that you own.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const voiceChannel = interaction.guild.channels.cache.get(channelId);
    if (!voiceChannel) {
        return await interaction.reply({
            content: '❌ Voice channel no longer exists.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        switch (action) {
            case 'rename':
                await handleMenuRename(interaction, voiceChannel);
                break;
            case 'limit':
                await handleMenuLimit(interaction, voiceChannel);
                break;
            case 'lock':
                await handleMenuLock(interaction, voiceChannel);
                break;
            case 'unlock':
                await handleMenuUnlock(interaction, voiceChannel);
                break;
            case 'ping_vc':
                await handleMenuPingVC(interaction, voiceChannel, guildConfig);
                break;
            case 'kick':
                await handleMenuKick(interaction, voiceChannel);
                break;
            case 'invite':
                await handleMenuInvite(interaction, voiceChannel);
                break;
        }
    } catch (error) {
        console.error('Error handling voice control menu:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleMenuRename(interaction, channel) {
    const modal = new ModalBuilder()
        .setCustomId(`voice_rename_${channel.id}`)
        .setTitle('Rename Voice Channel');

    const nameInput = new TextInputBuilder()
        .setCustomId('channel_name')
        .setLabel('New Channel Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter new channel name...')
        .setRequired(true)
        .setMaxLength(100)
        .setValue(channel.name);

    const row = new ActionRowBuilder().addComponents(nameInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

async function handleMenuLimit(interaction, channel) {
    const modal = new ModalBuilder()
        .setCustomId(`voice_limit_${channel.id}`)
        .setTitle('Set User Limit');

    const limitInput = new TextInputBuilder()
        .setCustomId('user_limit')
        .setLabel('User Limit (0 for unlimited)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a number between 0-99')
        .setRequired(true)
        .setMaxLength(2)
        .setValue(channel.userLimit.toString());

    const row = new ActionRowBuilder().addComponents(limitInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

async function handleMenuLock(interaction, channel) {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        Connect: false
    });
    
    await interaction.reply({
        content: '🔒 Your voice channel has been locked!',
        flags: MessageFlags.Ephemeral
    });
}

async function handleMenuUnlock(interaction, channel) {
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        Connect: true
    });
    
    await interaction.reply({
        content: '🔓 Your voice channel has been unlocked!',
        flags: MessageFlags.Ephemeral
    });
}

async function handleMenuPingVC(interaction, channel, guildConfig) {
    const vcPingRoleId = guildConfig?.roles?.vcPing;
    
    if (!vcPingRoleId || vcPingRoleId === 'CREATE_VC_PING_ROLE_ID') {
        return await interaction.reply({
            content: '❌ VC ping role not configured. Please contact an admin to set up the VC ping role.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const role = interaction.guild.roles.cache.get(vcPingRoleId);
    if (!role) {
        return await interaction.reply({
            content: '❌ VC ping role not found. Please contact an admin to fix the role configuration.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Check if user has already pinged in this channel
    const data = loadVoicemasterData();
    if (!data.pingedUsers) {
        data.pingedUsers = {};
    }
    if (!data.pingedUsers[channel.id]) {
        data.pingedUsers[channel.id] = [];
    }
    
    if (data.pingedUsers[channel.id].includes(interaction.user.id)) {
        return await interaction.reply({
            content: '❌ You have already pinged the VC role for this channel. You can only ping once per voice channel.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Send ping message to the voice channel's text chat
    await channel.send({
        content: `📢 <@&${vcPingRoleId}> **${interaction.user.displayName}** is looking for people to join their voice channel **${channel.name}**!`
    });
    
    // Record that this user has pinged in this channel
    data.pingedUsers[channel.id].push(interaction.user.id);
    saveVoicemasterData(data);
    
    await interaction.reply({
        content: '📢 Ping sent to VC role!',
        flags: MessageFlags.Ephemeral
    });
}

async function handleMenuKick(interaction, channel) {
    const members = channel.members.filter(m => m.id !== interaction.user.id);
    
    if (members.size === 0) {
        return await interaction.reply({
            content: '❌ No other users in your channel to kick.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    // For simplicity, kick the first other member
    const memberToKick = members.first();
    await memberToKick.voice.disconnect('Kicked by channel owner');
    
    await interaction.reply({
        content: `👢 Kicked ${memberToKick.displayName} from your channel.`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleMenuInvite(interaction, channel) {
    await interaction.reply({
        content: '📨 To invite someone to your locked channel, have them try to join and they will be able to connect, or manually give them permissions.',
        flags: MessageFlags.Ephemeral
    });
}

// Handle modal submissions
async function handleVoiceControlModal(interaction) {
    const [action, _, channelId] = interaction.customId.split('_');
    const data = loadVoicemasterData();
    
    // Check if user owns this channel
    if (data.userChannels[channelId] !== interaction.user.id) {
        return await interaction.reply({
            content: '❌ You can only control voice channels that you own.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const voiceChannel = interaction.guild.channels.cache.get(channelId);
    if (!voiceChannel) {
        return await interaction.reply({
            content: '❌ Voice channel no longer exists.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        if (action === 'voice' && interaction.customId.startsWith('voice_rename_')) {
            const newName = interaction.fields.getTextInputValue('channel_name');
            
            if (newName.length < 1 || newName.length > 100) {
                return await interaction.reply({
                    content: '❌ Channel name must be between 1 and 100 characters.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            await voiceChannel.setName(newName);
            
            // Save the user's channel name preference
            const data = loadVoicemasterData();
            if (!data.userPreferences[interaction.user.id]) {
                data.userPreferences[interaction.user.id] = {};
            }
            data.userPreferences[interaction.user.id].channelName = newName;
            saveVoicemasterData(data);
            
            await interaction.reply({
                content: `✏️ Channel renamed to **${newName}**!`,
                flags: MessageFlags.Ephemeral
            });
        } else if (action === 'voice' && interaction.customId.startsWith('voice_limit_')) {
            const limitStr = interaction.fields.getTextInputValue('user_limit');
            const limit = parseInt(limitStr);
            
            if (isNaN(limit) || limit < 0 || limit > 99) {
                return await interaction.reply({
                    content: '❌ User limit must be a number between 0 and 99.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            await voiceChannel.setUserLimit(limit);
            
            // Save the user's limit preference
            const data = loadVoicemasterData();
            if (!data.userPreferences[interaction.user.id]) {
                data.userPreferences[interaction.user.id] = {};
            }
            data.userPreferences[interaction.user.id].userLimit = limit;
            saveVoicemasterData(data);
            
            await interaction.reply({
                content: limit === 0 ? 
                    '👥 User limit removed (unlimited users)!' : 
                    `👥 User limit set to **${limit}**!`,
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        console.error('Error handling voice modal:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// Clean up non-existent channels from data, and delete any that exist but are empty
async function cleanupNonExistentChannels(guild, guildConfig) {
    const data = loadVoicemasterData();
    let changed = false;

    const validTempChannels = [];
    for (const channelId of data.tempChannels) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            // Channel was deleted outside the bot — just remove from tracking
            delete data.userChannels[channelId];
            if (data.pingedUsers?.[channelId]) delete data.pingedUsers[channelId];
            changed = true;
        } else if (channel.members.size === 0) {
            // Channel exists but is empty (e.g. bot restarted while channel was locked/empty)
            try {
                await archiveVoiceChannelMessages(channel, guild, guildConfig);
            } catch (err) {
                console.error('Error archiving voice channel during startup cleanup:', err.message);
            }
            try {
                await channel.delete('Temporary voice channel empty (startup cleanup)');
                console.log(`Startup cleanup: deleted empty temp channel ${channel.name}`);
            } catch (err) {
                console.error('Error deleting empty temp channel during startup cleanup:', err.message);
            }
            delete data.userChannels[channelId];
            if (data.pingedUsers?.[channelId]) delete data.pingedUsers[channelId];
            changed = true;
        } else {
            validTempChannels.push(channelId);
        }
    }

    if (changed) {
        data.tempChannels = validTempChannels;
        saveVoicemasterData(data);
        console.log('VoiceMaster startup cleanup complete');
    }
}

module.exports = {
    handleVoiceStateUpdate,
    handleVoiceControlMenu,
    handleVoiceControlModal,
    loadVoicemasterData,
    saveVoicemasterData,
    cleanupNonExistentChannels
};