const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/reactionRoles.json');

function loadData() {
    try {
        const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (parsed && typeof parsed === 'object' && parsed.guilds && typeof parsed.guilds === 'object') {
            return parsed;
        }

        // Legacy format compatibility: { panels: { ... } }
        if (parsed && typeof parsed === 'object' && parsed.panels && typeof parsed.panels === 'object') {
            return { guilds: {}, legacyPanels: parsed.panels };
        }

        return { guilds: {} };
    } catch (error) {
        return { guilds: {} };
    }
}

function saveData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function ensureGuildPanels(data, guildId) {
    data.guilds = data.guilds || {};
    data.guilds[guildId] = data.guilds[guildId] || { panels: {} };
    data.guilds[guildId].panels = data.guilds[guildId].panels || {};
    return data.guilds[guildId].panels;
}

function migrateLegacyPanelsForGuild(data, guild) {
    if (!data.legacyPanels || typeof data.legacyPanels !== 'object') return false;

    const guildPanels = ensureGuildPanels(data, guild.id);
    let changed = false;

    for (const [panelName, panelData] of Object.entries(data.legacyPanels)) {
        if (guildPanels[panelName]) continue;
        if (!panelData?.channelId) continue;

        // Only migrate legacy panels that belong to this guild.
        if (!guild.channels.cache.has(panelData.channelId)) continue;

        guildPanels[panelName] = panelData;
        delete data.legacyPanels[panelName];
        changed = true;
    }

    if (Object.keys(data.legacyPanels).length === 0) {
        delete data.legacyPanels;
        changed = true;
    }

    return changed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Manage reaction role system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new reaction role panel')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Name/ID for this panel (unique)')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel to post the panel in')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Title of the embed')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description text for the panel')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('Embed color (hex like #5865F2)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a reaction role to a panel')
                .addStringOption(option =>
                    option.setName('panel')
                        .setDescription('Panel name/ID')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('Emoji to react with')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role to assign')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description for this role option')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a reaction role from a panel')
                .addStringOption(option =>
                    option.setName('panel')
                        .setDescription('Panel name/ID')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('Emoji to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('editrole')
                .setDescription('Edit a specific role in a panel')
                .addStringOption(option =>
                    option.setName('panel')
                        .setDescription('Panel name/ID')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('Emoji of the role to edit')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('newrole')
                        .setDescription('New role to assign (leave empty to keep current)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('New description (leave empty to keep current)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit a reaction role panel')
                .addStringOption(option =>
                    option.setName('panel')
                        .setDescription('Panel name/ID')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('New title')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('New description')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('New color (hex like #5865F2)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a reaction role panel')
                .addStringOption(option =>
                    option.setName('panel')
                        .setDescription('Panel name/ID')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all reaction role panels'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('mode')
                .setDescription('Set the mode for a panel')
                .addStringOption(option =>
                    option.setName('panel')
                        .setDescription('Panel name/ID')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Mode type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Normal - Add/remove roles freely', value: 'normal' },
                            { name: 'Unique - Only one role from this panel at a time', value: 'unique' },
                            { name: 'Verify - Only add roles (no removal)', value: 'verify' },
                            { name: 'Drop - Only remove roles (no adding)', value: 'drop' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('refresh')
                .setDescription('Refresh/update a panel message')
                .addStringOption(option =>
                    option.setName('panel')
                        .setDescription('Panel name/ID')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async autocomplete(interaction) {
        try {
            const data = loadData();
            const guildPanels = ensureGuildPanels(data, interaction.guild.id);
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const choices = Object.keys(guildPanels)
                .filter(name => name.toLowerCase().includes(focusedValue))
                .slice(0, 25)
                .map(name => ({ name, value: name }));
            
            await interaction.respond(choices);
        } catch (error) {
            console.error('Error in reactionrole autocomplete:', error);
            // Return empty array on error
            try {
                await interaction.respond([]);
            } catch (e) {
                // Ignore if already responded
            }
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const data = loadData();
        const guildPanels = ensureGuildPanels(data, interaction.guild.id);

        // Opportunistically migrate any legacy panels that belong to this guild.
        if (migrateLegacyPanelsForGuild(data, interaction.guild)) {
            saveData(data);
        }

        switch (subcommand) {
            case 'create': {
                const name = interaction.options.getString('name');
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title');
                const description = interaction.options.getString('description') || '';
                const colorInput = interaction.options.getString('color');

                if (guildPanels[name]) {
                    await interaction.reply({
                        content: `❌ A panel with the name "${name}" already exists.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Validate color
                let color = 0x5865F2; // Default Discord blurple
                if (colorInput) {
                    const hexMatch = colorInput.match(/^#?([0-9A-Fa-f]{6})$/);
                    if (hexMatch) {
                        color = parseInt(hexMatch[1], 16);
                    } else {
                        await interaction.reply({
                            content: '❌ Invalid color format. Use hex format like #5865F2',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description || 'React to get roles!')
                    .setColor(color)
                    .setFooter({ text: 'React to get your roles' });

                try {
                    const message = await channel.send({ embeds: [embed] });

                    guildPanels[name] = {
                        channelId: channel.id,
                        messageId: message.id,
                        title,
                        description,
                        color,
                        mode: 'normal',
                        roles: {}
                    };

                    saveData(data);

                    await interaction.reply({
                        content: `✅ Created reaction role panel **${name}** in ${channel}\nUse \`/reactionrole add\` to add roles to it.`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to create panel: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }

            case 'add': {
                const panelName = interaction.options.getString('panel');
                const emojiInput = interaction.options.getString('emoji');
                const role = interaction.options.getRole('role');
                const desc = interaction.options.getString('description');

                const panel = guildPanels[panelName];
                if (!panel) {
                    await interaction.reply({
                        content: `❌ Panel "${panelName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Check if bot can manage the role
                const botMember = interaction.guild.members.me;
                if (role.position >= botMember.roles.highest.position) {
                    await interaction.reply({
                        content: `❌ I cannot manage the role ${role} as it's higher than or equal to my highest role.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (role.managed) {
                    await interaction.reply({
                        content: `❌ Cannot assign ${role} as it's managed by an integration.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Parse emoji (could be unicode or custom)
                let emojiId = emojiInput;
                const customEmojiMatch = emojiInput.match(/<a?:(\w+):(\d+)>/);
                if (customEmojiMatch) {
                    emojiId = customEmojiMatch[2];
                }

                // Check if emoji already used
                if (panel.roles[emojiId]) {
                    await interaction.reply({
                        content: `❌ That emoji is already used in this panel for ${interaction.guild.roles.cache.get(panel.roles[emojiId].roleId)}.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(panel.channelId);
                    const message = await channel.messages.fetch(panel.messageId);

                    // Add reaction to message
                    await message.react(emojiInput);

                    // Store role data
                    panel.roles[emojiId] = {
                        roleId: role.id,
                        emoji: emojiInput,
                        description: desc || null
                    };

                    // Update embed
                    await updatePanelEmbed(interaction.guild, panel, message);
                    saveData(data);

                    await interaction.reply({
                        content: `✅ Added ${emojiInput} → ${role} to panel **${panelName}**`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to add reaction role: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }

            case 'remove': {
                const panelName = interaction.options.getString('panel');
                const emojiInput = interaction.options.getString('emoji');

                const panel = guildPanels[panelName];
                if (!panel) {
                    await interaction.reply({
                        content: `❌ Panel "${panelName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                let emojiId = emojiInput;
                const customEmojiMatch = emojiInput.match(/<a?:(\w+):(\d+)>/);
                if (customEmojiMatch) {
                    emojiId = customEmojiMatch[2];
                }

                if (!panel.roles[emojiId]) {
                    await interaction.reply({
                        content: `❌ That emoji is not used in this panel.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(panel.channelId);
                    const message = await channel.messages.fetch(panel.messageId);

                    // Remove reaction from message
                    const reaction = message.reactions.cache.find(r => {
                        if (r.emoji.id) return r.emoji.id === emojiId;
                        return r.emoji.name === emojiInput;
                    });
                    if (reaction) {
                        await reaction.remove();
                    }

                    delete panel.roles[emojiId];

                    // Update embed
                    await updatePanelEmbed(interaction.guild, panel, message);
                    saveData(data);

                    await interaction.reply({
                        content: `✅ Removed ${emojiInput} from panel **${panelName}**`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to remove reaction role: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }

            case 'editrole': {
                const panelName = interaction.options.getString('panel');
                const emojiInput = interaction.options.getString('emoji');
                const newRole = interaction.options.getRole('newrole');
                const newDescription = interaction.options.getString('description');

                const panel = guildPanels[panelName];
                if (!panel) {
                    await interaction.reply({
                        content: `❌ Panel "${panelName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Parse emoji (custom or unicode)
                let emojiId;
                const customEmojiMatch = emojiInput.match(/<a?:([^:]+):(\d+)>/);
                if (customEmojiMatch) {
                    emojiId = customEmojiMatch[2];
                } else {
                    emojiId = emojiInput;
                }

                // Check if emoji exists in panel
                if (!panel.roles[emojiId]) {
                    await interaction.reply({
                        content: `❌ Emoji ${emojiInput} not found in panel **${panelName}**`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const updates = [];

                // Update role if provided
                if (newRole) {
                    // Check if bot can manage the role
                    if (newRole.position >= interaction.guild.members.me.roles.highest.position) {
                        await interaction.reply({
                            content: `❌ I cannot manage ${newRole} because it is higher than or equal to my highest role.`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    // Check if role is managed by integration
                    if (newRole.managed) {
                        await interaction.reply({
                            content: `❌ ${newRole} is managed by an integration and cannot be manually assigned.`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    panel.roles[emojiId].roleId = newRole.id;
                    updates.push(`role → ${newRole}`);
                }

                // Update description if provided
                if (newDescription !== null) {
                    panel.roles[emojiId].description = newDescription;
                    updates.push('description');
                }

                if (updates.length === 0) {
                    await interaction.reply({
                        content: '❌ No changes specified. Provide a new role or description.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(panel.channelId);
                    const message = await channel.messages.fetch(panel.messageId);

                    // Update panel embed
                    await updatePanelEmbed(interaction.guild, panel, message);
                    saveData(data);

                    await interaction.reply({
                        content: `✅ Updated ${emojiInput} in panel **${panelName}**: ${updates.join(', ')}`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to edit role: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }

            case 'edit': {
                const panelName = interaction.options.getString('panel');
                const title = interaction.options.getString('title');
                const description = interaction.options.getString('description');
                const colorInput = interaction.options.getString('color');

                const panel = guildPanels[panelName];
                if (!panel) {
                    await interaction.reply({
                        content: `❌ Panel "${panelName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const updates = [];

                if (title) {
                    panel.title = title;
                    updates.push('title');
                }

                if (description !== null) {
                    panel.description = description;
                    updates.push('description');
                }

                if (colorInput) {
                    const hexMatch = colorInput.match(/^#?([0-9A-Fa-f]{6})$/);
                    if (hexMatch) {
                        panel.color = parseInt(hexMatch[1], 16);
                        updates.push('color');
                    } else {
                        await interaction.reply({
                            content: '❌ Invalid color format. Use hex format like #5865F2',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                }

                if (updates.length === 0) {
                    await interaction.reply({
                        content: '❌ No changes specified.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(panel.channelId);
                    const message = await channel.messages.fetch(panel.messageId);

                    await updatePanelEmbed(interaction.guild, panel, message);
                    saveData(data);

                    await interaction.reply({
                        content: `✅ Updated panel **${panelName}**: ${updates.join(', ')}`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to edit panel: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }

            case 'delete': {
                const panelName = interaction.options.getString('panel');
                const panel = guildPanels[panelName];

                if (!panel) {
                    await interaction.reply({
                        content: `❌ Panel "${panelName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(panel.channelId);
                    const message = await channel.messages.fetch(panel.messageId);
                    await message.delete();
                } catch (error) {
                    // Message might already be deleted
                }

                delete guildPanels[panelName];
                saveData(data);

                await interaction.reply({
                    content: `✅ Deleted panel **${panelName}**`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'list': {
                if (Object.keys(guildPanels).length === 0) {
                    await interaction.reply({
                        content: '📝 No reaction role panels configured.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const list = Object.entries(guildPanels).map(([name, panel]) => {
                    const roleCount = Object.keys(panel.roles).length;
                    const modeText = panel.mode || 'normal';
                    return `**${name}** - ${roleCount} role(s) | Mode: ${modeText}\n<#${panel.channelId}> | [Jump to message](https://discord.com/channels/${interaction.guildId}/${panel.channelId}/${panel.messageId})`;
                }).join('\n\n');

                await interaction.reply({
                    content: `📝 **Reaction Role Panels:**\n\n${list}`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'mode': {
                const panelName = interaction.options.getString('panel');
                const mode = interaction.options.getString('type');

                const panel = guildPanels[panelName];
                if (!panel) {
                    await interaction.reply({
                        content: `❌ Panel "${panelName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                panel.mode = mode;
                saveData(data);

                const modeDescriptions = {
                    normal: 'Users can add and remove roles freely',
                    unique: 'Users can only have one role from this panel at a time',
                    verify: 'Users can only add roles (reactions won\'t remove roles)',
                    drop: 'Users can only remove roles (reactions won\'t add roles)'
                };

                await interaction.reply({
                    content: `✅ Set panel **${panelName}** to **${mode}** mode\n${modeDescriptions[mode]}`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case 'refresh': {
                const panelName = interaction.options.getString('panel');
                const panel = guildPanels[panelName];

                if (!panel) {
                    await interaction.reply({
                        content: `❌ Panel "${panelName}" not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                try {
                    const channel = await interaction.guild.channels.fetch(panel.channelId);
                    const message = await channel.messages.fetch(panel.messageId);

                    await updatePanelEmbed(interaction.guild, panel, message);

                    await interaction.reply({
                        content: `✅ Refreshed panel **${panelName}**`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    await interaction.reply({
                        content: `❌ Failed to refresh panel: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            }
        }
    },
};

async function updatePanelEmbed(guild, panel, message) {
    let description = panel.description || '';
    
    if (Object.keys(panel.roles).length > 0) {
        const roleLines = [];
        for (const [emojiId, roleData] of Object.entries(panel.roles)) {
            const role = guild.roles.cache.get(roleData.roleId);
            if (role) {
                const line = roleData.description 
                    ? `${roleData.emoji} ${role} - ${roleData.description}`
                    : `${roleData.emoji} ${role}`;
                roleLines.push(line);
            }
        }
        
        if (roleLines.length > 0) {
            description += (description ? '\n\n' : '') + roleLines.join('\n');
        }
    }

    const modeTexts = {
        unique: '⚠️ You can only pick one role from this panel',
        verify: 'ℹ️ Reacting again won\'t remove your role',
        drop: 'ℹ️ This panel only removes roles'
    };

    if (panel.mode && panel.mode !== 'normal' && modeTexts[panel.mode]) {
        description += '\n\n' + modeTexts[panel.mode];
    }

    const embed = new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(description || 'React to get roles!')
        .setColor(panel.color)
        .setFooter({ text: 'React to get your roles' });

    await message.edit({ embeds: [embed] });
}
