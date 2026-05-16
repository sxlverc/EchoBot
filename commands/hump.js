const { SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const getConfig = require('../configHelper');

const execAsync = promisify(exec);
const BASE_GIF_PATH = path.join(__dirname, '../assets/hump_base.gif');

// Cooldown tracking (userId -> timestamp)
const cooldowns = new Map();
const COOLDOWN_DURATION = 60000; // 1 minute

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hump')
        .setDescription('Create the "Oh my goodness gracious" meme with a user\'s avatar')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose avatar to use')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Check if user is admin or has privileged executor role
        if (!config.isPrivilegedExecutor(interaction.member)) {
            await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
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
            const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
            
            // Check if base gif exists
            if (!fs.existsSync(BASE_GIF_PATH)) {
                await interaction.editReply('⚠️ Base gif not found. Please contact the bot administrator.');
                return;
            }
            
            const tempId = interaction.id;
            const avatarPath = path.join(__dirname, `../data/avatar_${tempId}.png`);
            const outputPath = path.join(__dirname, `../data/hump_${tempId}.gif`);
            
            // Download avatar
            const response = await axios.get(avatarURL, { responseType: 'arraybuffer' });
            fs.writeFileSync(avatarPath, response.data);
            
            // Use ImageMagick to overlay the avatar on ALL frames of the gif
            // -coalesce: expands all frames, null: separates the operations, -layers composite: applies to all frames
            // Position at the wall/door area on the right side (lower-middle area where they're humping)
            const command = `convert "${BASE_GIF_PATH}" -coalesce null: \\( "${avatarPath}" -resize 95x95 \\) -gravity southeast -geometry +110+110 -layers composite -layers optimize "${outputPath}"`;
            
            await execAsync(command);
            
            // Send the result
            const attachment = new AttachmentBuilder(outputPath, { name: 'hump.gif' });
            await interaction.editReply({ 
                content: ``,
                files: [attachment] 
            });
            
            // Set cooldown
            cooldowns.set(userId, Date.now());
            
            // Clean up temp files
            setTimeout(() => {
                try {
                    fs.unlinkSync(avatarPath);
                    fs.unlinkSync(outputPath);
                } catch (e) {
                    console.error('Error deleting temp files:', e);
                }
            }, 5000);
            
        } catch (error) {
            console.error('Error creating hump gif:', error);
            await interaction.editReply('❌ Failed to create the meme. Please try again.');
        }
    }
};
