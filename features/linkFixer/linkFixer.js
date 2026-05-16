const { Events } = require('discord.js');
const getConfig = require('../../configHelper');

// Mapping of social media domains to their fixed versions
const fixers = {
    // Twitter/X
    'twitter.com': 'vxtwitter.com',
    'x.com': 'fixupx.com',
    'mobile.twitter.com': 'vxtwitter.com',
    'mobile.x.com': 'fixupx.com',

    // TikTok
    'tiktok.com': 'vm.tiktok.com',
    'www.tiktok.com': 'vm.tiktok.com',
    'm.tiktok.com': 'vm.tiktok.com',
    'vt.tiktok.com': 'vm.tiktok.com',
    'vm.tiktok.com': 'vm.tiktok.com',

    // Instagram
    'www.instagram.com': 'www.kkinstagram.com',
    'instagram.com': 'www.kkinstagram.com',
};

// Regex to match URLs (not in angle brackets)
const urlRegex = /(?<!<)https?:\/\/(www\.)?(twitter\.com|x\.com|mobile\.twitter\.com|mobile\.x\.com|tiktok\.com|www\.tiktok\.com|m\.tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|instagram\.com|www\.instagram\.com)\/[^\s<>]+(?!>)/gi;

function isStatusUrl(url) {
    const path = url.pathname.toLowerCase();
    return path.includes('/status/');
}

function isTikTokVideoUrl(url) {
    const path = url.pathname.toLowerCase();

    // Standard long-form TikTok video links.
    if (path.includes('/video/')) return true;

    // TikTok short links, e.g. /ZSEabc123
    if (url.hostname === 'vt.tiktok.com' || url.hostname === 'vm.tiktok.com') {
        return path.length > 1;
    }

    return false;
}

function isInstagramPostUrl(url) {
    const path = url.pathname.toLowerCase();
    return path.includes('/p/') || path.includes('/reel/') || path.includes('/tv/');
}

function shouldFixUrl(url) {
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
        return isStatusUrl(url);
    }

    if (hostname.includes('tiktok.com')) {
        return isTikTokVideoUrl(url);
    }

    if (hostname.includes('instagram.com')) {
        return isInstagramPostUrl(url);
    }

    return false;
}

module.exports = {
    register: (client) => {
        client.on(Events.MessageCreate, async message => {
            // Ignore bot messages
            if (message.author.bot) return;
            if (!message.guild) return;

            const config = getConfig(message.guild.id);
            
            // Check if feature is disabled
            if (config.features.linkFixer && config.features.linkFixer.enabled === false) {
                return;
            }
            
            // Find all social media links in the message
            const matches = [...message.content.matchAll(urlRegex)];
            
            if (matches.length === 0) return;
            
            // Replace URLs with fixed versions
            const fixedLinks = [];
            const seenLinks = new Set();
            
            for (const match of matches) {
                const originalUrl = match[0];
                
                // Skip if we've already processed this exact URL
                if (seenLinks.has(originalUrl)) continue;
                seenLinks.add(originalUrl);
                
                try {
                    const url = new URL(originalUrl);
                    const domain = url.hostname.toLowerCase();

                    // Only convert post/video links. Profile and other pages are left untouched.
                    if (!shouldFixUrl(url)) {
                        continue;
                    }
                    
                    if (fixers[domain]) {
                        const fixedDomain = fixers[domain];
                        const fixedUrl = originalUrl.replace(domain, fixedDomain);
                        fixedLinks.push(fixedUrl);
                    }
                } catch (error) {
                    // Invalid URL, skip
                    continue;
                }
            }
            
            if (fixedLinks.length === 0) return;
            
            // Try to delete the original message
            const botMember = message.guild.members.me;
            const channel = message.channel;
            let deletionSuccess = false;
            let noPermission = false;
            
            if (botMember.permissionsIn(channel).has('ManageMessages')) {
                try {
                    await message.delete();
                    deletionSuccess = true;
                    console.log('Deleted original message with Twitter/X link:', message.id);
                } catch (err) {
                    console.error('Error deleting message:', err.message);
                    // Continue and send fixed link anyway
                }
            } else {
                noPermission = true;
                console.warn('Missing ManageMessages permission to delete link in', channel.name);
            }
            
            // Send fixed links mentioning the user
            // Include a note if deletion failed
            let content = `${message.author} 🔁 Fixed link:\n${fixedLinks.join('\n')}`;
            if (!deletionSuccess) {
                if (noPermission) {
                    content += '\n\n_Note: I need "Manage Messages" permission to delete the original._';
                } else {
                    content += '\n\n_Note: Couldn\'t delete the original message._';
                }
            }
            
            try {
                await channel.send({
                    content,
                    allowedMentions: { users: [message.author.id] }
                });
            } catch (err) {
                console.error('Error sending fixed link:', err.message);
            }
        });
        
        console.log('Social media link fixer initialized');
    }
};
