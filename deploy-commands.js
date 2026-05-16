const { REST, Routes } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;

if (!clientId || !guildId || !token) {
    console.error('Missing required environment variables: CLIENT_ID, GUILD_ID, DISCORD_TOKEN');
    process.exit(1);
}

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    // Handle both single commands and arrays of commands
    if (Array.isArray(command.data)) {
        for (const data of command.data) {
            commands.push(data.toJSON());
        }
    } else {
        commands.push(command.data.toJSON());
    }
}

// Add game commands
const gameCommands = ['battleship', 'battleshipboard', 'tictactoe', 'connect4'];
for (const game of gameCommands) {
    const gamePath = `./features/games/${game}.js`;
    if (fs.existsSync(gamePath)) {
        const command = require(gamePath);
        commands.push(command.data.toJSON());
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);

    } catch (error) {
        console.error('Deployment error:', error);
        if (error.rawError) {
            console.error('Raw error:', error.rawError);
        }
    }
})();