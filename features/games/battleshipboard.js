const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const battleship = require('./battleship/battleship');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('battleshipboard')
		.setDescription('View your Battleship board'),

	async execute(interaction) {
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
		
		const player = isPlayer1 ? game.player1 : game.player2;
		const opponent = isPlayer1 ? game.player2 : game.player1;
		
		// Get ship status
		const yourShipStatus = battleship.getShipStatus(player.board, opponent.attacks);
		const enemyShipStatus = battleship.getShipStatus(opponent.board, player.attacks);
		
		// Count sunk enemy ships
		const sunkCount = enemyShipStatus.filter(s => s.sunk).length;
		
		// Create board displays
		const yourBoard = battleship.createBoardDisplay(player.board, opponent.attacks, false);
		const enemyBoard = battleship.createBoardDisplay(opponent.board, player.attacks, true);
		
		const embed = new EmbedBuilder()
			.setColor('#0099ff')
			.setTitle('⚓ Your Battleship Board')
			.setDescription('**Your Fleet:**\n' + yourBoard)
			.addFields(
				{
					name: 'Your Ships',
					value: yourShipStatus.map(s => 
						`${s.sunk ? '💀' : s.emoji} ${s.name}: ${s.hits}/${s.size} ${s.sunk ? '(SUNK)' : ''}`
					).join('\n'),
					inline: true
				},
				{
					name: 'Enemy Ships Sunk',
					value: `${sunkCount}/${battleship.SHIPS.length} ships destroyed\n\n` +
						enemyShipStatus.filter(s => s.sunk).map(s => `💀 ${s.name}`).join('\n') || 'None sunk yet',
					inline: true
				},
				{
					name: 'Enemy Waters (Your Attacks)',
					value: enemyBoard,
					inline: false
				}
			)
			.setFooter({ text: '🌊 Water | 🚢 Ship | 💥 Hit | 💨 Miss' })
			.setTimestamp();
		
		await interaction.reply({
			embeds: [embed],
			flags: MessageFlags.Ephemeral
		});
	}
};
