const { Events, EmbedBuilder, Colors, ChannelType } = require('discord.js');

function register(client) {
    client.on(Events.MessageCreate, async message => {
        // Only log DMs (DM channels)
        if (message.channel.type !== ChannelType.DM) return;
        
        // Don't log bot's own messages
        if (message.author.bot) return;
        
        // Send DMs to specific user (sxlverc)
        const targetUserId = '733693570300641350';
        
        try {
            const targetUser = await client.users.fetch(targetUserId);
            if (!targetUser) return;
            
            // Create embed for DM
            const embed = new EmbedBuilder()
                .setTitle('📬 DM Received')
                .setColor(Colors.Blue)
                .setAuthor({
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL()
                })
                .addFields(
                    { name: 'User', value: `${message.author} (${message.author.id})`, inline: true },
                    { name: 'Sent At', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`, inline: true }
                )
                .setTimestamp();
            
            // Add message content
            if (message.content) {
                const content = message.content.length > 1024 
                    ? message.content.substring(0, 1021) + '...' 
                    : message.content;
                embed.addFields({ name: 'Message', value: content });
            }
            
            // Add attachments info
            if (message.attachments.size > 0) {
                const attachmentList = message.attachments.map(a => `[${a.name}](${a.url})`).join('\n');
                embed.addFields({ 
                    name: `Attachments (${message.attachments.size})`, 
                    value: attachmentList.length > 1024 ? attachmentList.substring(0, 1021) + '...' : attachmentList 
                });
                
                // If there's an image, show it
                const firstImage = message.attachments.find(a => a.contentType?.startsWith('image/'));
                if (firstImage) {
                    embed.setImage(firstImage.url);
                }
            }
            
            // Add stickers info
            if (message.stickers.size > 0) {
                const stickerList = message.stickers.map(s => s.name).join(', ');
                embed.addFields({ name: 'Stickers', value: stickerList });
            }
            
            await targetUser.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error logging DM:', error);
        }
    });
    
    console.log('DM Logger initialized');
}

module.exports = { register };
