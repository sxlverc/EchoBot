const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { awardXP } = require('../xp/xpUtils');
const getConfig = require('../../configHelper');

const activeGames = new Map();
const gamesDataPath = path.join(__dirname, '../../data/tictactoeGames.json');

function saveGames() {
    try {
        const dir = path.dirname(gamesDataPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const gamesArray = Array.from(activeGames.entries()).map(([channelId, game]) => [
            channelId,
            {
                ...game,
                board: game.board
            }
        ]);
        fs.writeFileSync(gamesDataPath, JSON.stringify({ games: gamesArray }, null, 2));
    } catch (error) {
        console.error('Error saving tic-tac-toe games:', error);
    }
}

function loadGames(client) {
    try {
        if (!fs.existsSync(gamesDataPath)) {
            console.log('No tic-tac-toe save file found, starting fresh');
            return;
        }
        const data = JSON.parse(fs.readFileSync(gamesDataPath, 'utf8'));
        if (data.games) {
            data.games.forEach(([channelId, gameData]) => {
                activeGames.set(channelId, {
                    ...gameData,
                    client: client
                });
            });
        }
        console.log(`Loaded ${activeGames.size} tic-tac-toe game(s)`);
    } catch (error) {
        console.error('Error loading tic-tac-toe games:', error);
    }
}

function createBoard() {
    return [
        ['', '', ''],
        ['', '', ''],
        ['', '', '']
    ];
}

function checkWinner(board) {
    // Check rows
    for (let row = 0; row < 3; row++) {
        if (board[row][0] && board[row][0] === board[row][1] && board[row][1] === board[row][2]) {
            return { winner: board[row][0], line: `row${row}` };
        }
    }
    
    // Check columns
    for (let col = 0; col < 3; col++) {
        if (board[0][col] && board[0][col] === board[1][col] && board[1][col] === board[2][col]) {
            return { winner: board[0][col], line: `col${col}` };
        }
    }
    
    // Check diagonals
    if (board[0][0] && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
        return { winner: board[0][0], line: 'diag1' };
    }
    if (board[0][2] && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
        return { winner: board[0][2], line: 'diag2' };
    }
    
    // Check for tie
    const isFull = board.every(row => row.every(cell => cell !== ''));
    if (isFull) {
        return { winner: 'tie' };
    }
    
    return null;
}

function createBoardDisplay(board) {
    const emojis = {
        '': '⬜',
        'X': '❌',
        'O': '⭕'
    };
    
    let display = '';
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            display += emojis[board[row][col]] + ' ';
        }
        display += '\n';
    }
    
    return display;
}

function createButtons(board, gameEnded = false) {
    const rows = [];
    for (let row = 0; row < 3; row++) {
        const actionRow = new ActionRowBuilder();
        for (let col = 0; col < 3; col++) {
            const isEmpty = board[row][col] === '';
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ttt_${row}_${col}`)
                    .setLabel(board[row][col] || '\u200b')
                    .setStyle(board[row][col] === 'X' ? ButtonStyle.Danger : board[row][col] === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(!isEmpty || gameEnded)
            );
        }
        rows.push(actionRow);
    }
    return rows;
}

function createGame(player1Id, player2Id, channelId) {
    const game = {
        player1: { id: player1Id, symbol: 'X' },
        player2: { id: player2Id, symbol: 'O' },
        board: createBoard(),
        currentTurn: player1Id,
        channelId: channelId,
        phase: 'waiting'
    };
    
    activeGames.set(channelId, game);
    saveGames();
    return game;
}

function getGame(channelId) {
    return activeGames.get(channelId);
}

function deleteGame(channelId) {
    activeGames.delete(channelId);
    saveGames();
}

const data = new SlashCommandBuilder()
    .setName('tictactoe')
    .setDescription('Play Tic-Tac-Toe!')
    .addSubcommand(subcommand =>
        subcommand
            .setName('start')
            .setDescription('Start a game of Tic-Tac-Toe')
            .addUserOption(option =>
                option.setName('opponent')
                    .setDescription('Choose your opponent')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('forfeit')
            .setDescription('Forfeit the current game'));

async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'forfeit') {
        const game = getGame(interaction.channel.id);
        
        if (!game) {
            return interaction.reply({
                content: '❌ There is no active Tic-Tac-Toe game in this channel.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const isPlayer1 = interaction.user.id === game.player1.id;
        const isPlayer2 = interaction.user.id === game.player2.id;
        
        if (!isPlayer1 && !isPlayer2) {
            return interaction.reply({
                content: '❌ You are not in this game.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const winner = isPlayer1 ? game.player2.id : game.player1.id;
        const loser = isPlayer1 ? game.player1.id : game.player2.id;
        
        // Award XP for forfeit
        const winXP = config.features?.xp?.gameXP?.tictactoe?.win || 50;
        const forfeitXP = config.features?.xp?.gameXP?.tictactoe?.forfeit || Math.floor(winXP * 0.5); // Forfeiter gets 50% of win XP
        
        try {
            await awardXP(winner, interaction.guild, winXP, 'Tic-Tac-Toe win (forfeit)');
            await awardXP(loser, interaction.guild, forfeitXP, 'Tic-Tac-Toe forfeit');
        } catch (error) {
            console.error('Error awarding XP:', error);
        }
        
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏳️ Game Over - Forfeit!')
            .setDescription(`<@${interaction.user.id}> has forfeited!\n\n**<@${winner}> wins!**`)
            .setTimestamp();
        
        deleteGame(interaction.channel.id);
        
        return interaction.reply({
            content: `<@${game.player1.id}> <@${game.player2.id}>`,
            embeds: [embed]
        });
    }
    
    // Start subcommand
    const opponent = interaction.options.getUser('opponent');
    
    if (opponent.bot) {
        return interaction.reply({
            content: '❌ You cannot play against a bot!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (opponent.id === interaction.user.id) {
        return interaction.reply({
            content: '❌ You cannot play against yourself!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (getGame(interaction.channel.id)) {
        return interaction.reply({
            content: '❌ There is already a game in progress in this channel!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const game = createGame(interaction.user.id, opponent.id, interaction.channel.id);
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ttt_accept')
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('ttt_decline')
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );
    
    const challengeEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('⭕ Tic-Tac-Toe Challenge!')
        .setDescription(`<@${interaction.user.id}> has challenged <@${opponent.id}> to Tic-Tac-Toe!\n\n<@${opponent.id}>, do you accept?`)
        .setTimestamp();
    
    await interaction.reply({
        content: `<@${opponent.id}>`,
        embeds: [challengeEmbed],
        components: [row]
    });
}

async function handleChallengeResponse(interaction, accepted) {
    const game = getGame(interaction.channel.id);
    
    if (!game) {
        return interaction.update({
            content: '❌ This game has expired.',
            embeds: [],
            components: []
        });
    }
    
    if (interaction.user.id !== game.player2.id) {
        return interaction.reply({
            content: '❌ Only the challenged player can respond to this.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (!accepted) {
        deleteGame(interaction.channel.id);
        return interaction.update({
            content: `<@${game.player2.id}> declined the challenge.`,
            embeds: [],
            components: []
        });
    }
    
    game.phase = 'playing';
    saveGames();
    
    const startEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('⭕ Tic-Tac-Toe - Game Started!')
        .setDescription(`<@${game.player1.id}> (❌) vs <@${game.player2.id}> (⭕)\n\n${createBoardDisplay(game.board)}\n🎯 <@${game.currentTurn}>'s turn!`)
        .setTimestamp();
    
    await interaction.update({
        content: `<@${game.player1.id}> <@${game.player2.id}>`,
        embeds: [startEmbed],
        components: createButtons(game.board)
    });
}

async function handleMove(interaction) {
    const [_, row, col] = interaction.customId.split('_').map(Number);
    const game = getGame(interaction.channel.id);
    
    if (!game) {
        return interaction.reply({
            content: '❌ This game no longer exists.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (interaction.user.id !== game.currentTurn) {
        return interaction.reply({
            content: '❌ It\'s not your turn!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (game.board[row][col] !== '') {
        return interaction.reply({
            content: '❌ That space is already taken!',
            flags: MessageFlags.Ephemeral
        });
    }
    
    const currentPlayer = game.currentTurn === game.player1.id ? game.player1 : game.player2;
    game.board[row][col] = currentPlayer.symbol;
    
    const result = checkWinner(game.board);
    
    if (result) {
        let description;
        let xpAwards = [];
        
        if (result.winner === 'tie') {
            description = `${createBoardDisplay(game.board)}\n🤝 It's a tie!`;
            // Award XP for tie
            const tieXP = config.features?.xp?.gameXP?.tictactoe?.tie || 25;
            xpAwards.push({ userId: game.player1.id, xp: tieXP, reason: 'Tic-Tac-Toe tie' });
            xpAwards.push({ userId: game.player2.id, xp: tieXP, reason: 'Tic-Tac-Toe tie' });
        } else {
            const winnerId = result.winner === 'X' ? game.player1.id : game.player2.id;
            const loserId = result.winner === 'X' ? game.player2.id : game.player1.id;
            description = `${createBoardDisplay(game.board)}\n🏆 <@${winnerId}> wins!`;
            
            // Award XP for win/loss
            const winXP = config.features?.xp?.gameXP?.tictactoe?.win || 50;
            const loseXP = Math.floor(winXP * 0.3); // Losers get 30% of win XP
            xpAwards.push({ userId: winnerId, xp: winXP, reason: 'Tic-Tac-Toe win' });
            xpAwards.push({ userId: loserId, xp: loseXP, reason: 'Tic-Tac-Toe loss' });
        }
        
        // Award XP to all players
        for (const award of xpAwards) {
            try {
                await awardXP(award.userId, interaction.guild, award.xp, award.reason);
            } catch (error) {
                console.error('Error awarding XP:', error);
            }
        }
        
        const gameOverEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('⭕ Tic-Tac-Toe - Game Over!')
            .setDescription(description)
            .setTimestamp();
        
        deleteGame(interaction.channel.id);
        
        await interaction.update({
            embeds: [gameOverEmbed],
            components: createButtons(game.board, true)
        });
    } else {
        game.currentTurn = game.currentTurn === game.player1.id ? game.player2.id : game.player1.id;
        saveGames();
        
        const turnEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('⭕ Tic-Tac-Toe')
            .setDescription(`<@${game.player1.id}> (❌) vs <@${game.player2.id}> (⭕)\n\n${createBoardDisplay(game.board)}\n🎯 <@${game.currentTurn}>'s turn!`)
            .setTimestamp();
        
        await interaction.update({
            embeds: [turnEmbed],
            components: createButtons(game.board)
        });
    }
}

module.exports = {
    data,
    execute,
    handleChallengeResponse,
    handleMove,
    getGame,
    activeGames,
    loadGames,
    saveGames
};
