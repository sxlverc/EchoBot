const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const getConfig = require('../configHelper');

const execAsync = promisify(exec);

// Tenor GIF URL (direct media URL)
const BRICK_GIF_URL = 'https://media1.tenor.com/m/rwnZEvUpxuAAAAAd/%D0%BA%D0%BE%D1%82-cat.gif';
const BASE_GIF_PATH = path.join(__dirname, '../assets/brick_base.gif');
const ASSETS_DIR = path.join(__dirname, '../assets');
const BRICK_AVATAR_SIZE = 120;
const BRICK_AVATAR_X = 236;
const BRICK_AVATAR_Y = 500;

// Stale temp cleanup settings for generated brick files only.
const STALE_BRICK_TEMP_MS = 10 * 60 * 1000; // 10 minutes
const BRICK_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let cleanupIntervalStarted = false;

// Cooldown tracking (userId -> timestamp)
const cooldowns = new Map();
const COOLDOWN_DURATION = 60000; // 1 minute

function isBrickTempFile(fileName) {
    return (
        /^avatar_\d+\.png$/.test(fileName) ||
        /^avatar_bg_\d+\.png$/.test(fileName) ||
        /^brick_\d+\.gif$/.test(fileName)
    );
}

function isBrickTempDir(dirName) {
    return /^(frames|output)_\d+$/.test(dirName);
}

function cleanupStaleBrickAssets(maxAgeMs = STALE_BRICK_TEMP_MS) {
    try {
        if (!fs.existsSync(ASSETS_DIR)) return;

        const now = Date.now();
        for (const entry of fs.readdirSync(ASSETS_DIR)) {
            const entryPath = path.join(ASSETS_DIR, entry);
            let stats;

            try {
                stats = fs.statSync(entryPath);
            } catch {
                continue;
            }

            const ageMs = now - stats.mtimeMs;
            if (ageMs < maxAgeMs) continue;

            if (stats.isFile() && isBrickTempFile(entry)) {
                fs.unlinkSync(entryPath);
                continue;
            }

            if (stats.isDirectory() && isBrickTempDir(entry)) {
                fs.rmSync(entryPath, { recursive: true, force: true });
            }
        }
    } catch (error) {
        console.error('Error cleaning stale brick assets:', error);
    }
}

function startPeriodicBrickCleanup() {
    if (cleanupIntervalStarted) return;
    cleanupIntervalStarted = true;

    // Run an immediate pass and then continue periodically.
    cleanupStaleBrickAssets();
    setInterval(() => cleanupStaleBrickAssets(), BRICK_CLEANUP_INTERVAL_MS);
}

startPeriodicBrickCleanup();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('brick')
        .setDescription('flip u dud!')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('victim')
                .setRequired(true)),
    
    async execute(interaction) {
        // Defensive cleanup in case a previous run crashed mid-process.
        cleanupStaleBrickAssets();

        // Check cooldown
        const userId = interaction.user.id;
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + COOLDOWN_DURATION;
            if (Date.now() < expirationTime) {
                const timeLeft = Math.round((expirationTime - Date.now()) / 1000);
                await interaction.reply({
                    content: `⏳ Please wait ${timeLeft} more second(s) before using this command again.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }
        
        await interaction.deferReply();
        
        try {
            const targetUser = interaction.options.getUser('user');
            // Force PNG format and use forceStatic to get first frame of animated avatars
            const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
            
            const tempId = interaction.id;
            const avatarPath = path.join(__dirname, `../assets/avatar_${tempId}.png`);
            const avatarBgPath = path.join(__dirname, `../assets/avatar_bg_${tempId}.png`);
            const outputPath = path.join(__dirname, `../assets/brick_${tempId}.gif`);
            
            // Download avatar
            const response = await axios.get(avatarURL, { responseType: 'arraybuffer' });
            fs.writeFileSync(avatarPath, response.data);
            
            // Add black background to handle transparency, then resize for visible placement on 640x640 base GIF
            await execAsync(`convert "${avatarPath}" -background black -alpha remove -alpha off -resize ${BRICK_AVATAR_SIZE}x${BRICK_AVATAR_SIZE} "${avatarBgPath}"`, { timeout: 5000 });
            
            // Process GIF - split, process in batch, reassemble
            const framesDir = path.join(__dirname, `../assets/frames_${tempId}`);
            fs.mkdirSync(framesDir, { recursive: true });
            
            // Split into frames (preserve transparency)
            await execAsync(`convert "${BASE_GIF_PATH}" -coalesce -background none "${framesDir}/frame_%03d.png"`, { timeout: 10000 });
            
            // Get frame count to determine explosion start
            const frames = fs.readdirSync(framesDir).filter(f => f.startsWith('frame_')).sort();
            const totalFrames = frames.length;
            const explosionStartFrame = 42; // Avatar disappears at frame 42
            
            // Process frames in parallel batches for speed
            const batchSize = 10;
            const outputFramesDir = path.join(__dirname, `../assets/output_${tempId}`);
            fs.mkdirSync(outputFramesDir, { recursive: true });
            
            for (let i = 0; i < totalFrames; i += batchSize) {
                const batchPromises = [];
                const end = Math.min(i + batchSize, totalFrames);
                
                for (let j = i; j < end; j++) {
                    const framePath = path.join(framesDir, frames[j]);
                    const outputFramePath = path.join(outputFramesDir, frames[j]);
                    
                    if (j < explosionStartFrame) {
                        // Add avatar to frames before explosion (positioned over cat face area)
                        batchPromises.push(
                            execAsync(`convert "${framePath}" "${avatarBgPath}" -gravity northwest -geometry +${BRICK_AVATAR_X}+${BRICK_AVATAR_Y} -composite "${outputFramePath}"`, { timeout: 5000 })
                        );
                    } else {
                        // Copy frames without avatar (explosion frames)
                        batchPromises.push(
                            execAsync(`cp "${framePath}" "${outputFramePath}"`, { timeout: 5000 })
                        );
                    }
                }
                
                await Promise.all(batchPromises);
            }
            
            // Reassemble frames into GIF (preserve transparency)
            await execAsync(`convert -dispose previous -delay 3 -loop 0 "${outputFramesDir}/frame_*.png" -layers optimize "${outputPath}"`, { timeout: 15000 });
            
            // Send the result
            const attachment = new AttachmentBuilder(outputPath, { name: 'bricked.gif' });
            await interaction.editReply({
                content: ``,
                files: [attachment]
            });
            
            // Set cooldown
            cooldowns.set(userId, Date.now());
            
            // Clean up temp files
            setTimeout(() => {
                try {
                    if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
                    if (fs.existsSync(avatarBgPath)) fs.unlinkSync(avatarBgPath);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    // Clean up frames directories
                    const framesDir = path.join(__dirname, `../assets/frames_${tempId}`);
                    const outputFramesDir = path.join(__dirname, `../assets/output_${tempId}`);
                    
                    [framesDir, outputFramesDir].forEach(dir => {
                        if (fs.existsSync(dir)) {
                            fs.readdirSync(dir).forEach(file => {
                                fs.unlinkSync(path.join(dir, file));
                            });
                            fs.rmdirSync(dir);
                        }
                    });
                } catch (e) {
                    console.error('Error deleting temp files:', e);
                }
            }, 5000);
            
        } catch (error) {
            console.error('Error creating brick GIF:', error);
            await interaction.editReply({
                content: '❌ Failed to create the brick GIF. The cat parried the command.'
            });
        }
    }
};
