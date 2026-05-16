// require('dotenv').config();
const { Client, Events, GatewayIntentBits, MessageFlags, ActivityType, Partials } = require('discord.js');
const guildMemberEvents = require('./events/guildMemberEvents');
const getConfig = require('./configHelper');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Validate required environment variables
function validateEnvironment() {
    const required = ['DISCORD_TOKEN'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:', missing.join(', '));
        console.error('Please check your .env file and ensure all required variables are set.');
        process.exit(1);
    }

    console.log('✅ Environment variables validated');
}

// Function to count lines of code (with caching)
let cachedLineCount = null;
let lastLineCountTime = 0;
const LINE_COUNT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getLineCount() {
    const now = Date.now();
    if (cachedLineCount !== null && (now - lastLineCountTime) < LINE_COUNT_CACHE_DURATION) {
        return cachedLineCount;
    }

    try {
        const result = execSync('find . -name "*.js" -not -path "./node_modules/*" -exec wc -l {} + 2>/dev/null | tail -1 || echo "0"', {
            cwd: __dirname,
            timeout: 5000 // 5 second timeout
        }).toString().trim();

        // Extract just the total line count (first number in the output)
        const match = result.match(/^\s*(\d+)/);
        const lines = match ? parseInt(match[1]) : 0;
        cachedLineCount = lines;
        lastLineCountTime = now;
        return lines;
    } catch (error) {
        console.warn('⚠️ Could not count lines of code:', error.message);
        return cachedLineCount || 0;
    }
}

function buildDefaultActivities(totalLines, isDecember) {
    const activities = [
        { type: ActivityType.Custom, name: 'Custom Status', state: `running on ${totalLines.toLocaleString()} lines of code` },
        { type: ActivityType.Custom, name: 'Custom Status', state: '🎫 Checking Tickets...' },
        { name: 'over Kitty Voyage', type: ActivityType.Watching },
        { name: 'spacey train rides', type: ActivityType.Playing },
        { name: 'the stars go by', type: ActivityType.Watching },
        { name: 'your space adventures', type: ActivityType.Listening }
    ];

    if (isDecember) {
        activities.push(
            { name: '🎄 Christmas in space', type: ActivityType.Listening },
            { name: '🎅 Santa\'s space sleigh', type: ActivityType.Playing },
            { name: '❄️ cosmic winter wonderland', type: ActivityType.Watching },
            { name: '🎁 wrapping space presents', type: ActivityType.Playing }
        );
    }

    return activities;
}

function resolvePresenceActivities(presenceConfig, totalLines, isDecember) {
    const defaultActivities = buildDefaultActivities(totalLines, isDecember);
    const configured = Array.isArray(presenceConfig?.activities) ? presenceConfig.activities : [];
    if (configured.length === 0) return defaultActivities;

    const typeMap = {
        playing: ActivityType.Playing,
        streaming: ActivityType.Streaming,
        listening: ActivityType.Listening,
        watching: ActivityType.Watching,
        custom: ActivityType.Custom,
        competing: ActivityType.Competing
    };

    const replaceTemplate = (value) => {
        if (typeof value !== 'string') return value;
        return value.replace('{line_count}', totalLines.toLocaleString());
    };

    const mapped = configured
        .map((activity) => {
            const rawType = String(activity?.type || '').toLowerCase();
            const type = typeMap[rawType];
            if (!type) return null;

            if (type === ActivityType.Custom) {
                return {
                    type,
                    name: 'Custom Status',
                    state: replaceTemplate(activity.state || '')
                };
            }

            return {
                type,
                name: replaceTemplate(activity.name || '')
            };
        })
        .filter(Boolean);

    return mapped.length > 0 ? mapped : defaultActivities;
}

// Validate environment before starting
validateEnvironment();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Load slash commands
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath)) {
    if (file.endsWith('.js')) {
        const command = require(path.join(commandsPath, file));
        // Handle both single commands and arrays of commands
        if (Array.isArray(command.data)) {
            for (const data of command.data) {
                client.commands.set(data.name, command);
            }
        } else {
            client.commands.set(command.data.name, command);
        }
    }
}

// Load game commands from features/games
const gamesPath = path.join(__dirname, 'features', 'games');
const gameFiles = ['battleship.js', 'battleshipboard.js', 'tictactoe.js', 'connect4.js'];
for (const file of gameFiles) {
    const filePath = path.join(gamesPath, file);
    if (fs.existsSync(filePath)) {
        const command = require(filePath);
        client.commands.set(command.data.name, command);
    }
}

client.once(Events.ClientReady, readyClient => {
    console.log(`🚀 Astro Bot is ready! Logged in as ${readyClient.user.tag}`);

    // Load saved battleship games
    const battleship = require('./features/games/battleship/battleship');
    battleship.loadGames(readyClient);
    
    // Load saved Connect4 games
    const connect4 = require('./features/games/connect4');
    connect4.loadGames(readyClient);
    
    // Load saved Tic-Tac-Toe games
    const tictactoe = require('./features/games/tictactoe');
    tictactoe.loadGames(readyClient);

    // Load saved reminders
    const remindCommand = require('./commands/remind');
    const remindersPath = path.join(__dirname, 'data/reminders.json');
    try {
        if (fs.existsSync(remindersPath)) {
            const reminders = JSON.parse(fs.readFileSync(remindersPath, 'utf8'));
            let activeCount = 0;
            
            for (const reminder of reminders) {
                const timeUntilTrigger = reminder.triggerTime - Date.now();
                
                if (timeUntilTrigger > 0) {
                    // Schedule future reminders
                    remindCommand.scheduleReminder(readyClient, reminder, timeUntilTrigger);
                    activeCount++;
                } else {
                    // Trigger overdue reminders immediately
                    remindCommand.triggerReminder(readyClient, reminder);
                }
            }
            
            if (activeCount > 0) {
                console.log(`📝 Loaded ${activeCount} active reminder(s)`);
            }
        }
    } catch (error) {
        console.error('Error loading reminders:', error);
    }

    // Set rich presence
    const configuredGuildId = process.env.GUILD_ID || readyClient.guilds.cache.first()?.id;
    let guildConfig = null;
    try {
        guildConfig = configuredGuildId ? getConfig(configuredGuildId) : null;
    } catch (error) {
        console.warn('Could not load guild-specific presence config, using defaults:', error.message);
    }

    const currentMonth = new Date().getMonth(); // 0-11, December = 11
    const isDecember = currentMonth === 11;

    // Get initial line count
    let totalLines = getLineCount();
    const presenceConfig = guildConfig?.features?.presence;
    const onlineStatus = presenceConfig?.onlineStatus || 'online';
    const rotationMs = Math.max(1, Number(presenceConfig?.rotateMinutes || 5)) * 60 * 1000;
    let activities = resolvePresenceActivities(presenceConfig, totalLines, isDecember);

    const setActivity = () => {
        // Pick a random activity
        const randomActivity = activities[Math.floor(Math.random() * activities.length)];
        readyClient.user.setPresence({
            activities: [randomActivity],
            status: onlineStatus
        });
    };

    // Set initial activity
    setActivity();

    // Rotate activities every configured number of minutes
    setInterval(setActivity, rotationMs);

    // Update line count every hour and refresh the activity
    setInterval(() => {
        const newLineCount = getLineCount();
        if (newLineCount !== totalLines) {
            totalLines = newLineCount;
            activities = resolvePresenceActivities(presenceConfig, totalLines, isDecember);
            console.log(`Line count updated: ${totalLines.toLocaleString()}`);
        }
    }, 60 * 60 * 1000); // Update every hour
});

// Register event handlers
guildMemberEvents.register(client);

// Register XP tracking
const xpTracker = require('./features/xp/xpTracker');
xpTracker.register(client);

// Register voice XP tracking
const voiceXpTracker = require('./features/xp/voiceXpTracker');
voiceXpTracker.register(client);

// Register auto-bump system
const bumpReminder = require('./features/bumpReminder');
bumpReminder.register(client);

// Register link fixer
const linkFixer = require('./features/linkFixer/linkFixer');
linkFixer.register(client);

// Register VoiceMaster system
const voiceMaster = require('./features/voicemaster/voicemaster');
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await voiceMaster.handleVoiceStateUpdate(oldState, newState);
});
client.once(Events.ClientReady, async (readyClient) => {
    for (const [, guild] of readyClient.guilds.cache) {
        try {
            const guildCfg = getConfig(guild.id);
            if (guildCfg?.features?.voicemaster?.enabled) {
                await voiceMaster.cleanupNonExistentChannels(guild, guildCfg);
            }
        } catch (err) {
            console.error(`VoiceMaster startup cleanup failed for guild ${guild.id}:`, err.message);
        }
    }
});

// Register Server Logger
const serverLogger = require('./features/serverLogger');
serverLogger.register(client);

// Register Reaction Roles system
const reactionRoles = require('./features/reactionRoles');
reactionRoles.register(client);

// Register Starboard system
const starboard = require('./features/starboard');
starboard.register(client);

// Handle slash commands and context menu commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand() && !interaction.isStringSelectMenu() && !interaction.isUserSelectMenu() && !interaction.isButton() && !interaction.isModalSubmit() && !interaction.isAutocomplete()) {
        console.log('Ignoring interaction type:', interaction.type);
        return;
    }

    // Handle poll vote button interactions
    if (interaction.isButton() && interaction.customId.startsWith('poll_vote_')) {
        const pollCommand = require('./commands/poll');
        await pollCommand.handlePollVote(interaction);
        return;
    }

    // Handle suggestion vote button interactions
    if (interaction.isButton() && interaction.customId.startsWith('suggestion_')) {
        const suggestions = require('./features/suggestions/suggestions');
        await suggestions.handleSuggestionVote(interaction);
        return;
    }

    // Handle trivia answer button interactions
    if (interaction.isButton() && interaction.customId.startsWith('trivia_answer_')) {
        const triviaCommand = require('./commands/trivia');
        await triviaCommand.handleTriviaAnswer(interaction);
        return;
    }

    // Handle battleship button interactions
    if (interaction.isButton() && interaction.customId === 'battleship_accept') {
        const battleshipCommand = require('./features/games/battleship');
        await battleshipCommand.handleChallengeResponse(interaction, true);
        return;
    }

    if (interaction.isButton() && interaction.customId === 'battleship_decline') {
        const battleshipCommand = require('./features/games/battleship');
        await battleshipCommand.handleChallengeResponse(interaction, false);
        return;
    }

    // Handle battleship ship placement interactions
    if (interaction.isButton() && interaction.customId === 'battleship_toggle_orientation') {
        const battleshipCommand = require('./features/games/battleship');
        const battleship = require('./features/games/battleship/battleship');
        const game = battleship.getGame(interaction.message.channelId) || 
                     Array.from(battleship.activeGames.values()).find(g => 
                         g.player1.id === interaction.user.id || g.player2.id === interaction.user.id);
        if (game) {
            await battleshipCommand.handleToggleOrientation(interaction, game);
        } else {
            await interaction.reply({
                content: '❌ Game not found. It may have expired.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        return;
    }

    if (interaction.isButton() && interaction.customId === 'battleship_random_ships') {
        const battleshipCommand = require('./features/games/battleship');
        const battleship = require('./features/games/battleship/battleship');
        const game = battleship.getGame(interaction.message.channelId) || 
                     Array.from(battleship.activeGames.values()).find(g => 
                         g.player1.id === interaction.user.id || g.player2.id === interaction.user.id);
        if (game) {
            await battleshipCommand.handleRandomShips(interaction, game);
        } else {
            await interaction.reply({
                content: '❌ Game not found. It may have expired.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        return;
    }

    if (interaction.isButton() && interaction.customId === 'battleship_place_ship') {
        const battleshipCommand = require('./features/games/battleship');
        const battleship = require('./features/games/battleship/battleship');
        const game = battleship.getGame(interaction.message.channelId) || 
                     Array.from(battleship.activeGames.values()).find(g => 
                         g.player1.id === interaction.user.id || g.player2.id === interaction.user.id);
        if (game) {
            await battleshipCommand.handlePlaceShipButton(interaction, game);
        } else {
            await interaction.reply({
                content: '❌ Game not found. It may have expired.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        return;
    }

    // Handle battleship row selection (for both attack and placement)
    if (interaction.isButton() && interaction.customId.startsWith('battleship_row_')) {
        const battleshipCommand = require('./features/games/battleship');
        const battleship = require('./features/games/battleship/battleship');
        const rowIndex = parseInt(interaction.customId.split('_')[2]);
        const game = battleship.getGame(interaction.message.channelId) || 
                     Array.from(battleship.activeGames.values()).find(g => 
                         g.player1.id === interaction.user.id || g.player2.id === interaction.user.id);
        
        if (game) {
            const isPlayer1 = interaction.user.id === game.player1.id;
            const player = isPlayer1 ? game.player1 : game.player2;
            
            // Check if this is for ship placement or attack
            if (player.placementPhase === 'selecting_row') {
                await battleshipCommand.handlePlacementRowSelection(interaction, rowIndex, game);
            } else if (game.phase === 'selecting_row') {
                await battleshipCommand.handleRowSelection(interaction, rowIndex);
            }
        } else {
            await interaction.reply({
                content: '❌ Game not found. It may have expired.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        return;
    }

    // Handle battleship column selection (for both attack and placement)
    if (interaction.isButton() && interaction.customId.startsWith('battleship_col_')) {
        const battleshipCommand = require('./features/games/battleship');
        const battleship = require('./features/games/battleship/battleship');
        const colIndex = parseInt(interaction.customId.split('_')[2]);
        const game = battleship.getGame(interaction.message.channelId) || 
                     Array.from(battleship.activeGames.values()).find(g => 
                         g.player1.id === interaction.user.id || g.player2.id === interaction.user.id);
        
        if (game) {
            const isPlayer1 = interaction.user.id === game.player1.id;
            const player = isPlayer1 ? game.player1 : game.player2;
            
            // Check if this is for ship placement or attack
            if (player.placementPhase === 'selecting_col') {
                await battleshipCommand.handlePlacementColumnSelection(interaction, colIndex, game);
            } else if (game.phase === 'selecting_col') {
                await battleshipCommand.handleColumnSelection(interaction, colIndex);
            }
        } else {
            await interaction.reply({
                content: '❌ Game not found. It may have expired.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        return;
    }

    // Handle battleship attack button
    if (interaction.isButton() && interaction.customId === 'battleship_attack') {
        const battleshipCommand = require('./features/games/battleship');
        await battleshipCommand.handleAttackButton(interaction);
        return;
    }

    // Handle battleship show board button
    if (interaction.isButton() && interaction.customId === 'battleship_show_board') {
        const battleshipboardCommand = require('./features/games/battleshipboard');
        await battleshipboardCommand.execute(interaction);
        return;
    }

    // Handle tic-tac-toe button interactions
    if (interaction.isButton() && interaction.customId === 'ttt_accept') {
        const tictactoeCommand = require('./features/games/tictactoe');
        await tictactoeCommand.handleChallengeResponse(interaction, true);
        return;
    }

    if (interaction.isButton() && interaction.customId === 'ttt_decline') {
        const tictactoeCommand = require('./features/games/tictactoe');
        await tictactoeCommand.handleChallengeResponse(interaction, false);
        return;
    }

    if (interaction.isButton() && /^ttt_\d+_\d+$/.test(interaction.customId)) {
        const tictactoeCommand = require('./features/games/tictactoe');
        await tictactoeCommand.handleMove(interaction);
        return;
    }

    // Handle connect4 button interactions
    if (interaction.isButton() && interaction.customId === 'c4_accept') {
        const connect4Command = require('./features/games/connect4');
        await connect4Command.handleChallengeResponse(interaction, true);
        return;
    }

    if (interaction.isButton() && interaction.customId === 'c4_decline') {
        const connect4Command = require('./features/games/connect4');
        await connect4Command.handleChallengeResponse(interaction, false);
        return;
    }

    if (interaction.isButton() && /^c4_\d+$/.test(interaction.customId)) {
        const connect4Command = require('./features/games/connect4');
        await connect4Command.handleMove(interaction);
        return;
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
        // Handle VoiceMaster modals
        if (interaction.customId.startsWith('voice_')) {
            const voiceMaster = require('./features/voicemaster/voicemaster');
            await voiceMaster.handleVoiceControlModal(interaction);
            return;
        }
        
        // Handle message command modals
        if (interaction.customId.startsWith('create_') || 
            interaction.customId.startsWith('additem_') || 
            interaction.customId.startsWith('edititem_') || 
            interaction.customId.startsWith('edit_')) {
            try {
                const messageCommand = require('./commands/message');
                await messageCommand.handleModalSubmit(interaction);
            } catch (error) {
                console.error('Error handling message modal:', error);
                await interaction.reply({
                    content: '❌ An error occurred while processing your request.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
            return;
        }

        // Handle reaction role modals
        if (interaction.customId.startsWith('rr_')) {
            try {
                const reactionroleCommand = require('./commands/reactionrole');
                await reactionroleCommand.handleModalSubmit(interaction);
            } catch (error) {
                console.error('Error handling reaction role modal:', error);
                await interaction.reply({
                    content: '❌ An error occurred while processing your request.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
            return;
        }

        // Handle tell command modals
        if (interaction.customId === 'tellModal') {
            try {
                const tellCommand = require('./commands/tell');
                await tellCommand.handleModalSubmit(interaction);
            } catch (error) {
                console.error('Error handling tell modal:', error);
                await interaction.reply({
                    content: '❌ An error occurred while processing your request.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
            return;
        }
        
        // Let other commands handle their own modals
        // Tell command modals are not implemented yet
    }

    // Handle string select menus
    if (interaction.isStringSelectMenu()) {
        // Handle VoiceMaster control menus
        if (interaction.customId.startsWith('voice_control_')) {
            const voiceMaster = require('./features/voicemaster/voicemaster');
            await voiceMaster.handleVoiceControlMenu(interaction);
            return;
        }
        // Handle VoiceMaster kick selection menus
        if (interaction.customId.startsWith('kick_select_')) {
            const voiceMaster = require('./features/voicemaster/voicemaster');
            await voiceMaster.handleKickSelection(interaction);
            return;
        }
        // Handle VoiceMaster unblacklist selection menus
        if (interaction.customId.startsWith('unblacklist_select_')) {
            const voiceMaster = require('./features/voicemaster/voicemaster');
            await voiceMaster.handleUnblacklistSelection(interaction);
            return;
        }
    }

    // Handle user select menus
    if (interaction.isUserSelectMenu()) {
        // Handle VoiceMaster blacklist selection menus
        if (interaction.customId.startsWith('blacklist_select_')) {
            const voiceMaster = require('./features/voicemaster/voicemaster');
            await voiceMaster.handleBlacklistSelection(interaction);
            return;
        }
    }

    // Handle slash commands and context menu commands
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Handle autocomplete for commands that support it
    if (interaction.isAutocomplete()) {
        if (command.autocomplete) {
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error('Error handling autocomplete:', error);
            }
        }
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
        await interaction[replyMethod]({ content: 'There was an error executing that command.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    client.destroy();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejections in production, just log them
});

client.login(process.env.DISCORD_TOKEN);