const { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const getConfig = require('../configHelper');

const execAsync = promisify(exec);
const ASSETS_DIR = path.join(__dirname, '../assets');
const STALE_QUOTE_TEMP_MS = 10 * 60 * 1000; // 10 minutes
const QUOTE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let quoteCleanupIntervalStarted = false;

function isQuoteTempFile(fileName) {
    return (
        /^quote_\d+_[a-z0-9]+\.png$/.test(fileName) ||
        /^quote_avatar_\d+_[a-z0-9]+\.png$/.test(fileName) ||
        /^quote_avatar_circle_\d+_[a-z0-9]+\.png$/.test(fileName) ||
        /^quote_text_\d+_[a-z0-9]+\.png$/.test(fileName) ||
        /^quote_gradient_\d+_[a-z0-9]+\.png$/.test(fileName) ||
        /^quote_depth_gradient_\d+_[a-z0-9]+\.png$/.test(fileName)
    );
}

function cleanupStaleQuoteAssets(maxAgeMs = STALE_QUOTE_TEMP_MS) {
    try {
        if (!fs.existsSync(ASSETS_DIR)) return;

        const now = Date.now();
        for (const entry of fs.readdirSync(ASSETS_DIR)) {
            if (!isQuoteTempFile(entry)) continue;

            const fullPath = path.join(ASSETS_DIR, entry);
            let stats;
            try {
                stats = fs.statSync(fullPath);
            } catch {
                continue;
            }

            if (!stats.isFile()) continue;
            if ((now - stats.mtimeMs) < maxAgeMs) continue;

            fs.unlinkSync(fullPath);
        }
    } catch (error) {
        console.error('Error cleaning stale quote assets:', error);
    }
}

function startPeriodicQuoteCleanup() {
    if (quoteCleanupIntervalStarted) return;
    quoteCleanupIntervalStarted = true;

    cleanupStaleQuoteAssets();
    setInterval(() => cleanupStaleQuoteAssets(), QUOTE_CLEANUP_INTERVAL_MS);
}

startPeriodicQuoteCleanup();

// Escape text for ImageMagick (prevent command injection)
function escapeText(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'")
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$')
        .replace(/\n/g, '\\n');
}

function countWrappedLines(text, maxCharsPerLine) {
    const safeWidth = Math.max(1, maxCharsPerLine);
    const paragraphs = String(text || '').split('\n');
    let totalLines = 0;

    for (const paragraph of paragraphs) {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);

        // Preserve blank lines explicitly.
        if (words.length === 0) {
            totalLines += 1;
            continue;
        }

        let currentLineLen = 0;
        for (const word of words) {
            // Handle single words longer than the line width.
            if (word.length > safeWidth) {
                if (currentLineLen > 0) {
                    totalLines += 1;
                    currentLineLen = 0;
                }
                totalLines += Math.ceil(word.length / safeWidth);
                continue;
            }

            if (currentLineLen === 0) {
                currentLineLen = word.length;
                continue;
            }

            if ((currentLineLen + 1 + word.length) <= safeWidth) {
                currentLineLen += 1 + word.length;
            } else {
                totalLines += 1;
                currentLineLen = word.length;
            }
        }

        if (currentLineLen > 0) {
            totalLines += 1;
        }
    }

    return totalLines;
}

// Add break opportunities in very long unbroken tokens so ImageMagick caption can wrap.
function softWrapLongTokens(text, maxTokenLength = 16) {
    return String(text || '').replace(/\S+/g, (token) => {
        if (token.length <= maxTokenLength) return token;
        const chunks = token.match(new RegExp(`.{1,${maxTokenLength}}`, 'g')) || [token];
        return chunks.join(' ');
    });
}

// Pick the largest point size that should fit the given text box.
function getDynamicQuoteFontSize(text, boxWidth, boxHeight, maxSize = 40, minSize = 16) {
    const safeText = String(text || '').trim();
    if (!safeText) return maxSize;

    for (let size = maxSize; size >= minSize; size--) {
        // Average character width for this font is roughly 0.54em for mixed text.
        const approxCharWidth = Math.max(1, size * 0.54);
        const maxCharsPerLine = Math.floor(boxWidth / approxCharWidth);

        const lineCount = countWrappedLines(safeText, maxCharsPerLine);
        const lineHeight = size * 1.28;
        const estimatedHeight = lineCount * lineHeight;

        if (estimatedHeight <= boxHeight) {
            return size;
        }
    }

    return minSize;
}

// Shared function to create quote image
async function createQuoteImage(author, displayName, quoteText) {
    const tempId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const avatarPath = path.join(__dirname, `../assets/quote_avatar_${tempId}.png`);
    const outputPath = path.join(__dirname, `../assets/quote_${tempId}.png`);
    
    // Download avatar
    const avatarURL = author.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const response = await axios.get(avatarURL, { responseType: 'arraybuffer' });
    fs.writeFileSync(avatarPath, response.data);
    
    // Create circular grayscale avatar
    const circleAvatarPath = path.join(__dirname, `../assets/quote_avatar_circle_${tempId}.png`);
    await execAsync(`convert "${avatarPath}" -resize 300x300 -colorspace Gray -gravity center -background none \\( +clone -threshold -1 -negate -fill white -draw "circle 150,150 150,0" \\) -alpha off -compose copy_opacity -composite "${circleAvatarPath}"`, { timeout: 5000 });
    
    const wrappedQuoteText = softWrapLongTokens(quoteText, 16);
    const escapedText = escapeText(wrappedQuoteText);
    const escapedDisplayName = escapeText(displayName);
    const escapedUsername = escapeText(author.username);
    
    // Fixed dimensions
    const imageWidth = 860;
    const imageHeight = 450;
    const avatarSize = 300;
    const avatarX = 40;
    const avatarY = (imageHeight - avatarSize) / 2;
    const textStartX = 470;
    const textRightPadding = 50;
    const textFooterReserve = 130;
    const textVerticalOffset = -35;
    const textWidth = imageWidth - textStartX - textRightPadding;
    // Reserve footer space so quote text cannot overlap the name/username block.
    const textHeight = imageHeight - textFooterReserve;
    const pointSize = getDynamicQuoteFontSize(wrappedQuoteText, textWidth, textHeight, 40, 14);
    
    // Create text layer with proper wrapping
    const textLayerPath = path.join(__dirname, `../assets/quote_text_${tempId}.png`);
    await execAsync(`convert -size ${textWidth}x${textHeight} -background none -fill white -font "DejaVu-Sans-Bold" -pointsize ${pointSize} -gravity center caption:"${escapedText}" "${textLayerPath}"`, { timeout: 5000 });
    
    // Create simple quote image with black background
    const command = `convert -size ${imageWidth}x${imageHeight} xc:black \\
        "${circleAvatarPath}" -geometry ${avatarSize}x${avatarSize}+${avatarX}+${avatarY} -composite \\
        "${textLayerPath}" -gravity center -geometry +140${textVerticalOffset >= 0 ? '+' : ''}${textVerticalOffset} -composite \\
        -font "DejaVu-Sans" -pointsize 24 -fill white \\
        -gravity southeast -annotate +50+70 "- ${escapedDisplayName}" \\
        -font "DejaVu-Sans" -pointsize 18 -fill gray \\
        -gravity southeast -annotate +50+45 "@${escapedUsername.toLowerCase().replace(/[^a-z0-9_]/g, '')}" \\
        "${outputPath}"`;
    
    await execAsync(command, { timeout: 10000 });
    
    return { outputPath, tempId };
}

// Clean up temporary files
function cleanupTempFiles(tempId) {
    setTimeout(() => {
        try {
            const avatarPath = path.join(__dirname, `../assets/quote_avatar_${tempId}.png`);
            const circleAvatarPath = path.join(__dirname, `../assets/quote_avatar_circle_${tempId}.png`);
            const outputPath = path.join(__dirname, `../assets/quote_${tempId}.png`);
            const textLayerPath = path.join(__dirname, `../assets/quote_text_${tempId}.png`);
            
            if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
            if (fs.existsSync(circleAvatarPath)) fs.unlinkSync(circleAvatarPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            if (fs.existsSync(textLayerPath)) fs.unlinkSync(textLayerPath);
        } catch (e) {
            console.error('Error deleting temp files:', e);
        }
    }, 5000);
}

module.exports = {
    data: [
        new SlashCommandBuilder()
            .setName('quoteit')
            .setDescription('Create a quote image with custom text and user')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to attribute the quote to')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('text')
                    .setDescription('The quote text')
                    .setRequired(true)),
        new ContextMenuCommandBuilder()
            .setName('Make it a Quote')
            .setType(ApplicationCommandType.Message)
    ],
    
    async execute(interaction) {
        cleanupStaleQuoteAssets();
        await interaction.deferReply();
        
        try {
            const config = getConfig(interaction.guild.id);
            let author, displayName, quoteText;
            
            // Check if this is a slash command or context menu command
            if (interaction.isCommand() && interaction.commandName === 'quoteit') {
                // Slash command - get user and text from options
                author = interaction.options.getUser('user');
                quoteText = interaction.options.getString('text');
                
                // Get member to access server nickname
                let member;
                try {
                    member = interaction.guild.members.cache.get(author.id) || await interaction.guild.members.fetch(author.id);
                } catch (error) {
                    console.error('Error fetching member:', error);
                }
                
                displayName = member ? member.displayName : author.username;
                
                // Limit text length
                if (quoteText.length > 280) {
                    quoteText = quoteText.substring(0, 277) + '...';
                }
            } else {
                // Context menu command - get from target message
                const message = interaction.targetMessage;
                author = message.author;
                
                // Get member to access server nickname
                let member;
                try {
                    member = interaction.guild.members.cache.get(author.id) || await interaction.guild.members.fetch(author.id);
                } catch (error) {
                    console.error('Error fetching member:', error);
                }
                
                displayName = member ? member.displayName : author.username;
                
                // Check if message has content
                if (!message.content || message.content.trim().length === 0) {
                    return interaction.editReply({
                        content: '❌ This message has no text to quote.'
                    });
                }
                
                // Limit text length
                quoteText = message.content;
                if (quoteText.length > 280) {
                    quoteText = quoteText.substring(0, 277) + '...';
                }
            }
            
            // Create the quote image
            const { outputPath, tempId } = await createQuoteImage(author, displayName, quoteText);
            
            // Send the quote image
            const attachment = new AttachmentBuilder(outputPath, { name: 'quote.png' });
            
            // Send to the quotes channel
            const quotesChannelId = config.channels.quotes;
            let sentToChannel = false;
            try {
                const quotesChannel = await interaction.client.channels.fetch(quotesChannelId);
                if (quotesChannel && quotesChannel.isTextBased()) {
                    await quotesChannel.send({ files: [attachment] });
                    sentToChannel = true;
                }
            } catch (error) {
                console.error('Error sending to quotes channel:', error);
            }
            
            if (sentToChannel) {
                await interaction.editReply({
                    content: '✅ Quote created and sent to the quotes channel!'
                });
            } else {
                await interaction.editReply({
                    content: '✅ Quote created! However, there was an issue sending it to the quotes channel. Please check the channel ID and bot permissions.'
                });
            }
            
            // Clean up temp files
            cleanupTempFiles(tempId);
            
        } catch (error) {
            console.error('Error creating quote:', error);
            await interaction.editReply({
                content: '❌ Failed to create the quote image.'
            });
        }
    }
};
