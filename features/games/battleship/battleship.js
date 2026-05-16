const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../../data/battleshipGames.json');

// Active games: Map<channelId, gameState>
const activeGames = new Map();

function saveGames() {
	try {
		const dir = path.dirname(dataPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		const gamesToSave = {};
		for (const [channelId, game] of activeGames.entries()) {
			gamesToSave[channelId] = {
				...game,
				client: undefined, // Don't save client reference
				player1: {
					...game.player1,
					attacks: Array.from(game.player1.attacks.entries())
				},
				player2: {
					...game.player2,
					attacks: Array.from(game.player2.attacks.entries())
				}
			};
		}
		fs.writeFileSync(dataPath, JSON.stringify({ games: gamesToSave }, null, 2));
	} catch (error) {
		console.error('Error saving battleship games:', error);
	}
}

function loadGames(client) {
	try {
		console.log('Battleship loading from:', dataPath);
		if (!fs.existsSync(dataPath)) {
			console.log('No battleship save file found, starting fresh');
			return;
		}
		const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
		for (const [channelId, gameData] of Object.entries(data.games)) {
			const game = {
				...gameData,
				client: client,
				player1: {
					...gameData.player1,
					attacks: new Map(gameData.player1.attacks)
				},
				player2: {
					...gameData.player2,
					attacks: new Map(gameData.player2.attacks)
				}
			};
			activeGames.set(channelId, game);
		}
		console.log(`Loaded ${activeGames.size} battleship game(s)`);
	} catch (error) {
		console.error('Error loading battleship games:', error);
	}
}

// Ship definitions
const SHIPS = [
	{ name: 'Carrier', size: 5, emoji: '🚢' },
	{ name: 'Battleship', size: 4, emoji: '⛴️' },
	{ name: 'Cruiser', size: 3, emoji: '🛳️' },
	{ name: 'Submarine', size: 3, emoji: '🚤' },
	{ name: 'Destroyer', size: 2, emoji: '⛵' }
];

const GRID_SIZE = 10;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// Cell states
const CELL_EMPTY = '🌊';
const CELL_SHIP = '🚢';
const CELL_HIT = '💥';
const CELL_MISS = '💨';

function createEmptyBoard() {
	return Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));
}

function canPlaceShip(board, row, col, size, horizontal) {
	if (horizontal) {
		if (col + size > GRID_SIZE) return false;
		for (let i = 0; i < size; i++) {
			if (board[row][col + i] !== 0) return false;
		}
	} else {
		if (row + size > GRID_SIZE) return false;
		for (let i = 0; i < size; i++) {
			if (board[row + i][col] !== 0) return false;
		}
	}
	return true;
}

function placeShip(board, row, col, size, horizontal, shipId) {
	if (horizontal) {
		for (let i = 0; i < size; i++) {
			board[row][col + i] = shipId;
		}
	} else {
		for (let i = 0; i < size; i++) {
			board[row + i][col] = shipId;
		}
	}
}

function placeShipsRandomly() {
	const board = createEmptyBoard();
	
	for (let shipId = 1; shipId <= SHIPS.length; shipId++) {
		const ship = SHIPS[shipId - 1];
		let placed = false;
		
		while (!placed) {
			const horizontal = Math.random() < 0.5;
			const row = Math.floor(Math.random() * GRID_SIZE);
			const col = Math.floor(Math.random() * GRID_SIZE);
			
			if (canPlaceShip(board, row, col, ship.size, horizontal)) {
				placeShip(board, row, col, ship.size, horizontal, shipId);
				placed = true;
			}
		}
	}
	
	return board;
}

function createBoardDisplay(board, attacks, hideShips = false) {
	let display = '```\n    ';
	
	// Column numbers
	for (let i = 0; i < GRID_SIZE; i++) {
		display += ` ${i} `;
		if (i === 2 || i === 6) display += ' ';
	}
	display += '\n';
	
	// Rows with data
	for (let row = 0; row < GRID_SIZE; row++) {
		display += `${LETTERS[row]}  `;
		for (let col = 0; col < GRID_SIZE; col++) {
			const attackKey = `${row},${col}`;
			let emoji = '🌊';
			
			if (attacks.has(attackKey)) {
				emoji = attacks.get(attackKey) ? '💥' : '💨';
			} else if (!hideShips && board[row][col] !== 0) {
				emoji = '🚢';
			}
			
			display += ` ${emoji}`;
		}
		display += '\n';
	}
	
	display += '```';
	
	return display;
}

function createAttackButtons(disabledCells = new Set(), selectedRow = null) {
	const rows = [];
	
	// Create 5 rows with 2 letters each (A-B, C-D, E-F, G-H, I-J)
	for (let rowPair = 0; rowPair < 5; rowPair++) {
		const row = new ActionRowBuilder();
		
		for (let letter = rowPair * 2; letter < (rowPair * 2) + 2; letter++) {
			const btn = new ButtonBuilder()
				.setCustomId(`battleship_row_${letter}`)
				.setLabel(LETTERS[letter])
				.setStyle(selectedRow === letter ? ButtonStyle.Success : ButtonStyle.Primary)
				.setDisabled(false);
			row.addComponents(btn);
		}
		
		rows.push(row);
	}
	
	return rows;
}

function createColumnButtons(disabledCells = new Set(), selectedRow = null) {
	const rows = [];
	
	// Create 2 rows with 5 numbers each
	for (let rowNum = 0; rowNum < 2; rowNum++) {
		const row = new ActionRowBuilder();
		
		for (let col = rowNum * 5; col < (rowNum * 5) + 5; col++) {
			const isDisabled = selectedRow !== null && disabledCells.has(`${selectedRow},${col}`);
			const btn = new ButtonBuilder()
				.setCustomId(`battleship_col_${col}`)
				.setLabel(`${col}`)
				.setStyle(isDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
				.setDisabled(isDisabled);
			row.addComponents(btn);
		}
		
		rows.push(row);
	}
	
	return rows;
}

function checkWin(board, attacks) {
	// Check if all ship cells are hit
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			if (board[row][col] !== 0) {
				const attackKey = `${row},${col}`;
				if (!attacks.has(attackKey) || !attacks.get(attackKey)) {
					return false;
				}
			}
		}
	}
	return true;
}

function getShipStatus(board, attacks) {
	const shipStatus = SHIPS.map((ship, index) => ({
		name: ship.name,
		emoji: ship.emoji,
		size: ship.size,
		hits: 0,
		sunk: false
	}));
	
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			const shipId = board[row][col];
			if (shipId > 0) {
				const attackKey = `${row},${col}`;
				if (attacks.has(attackKey) && attacks.get(attackKey)) {
					shipStatus[shipId - 1].hits++;
				}
			}
		}
	}
	
	// Mark ships as sunk
	shipStatus.forEach(ship => {
		ship.sunk = ship.hits === ship.size;
	});
	
	return shipStatus;
}

module.exports = {
	activeGames,
	SHIPS,
	GRID_SIZE,
	LETTERS,
	
	createGame(player1Id, player2Id, channelId) {
		const game = {
			player1: {
				id: player1Id,
				board: createEmptyBoard(),
				attacks: new Map(),
				selectedRow: null,
				selectedCol: null,
				placedShips: [],
				currentShipIndex: 0,
				horizontal: true,
				setupComplete: false
			},
			player2: {
				id: player2Id,
				board: createEmptyBoard(),
				attacks: new Map(),
				selectedRow: null,
				selectedCol: null,
				placedShips: [],
				currentShipIndex: 0,
				horizontal: true,
				setupComplete: false
			},
			currentTurn: player1Id,
			phase: 'setup', // 'setup', 'playing', 'selecting_row', 'selecting_col', 'ended'
			channelId: channelId,
			startTime: Date.now()
		};
		
		activeGames.set(channelId, game);
		saveGames();
		return game;
	},
	
	getGame(channelId) {
		return activeGames.get(channelId);
	},
	
	deleteGame(channelId) {
		activeGames.delete(channelId);
		saveGames();
	},
	
	createBoardDisplay,
	createAttackButtons,
	createColumnButtons,
	checkWin,
	getShipStatus,
	canPlaceShip,
	placeShip,
	placeShipsRandomly,
	saveGames,
	loadGames,
	
	executeAttack(game, attackerId, row, col) {
		// Determine which player is attacking
		const isPlayer1 = attackerId === game.player1.id;
		const attacker = isPlayer1 ? game.player1 : game.player2;
		const defender = isPlayer1 ? game.player2 : game.player1;
		
		const attackKey = `${row},${col}`;
		
		// Check if already attacked
		if (attacker.attacks.has(attackKey)) {
			return { success: false, reason: 'Already attacked this position' };
		}
		
		// Execute attack
		const isHit = defender.board[row][col] !== 0;
		attacker.attacks.set(attackKey, isHit);
		
		// Check for win
		const hasWon = checkWin(defender.board, attacker.attacks);
		
		if (hasWon) {
			game.phase = 'ended';
		} else {
			// Switch turns
			game.currentTurn = isPlayer1 ? game.player2.id : game.player1.id;
		}
		
		return {
			success: true,
			isHit: isHit,
			hasWon: hasWon,
			position: `${LETTERS[row]}${col}`,
			shipStatus: getShipStatus(defender.board, attacker.attacks)
		};
	}
};
