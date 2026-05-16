const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/messageData.json');

function loadData() {
    try {
        if (!fs.existsSync(dataPath)) {
            return { messages: {} };
        }
        const data = fs.readFileSync(dataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading message data:', error);
        return { messages: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving message data:', error);
    }
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function chunkText(text, maxLength = 1024) {
    if (!text || text.length <= maxLength) return [text || ''];

    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLength) {
        // Prefer splitting at a newline for cleaner formatting.
        let splitIndex = remaining.lastIndexOf('\n', maxLength);
        if (splitIndex <= 0) {
            splitIndex = maxLength;
        }

        chunks.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex).trimStart();
    }

    if (remaining.length > 0) {
        chunks.push(remaining);
    }

    return chunks;
}

async function persistMessageMutationWithRollback(data, messageName, mutationFn, applyFn) {
    const current = data.messages[messageName];
    if (!current) {
        throw new Error(`Message "${messageName}" not found.`);
    }

    const previousSnapshot = deepClone(current);
    mutationFn(current);
    saveData(data);

    try {
        await applyFn(current);
    } catch (error) {
        data.messages[messageName] = previousSnapshot;
        saveData(data);
        throw error;
    }
}

async function updateMessageEmbed(guild, messageData, message) {
    const embed = new EmbedBuilder()
        .setTitle(messageData.title || '📄 Information')
        .setColor(messageData.color || 0x5865F2);

    if (messageData.header) {
        embed.setDescription(messageData.header);
    }

    // Build items text
    if (messageData.items && messageData.items.length > 0) {
        let itemsText = '';
        const fields = [];

        const pushTextChunk = (textChunk) => {
            if (!textChunk) return;

            if ((itemsText + textChunk).length > 1024) {
                if (itemsText) {
                    fields.push({ name: '\u200B', value: itemsText });
                    itemsText = textChunk;
                } else {
                    // A single item can exceed 1024 chars; split it into field-safe chunks.
                    const subChunks = chunkText(textChunk, 1024);
                    for (const subChunk of subChunks) {
                        fields.push({ name: '\u200B', value: subChunk });
                    }
                }
            } else {
                itemsText += textChunk;
            }
        };
        
        messageData.items.forEach((item, index) => {
            const number = index + 1;
            const emoji = item.emoji ? `${item.emoji} ` : '';
            
            let itemText = '';
            if (item.title && item.description) {
                itemText = `${emoji}**${number}. ${item.title}**\n${item.description}\n\n`;
            } else if (item.title) {
                itemText = `${emoji}**${number}. ${item.title}**\n\n`;
            } else if (item.description) {
                itemText = `${emoji}**${number}.** ${item.description}\n\n`;
            }

            const itemChunks = chunkText(itemText, 1024);
            itemChunks.forEach(pushTextChunk);
        });
        
        // Add remaining items
        if (itemsText) {
            fields.push({ name: '\u200B', value: itemsText });
        }
        
        // If there's a header, add items as fields, otherwise use description for first chunk
        if (messageData.header) {
            embed.addFields(...fields);
        } else {
            if (fields.length > 0) {
                embed.setDescription(fields[0].value);
                if (fields.length > 1) {
                    embed.addFields(...fields.slice(1));
                }
            }
        }
    }
    // Don't show "no items added yet" - allow messages to be purely informational

    if (messageData.footer) {
        embed.setFooter({ text: messageData.footer });
    }

    if (messageData.timestamp) {
        embed.setTimestamp();
    }

    await message.edit({ embeds: [embed] });
}

async function handleModalSubmit(interaction) {
    const data = loadData();
    const customId = interaction.customId;

    try {
        if (customId.startsWith('create_')) {
            // Handle create message modal
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const encodedData = customId.substring(7); // Remove 'create_' prefix
                const params = JSON.parse(Buffer.from(encodedData, 'base64').toString());
                const { name, channelId } = params;
                const channel = await interaction.guild.channels.fetch(channelId);
                
                // Check if bot can send messages in this channel
                const botMember = interaction.guild.members.me;
                if (!channel.permissionsFor(botMember).has('SendMessages')) {
                    return await interaction.editReply({
                        content: `❌ I don't have permission to send messages in ${channel}.`
                    });
                }
                
                const title = interaction.fields.getTextInputValue('messageTitle');
                const header = interaction.fields.getTextInputValue('messageHeader') || '';
                const footer = interaction.fields.getTextInputValue('messageFooter') || '';
                const colorInput = interaction.fields.getTextInputValue('messageColor') || '';
                
                let color = 0x5865F2; // Default color
                if (colorInput) {
                    // Try to parse color
                    if (colorInput.startsWith('#')) {
                        color = parseInt(colorInput.slice(1), 16);
                    } else if (colorInput.startsWith('0x')) {
                        color = parseInt(colorInput, 16);
                    } else {
                        color = parseInt(colorInput, 10) || color;
                    }
                }

                // Create the embed
                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setColor(color);

                if (header) embed.setDescription(header);
                if (footer) embed.setFooter({ text: footer });

                // Send the message
                const message = await channel.send({ embeds: [embed] });

                // Save to data
                data.messages[name] = {
                    channelId: channel.id,
                    messageId: message.id,
                    title,
                    header,
                    footer,
                    color,
                    items: []
                };
                saveData(data);

                await interaction.editReply({
                    content: `✅ Created message **${name}** in ${channel}`
                });
            } catch (error) {
                console.error('Error in create modal handler:', error);
                return await interaction.editReply({
                    content: `❌ An error occurred: ${error.message}`
                });
            }

        } else if (customId.startsWith('additem_')) {
            // Handle add item modal
            try {
                const encodedData = customId.substring(8); // Remove 'additem_' prefix
                const params = JSON.parse(Buffer.from(encodedData, 'base64').toString());
                const { name: messageName, position, emoji } = params;
                const messageData = data.messages[messageName];
                
                if (!messageData) {
                    return await interaction.reply({
                        content: `❌ Message "${messageName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const title = interaction.fields.getTextInputValue('itemTitle');
                const description = interaction.fields.getTextInputValue('itemDescription');
                
                const item = {
                    title,
                    description,
                    emoji: emoji !== 'none' ? emoji : null
                };

                const normalizedPosition = (position === 'end' || position === null || position === undefined)
                    ? 'end'
                    : parseInt(position) - 1;

                if (normalizedPosition !== 'end' && (isNaN(normalizedPosition) || normalizedPosition < 0)) {
                    return await interaction.reply({
                        content: `❌ Invalid position: ${position}`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                console.log('Sending immediate reply');
                await interaction.reply({
                    content: `✅ Processing your request...`,
                    flags: MessageFlags.Ephemeral
                });

                console.log('Updating message embed');
                // Update the message, but persist first with rollback protection so
                // message data doesn't desync if another listener crashes the process.
                await persistMessageMutationWithRollback(
                    data,
                    messageName,
                    (updatedMessageData) => {
                        if (normalizedPosition === 'end') {
                            updatedMessageData.items.push(item);
                        } else {
                            updatedMessageData.items.splice(normalizedPosition, 0, item);
                        }

                        // Auto-update footer timestamp if it contains "Last updated"
                        if (updatedMessageData.footer && updatedMessageData.footer.includes('Last updated')) {
                            const now = new Date();
                            const day = String(now.getDate()).padStart(2, '0');
                            const month = String(now.getMonth() + 1).padStart(2, '0');
                            const year = now.getFullYear();
                            updatedMessageData.footer = `Last updated: ${day}.${month}.${year} (dd.MM.yyyy)`;
                        }
                    },
                    async (updatedMessageData) => {
                        const channel = await interaction.guild.channels.fetch(updatedMessageData.channelId);
                        const message = await channel.messages.fetch(updatedMessageData.messageId);
                        await updateMessageEmbed(interaction.guild, updatedMessageData, message);
                    }
                );

                console.log('Editing reply with success');
                await interaction.editReply({
                    content: `✅ Added item "${title}" to **${messageName}**`
                });
                console.log('Additem modal completed successfully');
            } catch (error) {
                console.error('Error in additem modal handler:', error);
                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply({
                            content: `❌ An error occurred: ${error.message}`
                        });
                    } else {
                        await interaction.reply({
                            content: `❌ An error occurred: ${error.message}`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } catch (e) {
                    console.error('Failed to send error reply:', e);
                }
            }

        } else if (customId.startsWith('edititem_')) {
            // Handle edit item modal
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const encodedData = customId.substring(9); // Remove 'edititem_' prefix
                const params = JSON.parse(Buffer.from(encodedData, 'base64').toString());
                const { name: messageName, number: itemNumber, emoji } = params;
                const messageData = data.messages[messageName];
                
                if (!messageData) {
                    return await interaction.editReply({
                        content: `❌ Message "${messageName}" not found.`
                    });
                }

                const num = parseInt(itemNumber) - 1;
                if (num < 0 || num >= messageData.items.length) {
                    return await interaction.editReply({
                        content: `❌ Item ${itemNumber} does not exist.`
                    });
                }

                const title = interaction.fields.getTextInputValue('itemTitle');
                const description = interaction.fields.getTextInputValue('itemDescription');
                
                await persistMessageMutationWithRollback(
                    data,
                    messageName,
                    (updatedMessageData) => {
                        updatedMessageData.items[num] = {
                            title,
                            description,
                            emoji: emoji !== 'none' ? emoji : null
                        };

                        // Auto-update footer timestamp if it contains "Last updated"
                        if (updatedMessageData.footer && updatedMessageData.footer.includes('Last updated')) {
                            const now = new Date();
                            const day = String(now.getDate()).padStart(2, '0');
                            const month = String(now.getMonth() + 1).padStart(2, '0');
                            const year = now.getFullYear();
                            updatedMessageData.footer = `Last updated: ${day}.${month}.${year} (dd.MM.yyyy)`;
                        }
                    },
                    async (updatedMessageData) => {
                        const channel = await interaction.guild.channels.fetch(updatedMessageData.channelId);
                        const message = await channel.messages.fetch(updatedMessageData.messageId);
                        await updateMessageEmbed(interaction.guild, updatedMessageData, message);
                    }
                );

                await interaction.editReply({
                    content: `✅ Updated item ${itemNumber} in **${messageName}**`
                });
            } catch (error) {
                console.error('Error in editrule modal handler:', error);
                return await interaction.editReply({
                    content: `❌ An error occurred: ${error.message}`
                });
            }

        } else if (customId.startsWith('edit_')) {
            // Handle edit message modal
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const encodedName = customId.substring(5); // Remove 'edit_' prefix
                const messageName = Buffer.from(encodedName, 'base64').toString();
                const messageData = data.messages[messageName];
                
                if (!messageData) {
                    return await interaction.editReply({
                        content: `❌ Message "${messageName}" not found.`
                    });
                }

                const title = interaction.fields.getTextInputValue('messageTitle');
                const header = interaction.fields.getTextInputValue('messageHeader') || '';
                const footer = interaction.fields.getTextInputValue('messageFooter') || '';
                const colorInput = interaction.fields.getTextInputValue('messageColor') || '';
                
                let color = messageData.color;
                if (colorInput) {
                    if (colorInput.startsWith('#')) {
                        color = parseInt(colorInput.slice(1), 16);
                    } else if (colorInput.startsWith('0x')) {
                        color = parseInt(colorInput, 16);
                    } else {
                        color = parseInt(colorInput, 10) || color;
                    }
                }

                await persistMessageMutationWithRollback(
                    data,
                    messageName,
                    (updatedMessageData) => {
                        updatedMessageData.title = title;
                        updatedMessageData.header = header;
                        updatedMessageData.footer = footer;
                        updatedMessageData.color = color;
                    },
                    async (updatedMessageData) => {
                        const channel = await interaction.guild.channels.fetch(updatedMessageData.channelId);
                        const message = await channel.messages.fetch(updatedMessageData.messageId);
                        await updateMessageEmbed(interaction.guild, updatedMessageData, message);
                    }
                );

                await interaction.editReply({
                    content: `✅ Updated settings for **${messageName}**`
                });
            } catch (error) {
                console.error('Error in edit modal handler:', error);
                return await interaction.editReply({
                    content: `❌ An error occurred: ${error.message}`
                });
            }
        }

    } catch (error) {
        console.error('Error handling message modal:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('message')
        .setDescription('Manage embed messages (rules, announcements, info, etc.)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new embed message')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to post the message')
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Unique name for this message')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('additem')
                .setDescription('Add an item/section to a message')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Message name')
                        .setAutocomplete(true)
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('Optional emoji for this item')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option
                        .setName('position')
                        .setDescription('Position to insert at (1 = first). Leave empty to add at end.')
                        .setMinValue(1)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edititem')
                .setDescription('Edit an existing item')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Message name')
                        .setAutocomplete(true)
                        .setRequired(true))
                .addIntegerOption(option =>
                    option
                        .setName('number')
                        .setDescription('Item number to edit')
                        .setMinValue(1)
                        .setRequired(true))
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('New emoji')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('removeitem')
                .setDescription('Remove an item from a message')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Message name')
                        .setAutocomplete(true)
                        .setRequired(true))
                .addIntegerOption(option =>
                    option
                        .setName('number')
                        .setDescription('Item number to remove')
                        .setMinValue(1)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reorder')
                .setDescription('Move an item to a different position')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Message name')
                        .setAutocomplete(true)
                        .setRequired(true))
                .addIntegerOption(option =>
                    option
                        .setName('from')
                        .setDescription('Current item number')
                        .setMinValue(1)
                        .setRequired(true))
                .addIntegerOption(option =>
                    option
                        .setName('to')
                        .setDescription('New position')
                        .setMinValue(1)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit message settings (title, header, color, footer)')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Message name')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a message')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Message name')
                        .setAutocomplete(true)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all messages'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('refresh')
                .setDescription('Refresh a message display')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Message name')
                        .setAutocomplete(true)
                        .setRequired(true))),

    async autocomplete(interaction) {
        const data = loadData();
        const focusedValue = interaction.options.getFocused();
        const choices = Object.keys(data.messages);
        const filtered = choices.filter(choice => 
            choice.toLowerCase().includes(focusedValue.toLowerCase())
        );
        await interaction.respond(
            filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
        );
    },

    async execute(interaction) {
        const data = loadData();
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create': {
                const channel = interaction.options.getChannel('channel');
                const name = interaction.options.getString('name');

                if (data.messages[name]) {
                    await interaction.reply({
                        content: `❌ A message named "${name}" already exists.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Show modal for multi-line input
                const modal = new ModalBuilder()
                    .setCustomId(`create_${Buffer.from(JSON.stringify({ name, channelId: channel.id })).toString('base64')}`)
                    .setTitle('Create Message');

                const titleInput = new TextInputBuilder()
                    .setCustomId('messageTitle')
                    .setLabel('Message Title')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., Server Rules (emojis supported)')
                    .setRequired(false)
                    .setMaxLength(256);

                const headerInput = new TextInputBuilder()
                    .setCustomId('messageHeader')
                    .setLabel('Header Text (multi-line supported)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Optional header text that appears above the items...')
                    .setRequired(false)
                    .setMaxLength(2048);

                const footerInput = new TextInputBuilder()
                    .setCustomId('messageFooter')
                    .setLabel('Footer Text (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., Last updated...')
                    .setRequired(false)
                    .setMaxLength(2048);

                const colorInput = new TextInputBuilder()
                    .setCustomId('messageColor')
                    .setLabel('Embed Color (hex format)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('#5865F2')
                    .setValue('#5865F2')
                    .setRequired(false)
                    .setMaxLength(7);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(headerInput),
                    new ActionRowBuilder().addComponents(footerInput),
                    new ActionRowBuilder().addComponents(colorInput)
                );

                await interaction.showModal(modal);
                break;
            }

            case 'additem': {
                const messageName = interaction.options.getString('message');
                const emoji = interaction.options.getString('emoji');
                const position = interaction.options.getInteger('position');

                const messageData = data.messages[messageName];
                if (!messageData) {
                    await interaction.reply({
                        content: `❌ Message "${messageName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Show modal for multi-line input
                const modal = new ModalBuilder()
                    .setCustomId(`additem_${Buffer.from(JSON.stringify({ name: messageName, position: position || 'end', emoji: emoji || 'none' })).toString('base64')}`)
                    .setTitle('Add Item');

                const titleInput = new TextInputBuilder()
                    .setCustomId('itemTitle')
                    .setLabel('Item Title')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., Respect Each Other')
                    .setRequired(true)
                    .setMaxLength(256);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('itemDescription')
                    .setLabel('Item Description (supports multiple lines)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Press Shift+Enter or Enter for new lines...')
                    .setRequired(false)
                    .setMaxLength(1024);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(descriptionInput)
                );

                await interaction.showModal(modal);
                break;
            }

            case 'edititem': {
                const messageName = interaction.options.getString('message');
                const itemNumber = interaction.options.getInteger('number');
                const newEmoji = interaction.options.getString('emoji');

                const messageData = data.messages[messageName];
                if (!messageData) {
                    await interaction.reply({
                        content: `❌ Message "${messageName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (itemNumber < 1 || itemNumber > messageData.items.length) {
                    await interaction.reply({
                        content: `❌ Item ${itemNumber} does not exist. This message has ${messageData.items.length} item(s).`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const item = messageData.items[itemNumber - 1];

                // Show modal pre-filled with current values
                const modal = new ModalBuilder()
                    .setCustomId(`edititem_${Buffer.from(JSON.stringify({ name: messageName, number: itemNumber, emoji: newEmoji || item.emoji || 'none' })).toString('base64')}`)
                    .setTitle(`Edit Item ${itemNumber}`);

                const titleInput = new TextInputBuilder()
                    .setCustomId('itemTitle')
                    .setLabel('Item Title')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., Respect Each Other')
                    .setValue(item.title || '')
                    .setRequired(true)
                    .setMaxLength(256);

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('itemDescription')
                    .setLabel('Item Description (supports multiple lines)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Press Shift+Enter or Enter for new lines...')
                    .setValue(item.description || '')
                    .setRequired(false)
                    .setMaxLength(1024);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(descriptionInput)
                );

                await interaction.showModal(modal);
                break;
            }

            case 'removeitem': {
                const messageName = interaction.options.getString('message');
                const itemNumber = interaction.options.getInteger('number');

                const messageData = data.messages[messageName];
                if (!messageData) {
                    await interaction.reply({
                        content: `❌ Message "${messageName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (itemNumber < 1 || itemNumber > messageData.items.length) {
                    await interaction.reply({
                        content: `❌ Item ${itemNumber} does not exist. This message has ${messageData.items.length} item(s).`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const removedItem = messageData.items[itemNumber - 1];

                try {
                    await persistMessageMutationWithRollback(
                        data,
                        messageName,
                        (updatedMessageData) => {
                            updatedMessageData.items.splice(itemNumber - 1, 1);

                            // Auto-update footer timestamp if it contains "Last updated"
                            if (updatedMessageData.footer && updatedMessageData.footer.includes('Last updated')) {
                                const now = new Date();
                                const day = String(now.getDate()).padStart(2, '0');
                                const month = String(now.getMonth() + 1).padStart(2, '0');
                                const year = now.getFullYear();
                                updatedMessageData.footer = `Last updated: ${day}.${month}.${year} (dd.MM.yyyy)`;
                            }
                        },
                        async (updatedMessageData) => {
                            const channel = await interaction.guild.channels.fetch(updatedMessageData.channelId);
                            const message = await channel.messages.fetch(updatedMessageData.messageId);
                            await updateMessageEmbed(interaction.guild, updatedMessageData, message);
                        }
                    );

                    await interaction.reply({
                        content: `✅ Removed item ${itemNumber} (**${removedItem.title}**) from **${messageName}**`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to remove item: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }

            case 'reorder': {
                const messageName = interaction.options.getString('message');
                const fromPosition = interaction.options.getInteger('from');
                const toPosition = interaction.options.getInteger('to');

                const messageData = data.messages[messageName];
                if (!messageData) {
                    await interaction.reply({
                        content: `❌ Message "${messageName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (fromPosition < 1 || fromPosition > messageData.items.length) {
                    await interaction.reply({
                        content: `❌ Item ${fromPosition} does not exist. This message has ${messageData.items.length} item(s).`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (toPosition < 1 || toPosition > messageData.items.length) {
                    await interaction.reply({
                        content: `❌ Invalid target position ${toPosition}. Must be between 1 and ${messageData.items.length}.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (fromPosition === toPosition) {
                    await interaction.reply({
                        content: '❌ Item is already at that position.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const movedItem = messageData.items[fromPosition - 1];

                try {
                    await persistMessageMutationWithRollback(
                        data,
                        messageName,
                        (updatedMessageData) => {
                            const [item] = updatedMessageData.items.splice(fromPosition - 1, 1);
                            updatedMessageData.items.splice(toPosition - 1, 0, item);

                            // Auto-update footer timestamp if it contains "Last updated"
                            if (updatedMessageData.footer && updatedMessageData.footer.includes('Last updated')) {
                                const now = new Date();
                                const day = String(now.getDate()).padStart(2, '0');
                                const month = String(now.getMonth() + 1).padStart(2, '0');
                                const year = now.getFullYear();
                                updatedMessageData.footer = `Last updated: ${day}.${month}.${year} (dd.MM.yyyy)`;
                            }
                        },
                        async (updatedMessageData) => {
                            const channel = await interaction.guild.channels.fetch(updatedMessageData.channelId);
                            const message = await channel.messages.fetch(updatedMessageData.messageId);
                            await updateMessageEmbed(interaction.guild, updatedMessageData, message);
                        }
                    );

                    await interaction.reply({
                        content: `✅ Moved **${movedItem.title}** from position ${fromPosition} to ${toPosition} in **${messageName}**`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to reorder item: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }

            case 'edit': {
                const messageName = interaction.options.getString('message');

                const messageData = data.messages[messageName];
                if (!messageData) {
                    await interaction.reply({
                        content: `❌ Message "${messageName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Show modal pre-filled with current values
                const modal = new ModalBuilder()
                    .setCustomId(`edit_${Buffer.from(messageName).toString('base64')}`)
                    .setTitle('Edit Message');

                const titleInput = new TextInputBuilder()
                    .setCustomId('messageTitle')
                    .setLabel('Message Title')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., 📜 Server Rules')
                    .setValue(messageData.title || '📜 Server Rules')
                    .setRequired(false)
                    .setMaxLength(256);

                const headerInput = new TextInputBuilder()
                    .setCustomId('messageHeader')
                    .setLabel('Header Text (multi-line supported)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Optional header text that appears above the items...')
                    .setValue(messageData.header || '')
                    .setRequired(false)
                    .setMaxLength(2048);

                const footerInput = new TextInputBuilder()
                    .setCustomId('messageFooter')
                    .setLabel('Footer Text (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., Last updated...')
                    .setValue(messageData.footer || '')
                    .setRequired(false)
                    .setMaxLength(2048);

                const colorInput = new TextInputBuilder()
                    .setCustomId('messageColor')
                    .setLabel('Embed Color (hex format)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('#5865F2')
                    .setValue('#' + (messageData.color || 0x5865F2).toString(16).padStart(6, '0'))
                    .setRequired(false)
                    .setMaxLength(7);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(headerInput),
                    new ActionRowBuilder().addComponents(footerInput),
                    new ActionRowBuilder().addComponents(colorInput)
                );

                await interaction.showModal(modal);
                break;
            }

            case 'delete': {
                const messageName = interaction.options.getString('message');
                const messageData = data.messages[messageName];

                if (!messageData) {
                    await interaction.reply({
                        content: `❌ Message "${messageName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(messageData.channelId);
                    const message = await channel.messages.fetch(messageData.messageId);
                    await message.delete();
                } catch (error) {
                    // Message might already be deleted
                }

                delete data.messages[messageName];
                saveData(data);

                await interaction.reply({
                    content: `✅ Deleted message **${messageName}**`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'list': {
                if (Object.keys(data.messages).length === 0) {
                    await interaction.reply({
                        content: '📝 No messages configured.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const list = Object.entries(data.messages).map(([name, msg]) => {
                    const itemCount = msg.items.length;
                    return `**${name}** - ${itemCount} item(s)\n<#${msg.channelId}> | [Jump to message](https://discord.com/channels/${interaction.guildId}/${msg.channelId}/${msg.messageId})`;
                }).join('\n\n');

                await interaction.reply({
                    content: `📄 **Messages:**\n\n${list}`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'refresh': {
                const messageName = interaction.options.getString('message');
                const messageData = data.messages[messageName];

                if (!messageData) {
                    await interaction.reply({
                        content: `❌ Message "${messageName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(messageData.channelId);
                    const message = await channel.messages.fetch(messageData.messageId);

                    await updateMessageEmbed(interaction.guild, messageData, message);

                    await interaction.reply({
                        content: `✅ Refreshed message **${messageName}**`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to refresh message: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }
        }
    },
    handleModalSubmit
};
