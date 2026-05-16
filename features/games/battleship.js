const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const battleship = require('./battleship/battleship');
const { awardXP } = require('../xp/xpUtils');
const getConfig = require('../../configHelper');

async function sendShipPlacementDM(userId, game) {
	try {
		const user = await game.client.users.fetch(userId);
	
	const isPlayer1 = userId === game.player1.id;
	const player = isPlayer1 ? game.player1 : game.player2;
	const currentShip = battleship.SHIPS[player.currentShipIndex];
	
	const embed = new EmbedBuilder()
		.setColor('#0099ff')
		.setTitle('⚓ Ship Placement')
		.setDescription(`Place your **${currentShip.emoji} ${currentShip.name}** (${currentShip.size} cells)\n\n` +
			`**Your Board:**\n${battleship.createBoardDisplay(player.board, new Map(), false)}\n\n` +
			`**Orientation:** ${player.horizontal ? 'Horizontal ➡️' : 'Vertical ⬇️'}\n` +
			`Ships placed: ${player.placedShips.length}/${battleship.SHIPS.length}`)
		.setFooter({ text: 'Click buttons below to place your ship' });
	
	const orientationRow = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('battleship_toggle_orientation')
				.setLabel(player.horizontal ? 'Switch to Vertical ⬇️' : 'Switch to Horizontal ➡️')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId('battleship_random_ships')
				.setLabel('Auto-Place Remaining Ships')
				.setStyle(ButtonStyle.Primary)
				.setEmoji('🎲')
		);
	
	const placeRow = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('battleship_place_ship')
				.setLabel('Select Position')
				.setStyle(ButtonStyle.Success)
				.setEmoji('📍')
		);
	
		await user.send({
			embeds: [embed],
			components: [orientationRow, placeRow]
		});
	} catch (error) {
		console.error('Error sending ship placement DM:', error);
		throw error;
	}
}

async function checkBothPlayersReady(game, channelId) {
	if (game.player1.setupComplete && game.player2.setupComplete) {
		// Both players ready - start the game
		game.phase = 'playing';
		
		const channel = await game.client.channels.fetch(channelId);
		
		const startEmbed = new EmbedBuilder()
			.setColor('#00ff00')
			.setTitle('⚓ Battleship - Game Started!')
			.setDescription(`<@${game.player1.id}> vs <@${game.player2.id}>\n\n` +
				`Both players have placed their ships!\n\n` +
				`🎯 <@${game.currentTurn}>'s turn!\n` +
				`Click the button below to select a coordinate to attack.`)
			.setFooter({ text: 'Use /battleshipboard to view your board' })
			.setTimestamp();
		
		const attackRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('battleship_attack')
					.setLabel('Select Target')
					.setStyle(ButtonStyle.Primary)
					.setEmoji('🎯'),
				new ButtonBuilder()
					.setCustomId('battleship_show_board')
					.setLabel('Show Board')
					.setStyle(ButtonStyle.Secondary)
					.setEmoji('📋')
			);
		
		await channel.send({
			content: `<@${game.player1.id}> <@${game.player2.id}>`,
			embeds: [startEmbed],
			components: [attackRow]
		});
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('battleship')
		.setDescription('Play Battleship!')
		.addSubcommand(subcommand =>
			subcommand
				.setName('start')
				.setDescription('Start a game of Battleship')
				.addUserOption(option =>
					option.setName('opponent')
						.setDescription('Choose your opponent')
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName('surrender')
				.setDescription('Surrender the current game')),

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();
		
		if (subcommand === 'surrender') {
			const game = battleship.getGame(interaction.channel.id);
			
			if (!game) {
				return interaction.reply({
					content: '❌ There is no active Battleship game in this channel.',
					flags: MessageFlags.Ephemeral
				});
			}
			
			const isPlayer1 = interaction.user.id === game.player1.id;
			const isPlayer2 = interaction.user.id === game.player2.id;
			
			if (!isPlayer1 && !isPlayer2) {
				return interaction.reply({
					content: '❌ You are not playing in this game.',
					flags: MessageFlags.Ephemeral
				});
			}
			
			const winner = isPlayer1 ? game.player2.id : game.player1.id;
			const loser = isPlayer1 ? game.player1.id : game.player2.id;
			
			// Award XP for forfeit
			const winXP = config.features?.xp?.gameXP?.battleship?.win || 250;
			const forfeitXP = config.features?.xp?.gameXP?.battleship?.forfeit || 50;
			
			try {
				await awardXP(winner, interaction.guild, winXP, 'Battleship win (forfeit)');
				await awardXP(loser, interaction.guild, forfeitXP, 'Battleship forfeit');
			} catch (error) {
				console.error('Error awarding XP:', error);
			}
			
			const winnerPlayer = winner === game.player1.id ? game.player1 : game.player2;
			const loserPlayer = loser === game.player1.id ? game.player1 : game.player2;
			
			const winnerBoard = battleship.createBoardDisplay(winnerPlayer.board, loserPlayer.attacks, false);
			const loserBoard = battleship.createBoardDisplay(loserPlayer.board, winnerPlayer.attacks, false);
			
			const embed = new EmbedBuilder()
				.setColor('#FFD700')
				.setTitle('🏳️ Game Over - Surrender!')
				.setDescription(`<@${interaction.user.id}> has surrendered!\n\n**<@${winner}> wins!**`)
				.addFields(
					{ name: `<@${winner}>'s Board`, value: winnerBoard, inline: false },
					{ name: `<@${loser}>'s Board`, value: loserBoard, inline: false }
				)
				.setTimestamp();
			
			battleship.deleteGame(interaction.channel.id);
			
			return interaction.reply({
				content: `<@${game.player1.id}> <@${game.player2.id}>`,
				embeds: [embed]
			});
		}
		
		// Start subcommand
		const opponent = interaction.options.getUser('opponent');
		
		// Validation checks
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
		
		// Check if there's already a game in this channel
		if (battleship.getGame(interaction.channel.id)) {
			return interaction.reply({
				content: '❌ There is already a game in progress in this channel!',
				flags: MessageFlags.Ephemeral
			});
		}
		
		// Create the game
		const game = battleship.createGame(interaction.user.id, opponent.id, interaction.channel.id);
		
		// Create accept/decline buttons
		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('battleship_accept')
					.setLabel('Accept Challenge')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId('battleship_decline')
					.setLabel('Decline')
					.setStyle(ButtonStyle.Danger)
			);
		
		const embed = new EmbedBuilder()
			.setColor('#0099ff')
			.setTitle('⚓ Battleship Challenge!')
			.setDescription(`${interaction.user} has challenged ${opponent} to a game of Battleship!\n\n**How to Play:**\n🚢 Each player has 5 ships placed randomly\n🎯 Take turns attacking coordinates\n💥 First to sink all enemy ships wins!\n\n${opponent}, do you accept?`)
			.setTimestamp();
		
		await interaction.reply({
			content: `${opponent}`,
			embeds: [embed],
			components: [row]
		});
		
		// Set timeout to auto-decline after 60 seconds
		setTimeout(() => {
			const currentGame = battleship.getGame(interaction.channel.id);
			if (currentGame && currentGame.phase === 'setup' && !currentGame.started) {
				battleship.deleteGame(interaction.channel.id);
				interaction.editReply({
					content: `⏰ Challenge expired - ${opponent} did not respond.`,
					embeds: [],
					components: []
				}).catch(() => {});
			}
		}, 60000);
	}
};

// Export handler for button interactions
module.exports.handleChallengeResponse = async function(interaction, accepted) {
	const game = battleship.getGame(interaction.channel.id);
	
	if (!game) {
		return interaction.reply({
			content: '❌ This game no longer exists.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	// Only the challenged player can accept/decline
	if (interaction.user.id !== game.player2.id) {
		return interaction.reply({
			content: '❌ Only the challenged player can respond!',
			flags: MessageFlags.Ephemeral
		});
	}
	
	if (!accepted) {
		battleship.deleteGame(interaction.channel.id);
		return interaction.update({
			content: `❌ ${interaction.user} declined the challenge.`,
			embeds: [],
			components: []
		});
	}
	
	// Game accepted - start ship placement phase
	game.started = true;
	game.client = interaction.client;
	
	await interaction.update({
		content: `✅ Challenge accepted! Both players will now place their ships via DM.`,
		embeds: [],
		components: []
	});
	
	// Send DM to both players for ship placement
	try {
		await sendShipPlacementDM(game.player1.id, game);
		await sendShipPlacementDM(game.player2.id, game);
	} catch (error) {
		console.error('Error sending ship placement DMs:', error);
		battleship.deleteGame(interaction.channel.id);
		await interaction.followUp({
			content: '❌ Could not send DMs to one or both players. Please enable DMs from server members.',
			components: []
		});
	}
};

module.exports.handleAttackButton = async function(interaction) {
	const game = battleship.getGame(interaction.channel.id);
	
	if (!game) {
		return interaction.reply({
			content: '❌ This game no longer exists.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	if (game.phase === 'ended') {
		return interaction.reply({
			content: '❌ This game has already ended.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	// Check if it's the user's turn
	if (interaction.user.id !== game.currentTurn) {
		return interaction.reply({
			content: '❌ It\'s not your turn!',
			flags: MessageFlags.Ephemeral
		});
	}
	
	// Set phase to selecting row
	game.phase = 'selecting_row';
	
	const embed = new EmbedBuilder()
		.setColor('#FFA500')
		.setTitle('🎯 Select Row (A-J)')
		.setDescription('Click a letter button to select the row you want to attack.');
	
	const rows = battleship.createAttackButtons();
	
	await interaction.reply({
		embeds: [embed],
		components: rows,
		flags: MessageFlags.Ephemeral
	});
};

module.exports.handleRowSelection = async function(interaction, rowIndex) {
	const game = battleship.getGame(interaction.channel.id);
	
	if (!game || game.phase !== 'selecting_row') {
		return interaction.reply({
			content: '❌ Invalid selection.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	if (interaction.user.id !== game.currentTurn) {
		return interaction.reply({
			content: '❌ It\'s not your turn!',
			flags: MessageFlags.Ephemeral
		});
	}
	
	// Store selected row
	const isPlayer1 = interaction.user.id === game.player1.id;
	const player = isPlayer1 ? game.player1 : game.player2;
	player.selectedRow = rowIndex;
	
	// Change phase to selecting column
	game.phase = 'selecting_col';
	
	// Get already attacked cells for this row
	const disabledCells = new Set();
	for (const [key, _] of player.attacks.entries()) {
		disabledCells.add(key);
	}
	
	const embed = new EmbedBuilder()
		.setColor('#FFA500')
		.setTitle('🎯 Select Column (0-9)')
		.setDescription(`Row: **${battleship.LETTERS[rowIndex]}**\n\nNow click a number button to select the column.\n\n🔘 = Already attacked`);
	
	const rows = battleship.createColumnButtons(disabledCells, rowIndex);
	
	await interaction.update({
		embeds: [embed],
		components: rows
	});
};

module.exports.handleColumnSelection = async function(interaction, colIndex) {
	const game = battleship.getGame(interaction.channel.id);
	
	if (!game || game.phase !== 'selecting_col') {
		return interaction.reply({
			content: '❌ Invalid selection.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	if (interaction.user.id !== game.currentTurn) {
		return interaction.reply({
			content: '❌ It\'s not your turn!',
			flags: MessageFlags.Ephemeral
		});
	}
	
	const isPlayer1 = interaction.user.id === game.player1.id;
	const player = isPlayer1 ? game.player1 : game.player2;
	const row = player.selectedRow;
	const col = colIndex;
	
	// Execute the attack
	const result = battleship.executeAttack(game, interaction.user.id, row, col);
	
	if (!result.success) {
		return interaction.update({
			content: `❌ ${result.reason}`,
			embeds: [],
			components: []
		});
	}
	
	// Save game state
	battleship.saveGames();
	
	// Reset selections
	game.phase = 'playing';
	player.selectedRow = null;
	
	// Check if this hit sunk a ship (only if it's a hit)
	let newlySunkShip = null;
	if (result.isHit) {
		// Get previous ship status before this attack
		const defender = isPlayer1 ? game.player2 : game.player1;
		const previousAttacks = new Map(player.attacks);
		previousAttacks.delete(`${row},${col}`); // Remove the current attack
		
		const previousShipStatus = battleship.getShipStatus(defender.board, previousAttacks);
		const currentShipStatus = result.shipStatus;
		
		// Find newly sunk ship by comparing
		for (let i = 0; i < currentShipStatus.length; i++) {
			if (currentShipStatus[i].sunk && !previousShipStatus[i].sunk) {
				newlySunkShip = currentShipStatus[i];
				break;
			}
		}
	}
	
	let resultText = result.isHit 
		? `💥 **HIT!** at ${result.position}` 
		: `💨 **MISS!** at ${result.position}`;
	
	if (newlySunkShip) {
		resultText += `\n🚢 You sunk their ${newlySunkShip.emoji} **${newlySunkShip.name}**!`;
	}
	
	// Delete the ephemeral message
	await interaction.update({
		content: '✅ Attack executed!',
		embeds: [],
		components: []
	});
	
	// Get the main game message
	const channel = interaction.channel;
	
	if (result.hasWon) {
		// Game over
		const isPlayer1 = interaction.user.id === game.player1.id;
		const winner = isPlayer1 ? game.player1 : game.player2;
		const loser = isPlayer1 ? game.player2 : game.player1;
		
		// Award XP for win/loss
		const winXP = config.features?.xp?.gameXP?.battleship?.win || 250;
		const loseXP = Math.floor(winXP * 0.4); // Losers get 40% of win XP for Battleship (more complex game)
		
		try {
			await awardXP(winner.id, interaction.guild, winXP, 'Battleship win');
			await awardXP(loser.id, interaction.guild, loseXP, 'Battleship loss');
		} catch (error) {
			console.error('Error awarding XP:', error);
		}
		
		const winnerBoard = battleship.createBoardDisplay(winner.board, loser.attacks, false);
		const loserBoard = battleship.createBoardDisplay(loser.board, winner.attacks, false);
		
		const sunkShips = result.shipStatus.filter(s => s.sunk);
		const winEmbed = new EmbedBuilder()
			.setColor('#FFD700')
			.setTitle('🏆 Game Over!')
			.setDescription(`${resultText}\n\n**${interaction.user} wins!**\n\nAll enemy ships have been destroyed!`)
			.addFields(
				{ name: 'Ships Destroyed', value: sunkShips.map(s => `${s.emoji} ${s.name}`).join('\n') || 'None' },
				{ name: `<@${winner.id}>'s Board (Winner)`, value: winnerBoard, inline: false },
				{ name: `<@${loser.id}>'s Board`, value: loserBoard, inline: false }
			)
			.setTimestamp();
		
		battleship.deleteGame(interaction.channel.id);
		
		await channel.send({
			content: `<@${game.player1.id}> <@${game.player2.id}>`,
			embeds: [winEmbed]
		});
	} else {
		// Continue game
		const turnEmbed = new EmbedBuilder()
			.setColor(result.isHit ? '#ff0000' : '#00bfff')
			.setTitle('⚓ Battleship')
			.setDescription(`<@${interaction.user.id}> attacked ${result.position}\n${resultText}\n\n🎯 <@${game.currentTurn}>'s turn!`)
			.setFooter({ text: 'Click "Select Target" to attack | Use /battleshipboard to see boards' })
			.setTimestamp();
		
		const attackRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('battleship_attack')
					.setLabel('Select Target')
					.setStyle(ButtonStyle.Primary)
					.setEmoji('🎯'),
				new ButtonBuilder()
					.setCustomId('battleship_show_board')
					.setLabel('Show Board')
					.setStyle(ButtonStyle.Secondary)
					.setEmoji('📋')
			);
		
		await channel.send({
			embeds: [turnEmbed],
			components: [attackRow]
		});
	}
};

module.exports.handleToggleOrientation = async function(interaction, game) {
	const isPlayer1 = interaction.user.id === game.player1.id;
	const isPlayer2 = interaction.user.id === game.player2.id;
	
	if (!isPlayer1 && !isPlayer2) {
		return interaction.reply({
			content: '❌ You are not in this game.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	const player = isPlayer1 ? game.player1 : game.player2;
	
	if (player.setupComplete) {
		return interaction.reply({
			content: '❌ You have already finished placing your ships.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	// Toggle orientation
	player.horizontal = !player.horizontal;
	
	const currentShip = battleship.SHIPS[player.currentShipIndex];
	
	const embed = new EmbedBuilder()
		.setColor('#0099ff')
		.setTitle('⚓ Ship Placement')
		.setDescription(`Place your **${currentShip.emoji} ${currentShip.name}** (${currentShip.size} cells)\n\n` +
			`**Your Board:**\n${battleship.createBoardDisplay(player.board, new Map(), false)}\n\n` +
			`**Orientation:** ${player.horizontal ? 'Horizontal ➡️' : 'Vertical ⬇️'}\n` +
			`Ships placed: ${player.placedShips.length}/${battleship.SHIPS.length}`)
		.setFooter({ text: 'Click buttons below to place your ship' });
	
	const orientationRow = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('battleship_toggle_orientation')
				.setLabel(player.horizontal ? 'Switch to Vertical ⬇️' : 'Switch to Horizontal ➡️')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId('battleship_random_ships')
				.setLabel('Auto-Place Remaining Ships')
				.setStyle(ButtonStyle.Primary)
				.setEmoji('🎲')
		);
	
	const placeRow = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('battleship_place_ship')
				.setLabel('Select Position')
				.setStyle(ButtonStyle.Success)
				.setEmoji('📍')
		);
	
	await interaction.update({
		embeds: [embed],
		components: [orientationRow, placeRow]
	});
};

module.exports.handleRandomShips = async function(interaction, game) {
	const isPlayer1 = interaction.user.id === game.player1.id;
	const isPlayer2 = interaction.user.id === game.player2.id;
	
	if (!isPlayer1 && !isPlayer2) {
		return interaction.reply({
			content: '❌ You are not in this game.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	const player = isPlayer1 ? game.player1 : game.player2;
	
	if (player.setupComplete) {
		return interaction.reply({
			content: '❌ You have already finished placing your ships.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	// Auto-place remaining ships
	player.board = battleship.placeShipsRandomly();
	player.setupComplete = true;
	player.placedShips = [...battleship.SHIPS];
	
	const embed = new EmbedBuilder()
		.setColor('#00ff00')
		.setTitle('⚓ Ships Placed!')
		.setDescription(`All ships have been randomly placed!\n\n**Your Board:**\n${battleship.createBoardDisplay(player.board, new Map(), false)}\n\nWaiting for opponent to finish...`)
		.setTimestamp();
	
	await interaction.update({
		embeds: [embed],
		components: []
	});
	
	// Check if both players are ready
	await checkBothPlayersReady(game, game.channelId);
};

module.exports.handlePlaceShipButton = async function(interaction, game) {
	const isPlayer1 = interaction.user.id === game.player1.id;
	const isPlayer2 = interaction.user.id === game.player2.id;
	
	if (!isPlayer1 && !isPlayer2) {
		return interaction.reply({
			content: '❌ You are not in this game.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	const player = isPlayer1 ? game.player1 : game.player2;
	
	if (player.setupComplete) {
		return interaction.reply({
			content: '❌ You have already finished placing your ships.',
			flags: MessageFlags.Ephemeral
		});
	}
	
	// Show row selection
	player.placementPhase = 'selecting_row';
	
	const currentShip = battleship.SHIPS[player.currentShipIndex];
	
	const embed = new EmbedBuilder()
		.setColor('#FFA500')
		.setTitle('📍 Select Row (A-J)')
		.setDescription(`Placing: **${currentShip.emoji} ${currentShip.name}** (${currentShip.size} cells)\n` +
			`Orientation: ${player.horizontal ? 'Horizontal ➡️' : 'Vertical ⬇️'}`);
	
	const rows = battleship.createAttackButtons();
	
	await interaction.update({
		embeds: [embed],
		components: rows
	});
};

module.exports.handlePlacementRowSelection = async function(interaction, rowIndex, game) {
	const isPlayer1 = interaction.user.id === game.player1.id;
	const isPlayer2 = interaction.user.id === game.player2.id;
	
	if (!isPlayer1 && !isPlayer2) return;
	
	const player = isPlayer1 ? game.player1 : game.player2;
	
	if (player.placementPhase !== 'selecting_row') return;
	
	player.selectedRow = rowIndex;
	player.placementPhase = 'selecting_col';
	
	const currentShip = battleship.SHIPS[player.currentShipIndex];
	
	const embed = new EmbedBuilder()
		.setColor('#FFA500')
		.setTitle('📍 Select Column (0-9)')
		.setDescription(`Placing: **${currentShip.emoji} ${currentShip.name}** (${currentShip.size} cells)\n` +
			`Row: **${battleship.LETTERS[rowIndex]}**\n` +
			`Orientation: ${player.horizontal ? 'Horizontal ➡️' : 'Vertical ⬇️'}`);
	
	const rows = battleship.createColumnButtons();
	
	await interaction.update({
		embeds: [embed],
		components: rows
	});
};

module.exports.handlePlacementColumnSelection = async function(interaction, colIndex, game) {
	const isPlayer1 = interaction.user.id === game.player1.id;
	const isPlayer2 = interaction.user.id === game.player2.id;
	
	if (!isPlayer1 && !isPlayer2) return;
	
	const player = isPlayer1 ? game.player1 : game.player2;
	
	if (player.placementPhase !== 'selecting_col') return;
	
	const row = player.selectedRow;
	const col = colIndex;
	const currentShip = battleship.SHIPS[player.currentShipIndex];
	
	// Try to place the ship
	if (!battleship.canPlaceShip(player.board, row, col, currentShip.size, player.horizontal)) {
		return interaction.update({
			content: '❌ Cannot place ship here! Try a different position.',
			embeds: [],
			components: []
		}).then(() => {
			setTimeout(() => sendShipPlacementDM(interaction.user.id, game), 1000);
		});
	}
	
	// Place the ship
	battleship.placeShip(player.board, row, col, currentShip.size, player.horizontal, player.currentShipIndex + 1);
	player.currentShipIndex++;
	player.placementPhase = null;
	player.selectedRow = null;
	
	// Check if all ships are placed
	if (player.currentShipIndex >= battleship.SHIPS.length) {
		player.setupComplete = true;
		
		// Save game state
		battleship.saveGames();
		
		const embed = new EmbedBuilder()
			.setColor('#00ff00')
			.setTitle('⚓ All Ships Placed!')
			.setDescription(`**Your Board:**\n${battleship.createBoardDisplay(player.board, new Map(), false)}\n\nWaiting for opponent to finish...`)
			.setTimestamp();
		
		await interaction.update({
			embeds: [embed],
			components: []
		});
		
		// Check if both players are ready
		await checkBothPlayersReady(game, game.channelId);
	} else {
		// Continue to next ship
		await interaction.update({
			content: `✅ ${currentShip.emoji} ${currentShip.name} placed!`,
			embeds: [],
			components: []
		});
		
		setTimeout(() => sendShipPlacementDM(interaction.user.id, game), 1000);
	}
};

