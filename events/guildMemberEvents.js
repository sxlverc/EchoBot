const { Events, EmbedBuilder } = require('discord.js');
const getConfig = require('../configHelper');

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
    register: (client) => {
        // Say hello when a user joins

        client.on(Events.GuildMemberAdd, async member => {
            const config = getConfig(member.guild.id);
            // Check if welcome is enabled
            if (!config.features?.welcome?.enabled) return;
            
            // Auto-assign newcomer role
            if (config.roles.newcomer) {
                try {
                    await member.roles.add(config.roles.newcomer);
                } catch (error) {
                    console.error('Error assigning newcomer role:', error);
                }
            }

            const channelId = config.channels.greeting;
            if (!channelId) return;

            const channel = member.guild.channels.cache.get(channelId)
                || await member.guild.channels.fetch(channelId).catch(() => null);
            if (channel) {
                try {
                    const welcomeText = `Hello, ${member.displayName}! Welcome to the server!`;
                    const gifUrl = config.features.welcome.gifUrl;

                    if (gifUrl) {
                        const resolvedGifUrl = await resolveEmbedImageUrl(gifUrl);

                        if (resolvedGifUrl) {
                            const embed = new EmbedBuilder()
                                .setDescription(welcomeText)
                                .setImage(resolvedGifUrl)
                                .setColor(0x5865F2);

                            try {
                                await channel.send({ embeds: [embed] });
                            } catch (embedError) {
                                console.warn('Resolved welcome gif failed in embed, sending text welcome instead:', embedError.message);
                                await channel.send(welcomeText);
                            }
                        } else {
                            console.warn('Could not resolve a direct image URL for welcome gif:', gifUrl);
                            await channel.send(welcomeText);
                        }
                    } else {
                        await channel.send(welcomeText);
                    }
                } catch (error) {
                    console.error('Error sending welcome message:', error);
                }
            }
        });

        // Say goodbye when a user leaves
        client.on(Events.GuildMemberRemove, async member => {
            const config = getConfig(member.guild.id);
            const channel = member.guild.channels.cache.get(config.channels.greeting);
            if (channel) {
                try {
                    await channel.send(`Goodbye, ${member.displayName}! Hope to see you again!`);
                } catch (error) {
                    console.error('Error sending goodbye message:', error);
                }
            }
        });
    }
};
