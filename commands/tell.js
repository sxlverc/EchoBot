const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, EmbedBuilder, Colors } = require('discord.js');
const getConfig = require('../configHelper');

function resolveTellLogUserId(config, interaction) {
	// Per-guild override support in config.json -> users.tellLogUserId
	const configuredUserId = config?.raw?.users?.tellLogUserId;
	if (configuredUserId && configuredUserId !== 'your_tell_log_user_id') {
		return configuredUserId;
	}

	// Fallback to guild owner so each guild logs independently by default
	return interaction.guild?.ownerId || null;
}

async function logTellUsage(interaction, message) {
	const config = getConfig(interaction.guildId);
	const targetUserId = resolveTellLogUserId(config, interaction);
	if (!targetUserId) {
		return;
	}

	try {
		const user = interaction.user;
		const client = interaction.client;
		const targetUser = await client.users.fetch(targetUserId);

		const embed = new EmbedBuilder()
			.setTitle('📢 /tell Command Used')
			.setColor(Colors.Yellow)
			.setAuthor({
				name: user.tag,
				iconURL: user.displayAvatarURL()
			})
			.addFields(
				{ name: 'User', value: `${user} (${user.id})`, inline: true },
				{ name: 'Server', value: interaction.guild?.name || 'Unknown', inline: true },
				{ name: 'Channel', value: interaction.channel?.name || 'Unknown', inline: true },
				{ name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
				{ name: 'Message Sent', value: message.length > 1024 ? message.substring(0, 1021) + '...' : message }
			)
			.setTimestamp();

		await targetUser.send({ embeds: [embed] });
	} catch (error) {
		console.error('Error logging /tell usage:', error);
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('tell')
		.setDescription('Yip Yap')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const config = getConfig(interaction.guildId);

		// Check if user has privileged executor role or admin permissions
		if (!config.isPrivilegedExecutor(interaction.member)) {
			return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
		}

		// Create modal
		const modal = new ModalBuilder()
			.setCustomId('tellModal')
			.setTitle('Make the bot speak');

		const messageInput = new TextInputBuilder()
			.setCustomId('messageInput')
			.setLabel('What should the bot say?')
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true)
			.setMaxLength(2000);

		const messageIdInput = new TextInputBuilder()
			.setCustomId('messageIdInput')
			.setLabel('Message ID to reply to (optional)')
			.setStyle(TextInputStyle.Short)
			.setRequired(false)
			.setPlaceholder('Leave blank to send without replying');

		const messageRow = new ActionRowBuilder().addComponents(messageInput);
		const messageIdRow = new ActionRowBuilder().addComponents(messageIdInput);
		modal.addComponents(messageRow, messageIdRow);

		await interaction.showModal(modal);
	},
	async handleModalSubmit(interaction) {
		const message = interaction.fields.getTextInputValue('messageInput');
		const messageId = interaction.fields.getTextInputValue('messageIdInput') || null;

		try {
			let replyOptions = { content: message };

			if (messageId) {
				// Try to fetch the message to reply to
				try {
					const targetMessage = await interaction.channel.messages.fetch(messageId);
					replyOptions = { content: message, reply: { messageReference: targetMessage.id } };
				} catch (error) {
					console.warn('Could not fetch message to reply to:', error.message);
					// Continue without replying
				}
			}

			await interaction.channel.send(replyOptions);

			// Log the usage
			await logTellUsage(interaction, message);

			await interaction.reply({ content: 'Message sent!', flags: MessageFlags.Ephemeral });
		} catch (error) {
			console.error('Error sending message:', error);
			await interaction.reply({ content: 'Failed to send the message.', flags: MessageFlags.Ephemeral });
		}
	},
	logTellUsage
};
