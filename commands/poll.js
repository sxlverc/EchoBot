const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const getConfig = require('../configHelper');
const { loadGuildXpData } = require('../features/xp/xpStore');

const pollsDataPath = path.join(__dirname, '../data/pollsData.json');

// Check if user has been active in the past 2 weeks
function isUserActive(guildId, userId) {
    try {
        const xpData = loadGuildXpData(guildId);
        if (!xpData[userId] || !xpData[userId].lastActive) {
            return false;
        }
        const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000;
        const timeSinceActive = Date.now() - xpData[userId].lastActive;
        return timeSinceActive < twoWeeksInMs;
    } catch {
        return false;
    }
}

// Initialize polls data
function initPollsData() {
    if (!fs.existsSync(pollsDataPath)) {
        const defaultData = {
            polls: {},
            settings: {},
            serverIndexes: {} // Track poll indexes per server
        };
        fs.writeFileSync(pollsDataPath, JSON.stringify(defaultData, null, 2));
    }
}

// Load polls data
function loadPollsData() {
    initPollsData();
    try {
        const data = JSON.parse(fs.readFileSync(pollsDataPath, 'utf8'));
        // Migrate userIndexes to serverIndexes if needed
        if (data.userIndexes && !data.serverIndexes) {
            data.serverIndexes = {};
            // Migrate existing data - we'll need to rebuild indexes based on existing polls
            for (const [pollId, poll] of Object.entries(data.polls)) {
                if (poll.guildId && !poll.closed) {
                    if (!data.serverIndexes[poll.guildId]) {
                        data.serverIndexes[poll.guildId] = 0;
                    }
                    // Find the highest index for this server
                    if (poll.index > data.serverIndexes[poll.guildId]) {
                        data.serverIndexes[poll.guildId] = poll.index;
                    }
                }
            }
            delete data.userIndexes;
        }
        // Ensure serverIndexes exists
        if (!data.serverIndexes) {
            data.serverIndexes = {};
        }
        return data;
    } catch {
        const defaultData = {
            polls: {},
            settings: {},
            serverIndexes: {}
        };
        fs.writeFileSync(pollsDataPath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
}

// Save polls data
function savePollsData(data) {
    fs.writeFileSync(pollsDataPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Manage polls')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new poll')
                .addStringOption(option =>
                    option.setName('question')
                        .setDescription('The poll question')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('choice1')
                        .setDescription('First choice')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('choice2')
                        .setDescription('Second choice')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('choice3')
                        .setDescription('Third choice (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('choice4')
                        .setDescription('Fourth choice (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('choice5')
                        .setDescription('Fifth choice (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('choice6')
                        .setDescription('Sixth choice (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('choice7')
                        .setDescription('Seventh choice (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('choice8')
                        .setDescription('Eighth choice (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('choice9')
                        .setDescription('Ninth choice (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('choice10')
                        .setDescription('Tenth choice (optional)')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('anonymous')
                        .setDescription('Make votes anonymous')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('multiple')
                        .setDescription('Allow multiple votes')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('duration')
                        .setDescription('Poll duration in hours (default: 24, 0 = no timer)')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(168)) // Max 1 week
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Close a poll')
                .addIntegerOption(option =>
                    option.setName('index')
                        .setDescription('The index of the poll to close (use /poll list to see indexes)')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('settings')
                .setDescription('Manage poll settings')
                .addBooleanOption(option =>
                    option.setName('threads')
                        .setDescription('Enable discussion threads for polls')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all polls in this server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('voters')
                .setDescription('Show who voted for what in a specific poll')
                .addIntegerOption(option =>
                    option.setName('index')
                        .setDescription('The index of the poll to show voters for')
                        .setRequired(true)
                        .setMinValue(1))),

    async execute(interaction) {
        const config = getConfig(interaction.guild.id);
        // Check privileged executor permission
        if (!config.isPrivilegedExecutor(interaction.member)) {
            await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            await handleCreatePoll(interaction);
        } else if (subcommand === 'close') {
            await handleClosePoll(interaction);
        } else if (subcommand === 'settings') {
            await handleSettings(interaction);
        } else if (subcommand === 'list') {
            await handleListPolls(interaction);
        } else if (subcommand === 'voters') {
            await handleShowVoters(interaction);
        }
    }
};

async function handleCreatePoll(interaction) {
    const question = interaction.options.getString('question');
    const choices = [];
    for (let i = 1; i <= 10; i++) {
        const choice = interaction.options.getString(`choice${i}`);
        if (choice) choices.push(choice);
    }
    const anonymous = interaction.options.getBoolean('anonymous') || false;
    const multiple = interaction.options.getBoolean('multiple') || false;
    const duration = interaction.options.getInteger('duration') ?? 24; // Default 24 hours

    if (choices.length < 2) {
        return interaction.reply({
            content: 'You need at least 2 choices for a poll.',
            flags: MessageFlags.Ephemeral
        });
    }

    const data = loadPollsData();
    const guildId = interaction.guild.id;

    // Get poll index first
    if (!data.serverIndexes[guildId]) {
        data.serverIndexes[guildId] = 0;
    }
    data.serverIndexes[guildId]++;
    const pollIndex = data.serverIndexes[guildId];

    // Create poll embed
    const embed = new EmbedBuilder()
        .setTitle(`Poll #${pollIndex}`)
        .setDescription(`**${question}**\n\n${multiple ? 'Multiple votes allowed - click to toggle votes' : 'Single vote allowed - click to change your vote'}`)
        .setColor(0x5865F2)
        .setFooter({ text: `Created by ${interaction.user.displayName}` });

    // Add choices to embed
    choices.forEach((choice, index) => {
        embed.addFields({ name: `${index + 1}. ${choice}`, value: '0 votes', inline: true });
    });

    // Add timer info if duration is set
    if (duration > 0) {
        const endTime = new Date(Date.now() + (duration * 60 * 60 * 1000));
        embed.addFields({ 
            name: 'Time Remaining', 
            value: `Closes <t:${Math.floor(endTime.getTime() / 1000)}:R>`, 
            inline: false 
        });
    }

    // Create buttons for voting
    const row = new ActionRowBuilder();
    choices.forEach((choice, index) => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`poll_vote_${index}`)
                .setLabel(`${index + 1}`)
                .setStyle(ButtonStyle.Primary)
        );
    });

    // Send the poll
    const pollMessage = await interaction.reply({
        embeds: [embed],
        components: [row]
    }).then(() => interaction.fetchReply());

    // Store poll data
    const pollId = pollMessage.id;

    data.polls[pollId] = {
        question,
        choices,
        votes: choices.map(() => []),
        anonymous,
        multiple,
        creator: interaction.user.id,
        guildId,
        channelId: interaction.channelId,
        closed: false,
        index: pollIndex,
        timer: duration > 0 ? {
            endTime: Date.now() + (duration * 60 * 60 * 1000),
            hours: duration,
            isDefault: duration === 24
        } : null
    };
    savePollsData(data);

    // Set up auto-close timer if specified
    if (duration > 0) {
        setTimeout(async () => {
            await autoClosePoll(pollId, interaction.client);
        }, duration * 60 * 60 * 1000);
    }

    // Create thread if settings allow
    const settings = data.settings[interaction.user.id] || {};
    if (settings.threads) {
        try {
            await pollMessage.startThread({
                name: `Poll: ${question.substring(0, 50)}`,
                autoArchiveDuration: 1440 // 1 day
            });
        } catch (error) {
            console.error('Error creating thread:', error);
        }
    }
}

async function handleClosePoll(interaction) {
    const index = interaction.options.getInteger('index');
    const data = loadPollsData();
    const guildId = interaction.guild.id;

    // Find poll by index for this server
    let pollId = null;
    for (const [id, poll] of Object.entries(data.polls)) {
        if (poll.guildId === guildId && poll.index === index && !poll.closed) {
            pollId = id;
            break;
        }
    }

    if (!pollId) {
        return interaction.reply({
            content: 'Poll not found. Use `/poll list` to see active polls in this server.',
            flags: MessageFlags.Ephemeral
        });
    }

    const poll = data.polls[pollId];

    try {
        const channel = await interaction.client.channels.fetch(poll.channelId);
        const message = await channel.messages.fetch(pollId);

        // Update embed with results
        const embed = EmbedBuilder.from(message.embeds[0]);
        embed.setTitle(`Poll #${poll.index} (Closed)`);
        embed.setColor(0x95a5a6);

        poll.choices.forEach((choice, idx) => {
            const voteCount = poll.votes[idx].length;
            embed.data.fields[idx].value = `${voteCount} votes`;
        });

        // Disable buttons
        const disabledRow = ActionRowBuilder.from(message.components[0]);
        disabledRow.components.forEach(component => {
            component.setDisabled(true);
        });

        await message.edit({
            embeds: [embed],
            components: [disabledRow]
        });

        poll.closed = true;
        savePollsData(data);

        await interaction.reply({
            content: 'Poll closed successfully.',
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error('Error closing poll:', error);
        await interaction.reply({
            content: 'Error closing poll.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleSettings(interaction) {
    const threads = interaction.options.getBoolean('threads');
    const data = loadPollsData();

    if (!data.settings[interaction.user.id]) {
        data.settings[interaction.user.id] = {};
    }

    if (threads !== null) {
        data.settings[interaction.user.id].threads = threads;
        savePollsData(data);
    }

    const currentSettings = data.settings[interaction.user.id] || {};
    const threadsEnabled = currentSettings.threads ? 'Enabled' : 'Disabled';

    await interaction.reply({
        content: `Poll settings updated.\nThreads: ${threadsEnabled}`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleListPolls(interaction) {
    try {
        const data = loadPollsData();
        const guildId = interaction.guild.id;

        const allPolls = Object.entries(data.polls)
            .filter(([pollId, poll]) => poll.guildId === guildId)
            .sort((a, b) => b[1].index - a[1].index); // Sort by index descending

        if (allPolls.length === 0) {
            return interaction.reply({
                content: 'There are no polls in this server.',
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('All Polls in This Server')
            .setColor(0x5865F2);

        let description = '';
        for (const [pollId, poll] of allPolls.slice(0, 10)) { // Limit to 10 most recent
            const creator = interaction.guild.members.cache.get(poll.creator)?.displayName || 'Unknown';
            const status = poll.closed ? '(Closed)' : '(Open)';
            const line = `**${poll.index}.** ${poll.question} ${status} (by ${creator})\n`;
            if (description.length + line.length > 4000) break; // Prevent exceeding Discord's embed limit
            description += line;
        }

        if (allPolls.length > 10) {
            description += `\n... and ${allPolls.length - 10} more`;
        }

        embed.setDescription(description || 'No polls to display.');

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error('Error listing polls:', error);
        await interaction.reply({
            content: '❌ An error occurred while listing polls.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// Show voters for a specific poll
async function handleShowVoters(interaction) {
    const index = interaction.options.getInteger('index');
    const data = loadPollsData();
    const guildId = interaction.guild.id;

    // Find poll by index for this server
    let pollId = null;
    for (const [id, poll] of Object.entries(data.polls)) {
        if (poll.guildId === guildId && poll.index === index) {
            pollId = id;
            break;
        }
    }

    if (!pollId) {
        return interaction.reply({
            content: 'Poll not found in this server.',
            flags: MessageFlags.Ephemeral
        });
    }

    const poll = data.polls[pollId];

    if (poll.anonymous) {
        return interaction.reply({
            content: 'This poll is anonymous. Voter information is not available.',
            flags: MessageFlags.Ephemeral
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(`Voters for Poll #${poll.index}`)
        .setDescription(`**${poll.question}**`)
        .setColor(0x5865F2);

    poll.choices.forEach((choice, idx) => {
        const voters = poll.votes[idx];
        const voterNames = voters.length > 0 
            ? voters.map(userId => `<@${userId}>`).join(', ')
            : 'No votes';
        embed.addFields({
            name: `${idx + 1}. ${choice}`,
            value: voterNames,
            inline: false
        });
    });

    const status = poll.closed ? 'Closed' : 'Open';
    embed.setFooter({ text: `Status: ${status} • Total votes: ${poll.votes.flat().length}` });

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

// Auto-close poll when timer expires
async function autoClosePoll(pollId, client) {
    try {
        const data = loadPollsData();
        const poll = data.polls[pollId];
        
        if (!poll || poll.closed) {
            return; // Already closed or doesn't exist
        }
        
        const guild = client.guilds.cache.get(poll.guildId);
        if (!guild) {
            console.error(`Guild ${poll.guildId} not found for poll #${poll.index}`);
            return;
        }
        
        // Close the poll
        poll.closed = true;
        
        try {
            const channel = await client.channels.fetch(poll.channelId);
            const message = await channel.messages.fetch(pollId);
            
            // Update embed with results
            const embed = EmbedBuilder.from(message.embeds[0]);
            embed.setTitle(`Poll #${poll.index} (Auto-Closed)`);
            embed.setColor(0x95a5a6);
            
            // Remove timer field and update status
            const fields = embed.data.fields.filter(field => field.name !== 'Time Remaining');
            fields.forEach((field, idx) => {
                if (field.name.startsWith('1.') || field.name.startsWith('2.') || field.name.startsWith('3.') ||
                    field.name.startsWith('4.') || field.name.startsWith('5.') || field.name.startsWith('6.') ||
                    field.name.startsWith('7.') || field.name.startsWith('8.') || field.name.startsWith('9.') ||
                    field.name.startsWith('10.')) {
                    const choiceIndex = parseInt(field.name.split('.')[0]) - 1;
                    if (choiceIndex >= 0 && choiceIndex < poll.votes.length) {
                        field.value = `${poll.votes[choiceIndex].length} votes`;
                    }
                }
            });
            
            // Disable buttons
            const disabledRow = ActionRowBuilder.from(message.components[0]);
            disabledRow.components.forEach(component => {
                component.setDisabled(true);
            });
            
            await message.edit({
                embeds: [embed],
                components: [disabledRow]
            });
            
        } catch (error) {
            console.error('Error updating poll message during auto-close:', error);
        }
        
        savePollsData(data);
        console.log(`Auto-closed poll #${poll.index} in guild ${poll.guildId}`);
        
    } catch (error) {
        console.error('Error auto-closing poll:', error);
    }
}

// Restore timers on bot startup
function restoreTimers(client) {
    const data = loadPollsData();
    const now = Date.now();
    
    for (const [pollId, poll] of Object.entries(data.polls)) {
        if (poll.timer && !poll.closed) {
            const timeLeft = poll.timer.endTime - now;
            
            if (timeLeft <= 0) {
                // Timer already expired, close immediately
                autoClosePoll(pollId, client);
            } else {
                // Schedule timer for remaining time
                setTimeout(async () => {
                    await autoClosePoll(pollId, client);
                }, timeLeft);
                console.log(`Restored timer for poll #${poll.index}, closing in ${Math.round(timeLeft / 3600000)} hours`);
            }
        }
    }
}

// Export timer restoration function
module.exports.restoreTimers = restoreTimers;

// Export for handling button interactions
module.exports.handlePollVote = async (interaction) => {
    const [_, __, choiceIndex] = interaction.customId.split('_');
    const pollId = interaction.message.id;
    const data = loadPollsData();

    if (!data.polls[pollId] || data.polls[pollId].closed) {
        return interaction.reply({
            content: 'This poll is closed or does not exist.',
            flags: MessageFlags.Ephemeral
        });
    }

    const poll = data.polls[pollId];
    const userId = interaction.user.id;
    const choice = parseInt(choiceIndex);

    // Check if user has been active in the past 2 weeks
    if (!isUserActive(poll.guildId || interaction.guild.id, userId)) {
        return interaction.reply({
            content: '❌ You must have been active in the server within the past 2 weeks to vote on polls.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (choice < 0 || choice >= poll.choices.length) {
        return interaction.reply({
            content: 'Invalid choice.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Handle voting logic
    const alreadyVotedForThis = poll.votes[choice].includes(userId);
    
    if (poll.multiple) {
        // For multiple votes: toggle vote for this specific choice
        if (alreadyVotedForThis) {
            // Remove vote
            poll.votes[choice] = poll.votes[choice].filter(id => id !== userId);
        } else {
            // Add vote
            poll.votes[choice].push(userId);
        }
    } else {
        // For single votes: remove any existing votes and add new one
        poll.votes.forEach(votes => {
            const index = votes.indexOf(userId);
            if (index > -1) votes.splice(index, 1);
        });
        poll.votes[choice].push(userId);
    }

    savePollsData(data);

    // Update embed
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    poll.choices.forEach((choiceText, index) => {
        const voteCount = poll.votes[index].length;
        embed.data.fields[index].value = `${voteCount} votes`;
    });

    await interaction.update({
        embeds: [embed]
    });
};