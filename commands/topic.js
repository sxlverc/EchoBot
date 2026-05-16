const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

const topicsDataPath = path.join(__dirname, '../data/topicsData.json');

// Initialize topics data file
function initTopicsData() {
    if (!fs.existsSync(topicsDataPath)) {
        const defaultTopics = [
            { topic: "If you could have dinner with any historical figure, who would it be and why?", author: "Cackle Crew Bot" },
            { topic: "What's the most interesting place you've ever visited?", author: "Cackle Crew Bot" },
            { topic: "If you could master any skill instantly, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's your favorite childhood memory?", author: "Cackle Crew Bot" },
            { topic: "If you could live in any time period, past or future, when would it be?", author: "Cackle Crew Bot" },
            { topic: "What's the best piece of advice you've ever received?", author: "Cackle Crew Bot" },
            { topic: "If you could have any superpower, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's your favorite book or movie and why?", author: "Cackle Crew Bot" },
            { topic: "If you could create a new holiday, what would it celebrate?", author: "Cackle Crew Bot" },
            { topic: "What's something you're passionate about that most people don't know?", author: "Cackle Crew Bot" },
            { topic: "If you could switch lives with anyone for a day, who would it be?", author: "Cackle Crew Bot" },
            { topic: "What's the most adventurous thing you've ever done?", author: "Cackle Crew Bot" },
            { topic: "If you could instantly learn any language, which would you choose?", author: "Cackle Crew Bot" },
            { topic: "What's your dream job, even if it seems impossible?", author: "Cackle Crew Bot" },
            { topic: "If you could change one thing about the world, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's the best concert or live event you've been to?", author: "Cackle Crew Bot" },
            { topic: "If you could have a conversation with your future self, what would you ask?", author: "Cackle Crew Bot" },
            { topic: "What's something you've always wanted to try but haven't yet?", author: "Cackle Crew Bot" },
            { topic: "If you could be famous for something, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's your favorite way to spend a lazy Sunday?", author: "Cackle Crew Bot" },
            { topic: "If you could bring back any extinct animal, which would you choose?", author: "Cackle Crew Bot" },
            { topic: "What's the most memorable gift you've ever received?", author: "Cackle Crew Bot" },
            { topic: "If you had unlimited money for one day, what would you do?", author: "Cackle Crew Bot" },
            { topic: "What's a skill you have that most people wouldn't guess?", author: "Cackle Crew Bot" },
            { topic: "If you could redesign the human body, what would you change?", author: "Cackle Crew Bot" },
            { topic: "What's the weirdest food combination you actually enjoy?", author: "Cackle Crew Bot" },
            { topic: "If you could be the best in the world at something, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's a conspiracy theory you find interesting, even if you don't believe it?", author: "Cackle Crew Bot" },
            { topic: "If you could have any fictional character as a best friend, who would it be?", author: "Cackle Crew Bot" },
            { topic: "What's your favorite season and why?", author: "Cackle Crew Bot" },
            { topic: "If you could eliminate one thing from daily life, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's the most beautiful place you've ever seen?", author: "Cackle Crew Bot" },
            { topic: "If you could star in any TV show or movie, which would you choose?", author: "Cackle Crew Bot" },
            { topic: "What's something you believed as a child that turned out to be wrong?", author: "Cackle Crew Bot" },
            { topic: "If you could invent something, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's your go-to karaoke song?", author: "Cackle Crew Bot" },
            { topic: "If you could have any animal as a pet (assuming it was safe), what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's the best meal you've ever had?", author: "Cackle Crew Bot" },
            { topic: "If you could relive one day of your life, which day would it be?", author: "Cackle Crew Bot" },
            { topic: "What's something you're really good at that you never get to show off?", author: "Cackle Crew Bot" },
            { topic: "If you could add a room to your house, what would it be for?", author: "Cackle Crew Bot" },
            { topic: "What's the most interesting documentary you've watched?", author: "Cackle Crew Bot" },
            { topic: "If you could time travel but only once, where and when would you go?", author: "Cackle Crew Bot" },
            { topic: "What's your favorite family tradition?", author: "Cackle Crew Bot" },
            { topic: "If you could have a theme song play whenever you enter a room, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's the strangest dream you've ever had?", author: "Cackle Crew Bot" },
            { topic: "If you could instantly become an expert in any hobby, which would you choose?", author: "Cackle Crew Bot" },
            { topic: "What's the best prank you've ever pulled or seen?", author: "Cackle Crew Bot" },
            { topic: "If you could create a new flavor of ice cream, what would it be?", author: "Cackle Crew Bot" },
            { topic: "What's something that always makes you laugh, no matter what?", author: "Cackle Crew Bot" }
        ];
        fs.writeFileSync(topicsDataPath, JSON.stringify(defaultTopics, null, 2));
    }
}

// Load topics from file
function loadTopics() {
    initTopicsData();
    try {
        return JSON.parse(fs.readFileSync(topicsDataPath, 'utf8'));
    } catch {
        return [];
    }
}

// Save topics to file
function saveTopics(topics) {
    fs.writeFileSync(topicsDataPath, JSON.stringify(topics, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('topic')
        .setDescription('Manage conversation topics')
        .addSubcommand(subcommand =>
            subcommand
                .setName('get')
                .setDescription('Get a random conversation topic'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new conversation topic')
                .addStringOption(option =>
                    option
                        .setName('topic')
                        .setDescription('The topic question to add')
                        .setRequired(true)
                        .setMaxLength(500))),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'get') {
            const topics = loadTopics();
            
            if (topics.length === 0) {
                return await interaction.reply({
                    content: '❌ No topics available!',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const randomTopic = topics[Math.floor(Math.random() * topics.length)];
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setAuthor({ 
                    name: `${interaction.client.user.username} Asks`,
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setDescription(randomTopic.topic)
                .setFooter({ 
                    text: `Topic written by ${randomTopic.author} • Add a topic using /topic add • ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                });
            
            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'add') {
            const newTopic = interaction.options.getString('topic');
            const topics = loadTopics();
            
            // Check for duplicate
            if (topics.some(t => t.topic.toLowerCase() === newTopic.toLowerCase())) {
                return await interaction.reply({
                    content: '❌ This topic already exists!',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // Add the new topic
            topics.push({
                topic: newTopic,
                author: interaction.user.username
            });
            
            saveTopics(topics);
            
            await interaction.reply({
                content: `✅ Topic added! You'll be credited when it appears.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};