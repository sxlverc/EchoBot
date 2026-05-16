const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const { getGuildConfig, setGuildConfig } = require('../configStore');

function isDirectImageUrl(url) {
    if (typeof url !== 'string' || url.trim().length === 0) return false;

    const cleanedUrl = url.split('?')[0].toLowerCase();
    return /\.(gif|png|jpe?g|webp)$/.test(cleanedUrl);
}

function decodeHtmlEntities(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

async function resolveEmbedImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    if (isDirectImageUrl(url)) return url;

    try {
        const response = await fetch(url, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 AstroBot/1.0'
            }
        });

        if (!response.ok) return null;

        const finalUrl = response.url;
        const contentType = response.headers.get('content-type') || '';

        if (isDirectImageUrl(finalUrl) || contentType.startsWith('image/')) {
            return finalUrl;
        }

        if (!contentType.includes('text/html')) return null;

        const html = await response.text();
        const metaRegexes = [
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
            /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
        ];

        for (const regex of metaRegexes) {
            const match = html.match(regex);
            if (!match?.[1]) continue;

            const candidate = decodeHtmlEntities(match[1].trim());
            if (isDirectImageUrl(candidate)) {
                return candidate;
            }
        }
    } catch (error) {
        console.warn('Failed to resolve welcome gif URL:', error.message);
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configwelcome')
        .setDescription('Configure welcome message settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable welcome system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable welcome system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('gif')
                .setDescription('Set the welcome GIF URL')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('URL of the welcome GIF')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current welcome configuration'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Send a test welcome embed to the greeting channel'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            const guildId = interaction.guild.id;
            const config = getGuildConfig(guildId);
            
            if (!config.features.welcome) {
                config.features.welcome = {
                    gifUrl: null
                };
            }

            switch (subcommand) {
                case 'enable':
                    config.features.welcome.enabled = true;
                    await interaction.reply({
                        content: '✅ Welcome system **enabled**!',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'disable':
                    config.features.welcome.enabled = false;
                    await interaction.reply({
                        content: '❌ Welcome system **disabled**!',
                        flags: MessageFlags.Ephemeral
                    });
                    break;

                case 'gif': {
                    const url = interaction.options.getString('url');
                    // Basic URL validation
                    try {
                        new URL(url);
                        config.features.welcome.gifUrl = url;
                        const isDirect = isDirectImageUrl(url);
                        await interaction.reply({
                            content: isDirect
                                ? `✅ Welcome GIF URL set!\n${url}`
                                : `✅ Welcome URL set!\n${url}\n\nNote: this is not a direct image link. Astro will try to resolve it to a direct image for the embed. For best reliability, use a URL ending in .gif/.png/.jpg/.webp`,
                            flags: MessageFlags.Ephemeral
                        });
                    } catch {
                        await interaction.reply({
                            content: '❌ Invalid URL provided. Please provide a valid URL.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                    break;
                }

                case 'status': {
                    const currentGifUrl = config.features.welcome.gifUrl;
                    await interaction.reply({
                        content: `**👋 Welcome Configuration**\n\n` +
                                `**System:** ${config.features.welcome.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                                `**GIF URL:** ${currentGifUrl || 'Not set'}`,
                        flags: MessageFlags.Ephemeral
                    });
                    return; // Don't save config for status check
                }

                case 'test': {
                    const greetingChannelId = config.channels.greeting;
                    if (!greetingChannelId) {
                        await interaction.reply({
                            content: '❌ Greeting channel is not configured.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    const greetingChannel = interaction.guild.channels.cache.get(greetingChannelId)
                        || await interaction.guild.channels.fetch(greetingChannelId).catch(() => null);

                    if (!greetingChannel || !greetingChannel.isTextBased()) {
                        await interaction.reply({
                            content: '❌ Greeting channel is not accessible or not text-based.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    const displayName = interaction.member?.displayName || interaction.user.username;
                    const welcomeText = `Hello, ${displayName}! Welcome to the server!`;
                    const configuredGifUrl = config.features.welcome.gifUrl;

                    const embed = new EmbedBuilder()
                        .setDescription(welcomeText)
                        .setColor(0x5865F2)
                        .setFooter({ text: 'Welcome test preview' });

                    let resolved = false;
                    if (configuredGifUrl) {
                        const resolvedGifUrl = await resolveEmbedImageUrl(configuredGifUrl);
                        if (resolvedGifUrl) {
                            embed.setImage(resolvedGifUrl);
                            resolved = true;
                        }
                    }

                    await greetingChannel.send({ embeds: [embed] });

                    await interaction.reply({
                        content: resolved
                            ? '✅ Sent test welcome embed (with GIF) to the greeting channel.'
                            : '✅ Sent test welcome embed to the greeting channel. GIF could not be resolved to a direct image URL.',
                        flags: MessageFlags.Ephemeral
                    });
                    return; // No config changes to save
                }
            }

            // Save guild-specific config
            setGuildConfig(guildId, config);

        } catch (error) {
            console.error('Error configuring welcome settings:', error);
            await interaction.reply({
                content: '❌ Failed to configure welcome settings.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};