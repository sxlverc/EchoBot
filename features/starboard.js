const { Events, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const dataPath = path.join(__dirname, '../data/starboard.json');

function loadData() {
    try {
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (error) {
        return { config: {}, messages: {} };
    }
}

function saveData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getConfig(guildId) {
    const data = loadData();
    return data.config[guildId] || null;
}

function isMediaAttachment(attachment) {
    if (attachment.contentType) {
        return attachment.contentType.startsWith('image/') || attachment.contentType.startsWith('video/');
    }

    if (!attachment.name) {
        return false;
    }

    const extension = path.extname(attachment.name).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.webm', '.m4v'].includes(extension);
}

// Function to download attachment from URL
async function downloadAttachment(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download attachment: ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

async function handleStarboard(reaction, user, isAdd) {
    // Ignore bot reactions
    if (user.bot) return;

    const message = reaction.message;
    const guildId = message.guild.id;
    const config = getConfig(guildId);

    // If starboard is not configured for this guild, return
    if (!config || !config.channelId) return;

    // Only handle star emoji
    if (reaction.emoji.name !== '⭐') return;

    const data = loadData();
    const messageKey = `${guildId}-${message.id}`;
    
    // Count total stars (we need to fetch to get accurate count)
    let starCount = 0;
    try {
        if (reaction.partial) {
            await reaction.fetch();
        }
        starCount = reaction.count;
    } catch (error) {
        console.error('Error fetching reaction:', error);
        return;
    }

    // Check if we've already posted this message to starboard
    const starboardData = data.messages[messageKey];
    const threshold = config.threshold || 3;

    try {
        const starboardChannel = await message.guild.channels.fetch(config.channelId);
        if (!starboardChannel) return;

        if (starCount >= threshold) {
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL()
                })
                .setDescription(message.content || '*[No text content]*')
                .setColor(0xffd700) // Gold color
                .setTimestamp(message.createdAt)
                .addFields({
                    name: 'Source',
                    value: `[Jump to message](${message.url})`
                });

            // Collect media attachments to download and re-upload
            const mediaAttachments = [];
            let embedImageUrl = null;

            // Check for image/video attachments
            if (message.attachments.size > 0) {
                for (const attachment of message.attachments.values()) {
                    if (isMediaAttachment(attachment)) {
                        try {
                            const mediaBuffer = await downloadAttachment(attachment.url);
                            mediaAttachments.push(
                                new AttachmentBuilder(mediaBuffer, {
                                    name: `starboard_${attachment.name}`
                                })
                            );
                            // Set first image as embed image, but preserve video as a file
                            if (!embedImageUrl && attachment.contentType && attachment.contentType.startsWith('image/')) {
                                embedImageUrl = `attachment://starboard_${attachment.name}`;
                            }
                        } catch (error) {
                            console.error('Error downloading media:', error);
                        }
                    }
                }
            }

            // Check for embedded images if no attachment images were found
            if (!embedImageUrl && message.embeds.length > 0) {
                const firstEmbed = message.embeds[0];
                if (firstEmbed.image) {
                    try {
                        const imageUrl = firstEmbed.image.url;
                        const imageBuffer = await downloadAttachment(imageUrl);
                        const fileName = `starboard_embed_${Date.now()}.png`;
                        mediaAttachments.push(
                            new AttachmentBuilder(imageBuffer, { name: fileName })
                        );
                        embedImageUrl = `attachment://${fileName}`;
                    } catch (error) {
                        console.error('Error downloading embed image:', error);
                    }
                } else if (firstEmbed.thumbnail) {
                    try {
                        const imageUrl = firstEmbed.thumbnail.url;
                        const imageBuffer = await downloadAttachment(imageUrl);
                        const fileName = `starboard_thumb_${Date.now()}.png`;
                        mediaAttachments.push(
                            new AttachmentBuilder(imageBuffer, { name: fileName })
                        );
                        embedImageUrl = `attachment://${fileName}`;
                    } catch (error) {
                        console.error('Error downloading thumbnail image:', error);
                    }
                }
            }

            // Set the image in the embed if we have one
            if (embedImageUrl) {
                embed.setImage(embedImageUrl);
            }

            const starText = `⭐ **${starCount}** ${message.channel.toString()}`;

            if (starboardData && starboardData.starboardMessageId) {
                // Update existing starboard message
                try {
                    const starboardMessage = await starboardChannel.messages.fetch(starboardData.starboardMessageId);
                    const updatePayload = {
                        content: starText,
                        embeds: [embed]
                    };
                    // Add files if we have media to preserve
                    if (mediaAttachments.length > 0) {
                        updatePayload.files = mediaAttachments;
                    }
                    await starboardMessage.edit(updatePayload);
                } catch (error) {
                    // If message was deleted, create a new one
                    const newStarboardMessage = await starboardChannel.send({
                        content: starText,
                        embeds: [embed],
                        files: mediaAttachments
                    });
                    data.messages[messageKey] = {
                        starboardMessageId: newStarboardMessage.id,
                        originalMessageId: message.id,
                        channelId: message.channel.id,
                        authorId: message.author.id,
                        starCount: starCount
                    };
                    saveData(data);
                }
            } else {
                // Create new starboard message
                const newStarboardMessage = await starboardChannel.send({
                    content: starText,
                    embeds: [embed],
                    files: mediaAttachments
                });
                data.messages[messageKey] = {
                    starboardMessageId: newStarboardMessage.id,
                    originalMessageId: message.id,
                    channelId: message.channel.id,
                    authorId: message.author.id,
                    starCount: starCount
                };
                saveData(data);
            }
        } else if (starboardData && starboardData.starboardMessageId) {
            // If star count drops below threshold, remove from starboard
            try {
                const starboardMessage = await starboardChannel.messages.fetch(starboardData.starboardMessageId);
                await starboardMessage.delete();
                delete data.messages[messageKey];
                saveData(data);
            } catch (error) {
                // Message might already be deleted
                delete data.messages[messageKey];
                saveData(data);
            }
        }
    } catch (error) {
        console.error('Error handling starboard:', error);
    }
}

module.exports = {
    register: (client) => {
        // Handle reaction add
        client.on(Events.MessageReactionAdd, async (reaction, user) => {
            await handleStarboard(reaction, user, true);
        });

        // Handle reaction remove
        client.on(Events.MessageReactionRemove, async (reaction, user) => {
            await handleStarboard(reaction, user, false);
        });

        // Handle reaction remove all (clear starboard entry)
        client.on(Events.MessageReactionRemoveAll, async (message) => {
            const guildId = message.guild.id;
            const messageKey = `${guildId}-${message.id}`;
            const data = loadData();
            
            if (data.messages[messageKey]) {
                const config = getConfig(guildId);
                if (config && config.channelId) {
                    try {
                        const starboardChannel = await message.guild.channels.fetch(config.channelId);
                        const starboardMessage = await starboardChannel.messages.fetch(data.messages[messageKey].starboardMessageId);
                        await starboardMessage.delete();
                    } catch (error) {
                        // Message might already be deleted
                    }
                }
                delete data.messages[messageKey];
                saveData(data);
            }
        });

        // Handle reaction remove emoji (update count)
        client.on(Events.MessageReactionRemoveEmoji, async (reaction) => {
            if (reaction.emoji.name !== '⭐') return;
            
            const message = reaction.message;
            const guildId = message.guild.id;
            const messageKey = `${guildId}-${message.id}`;
            const data = loadData();
            const config = getConfig(guildId);
            
            if (data.messages[messageKey] && config && config.channelId) {
                try {
                    const starboardChannel = await message.guild.channels.fetch(config.channelId);
                    const starboardMessage = await starboardChannel.messages.fetch(data.messages[messageKey].starboardMessageId);
                    await starboardMessage.delete();
                    delete data.messages[messageKey];
                    saveData(data);
                } catch (error) {
                    // Message might already be deleted
                    delete data.messages[messageKey];
                    saveData(data);
                }
            }
        });
    }
};
